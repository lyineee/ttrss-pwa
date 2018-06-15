import { ChangeDetectorRef, Component, OnInit, ViewChild, OnDestroy, NgZone } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { TtrssClientService } from '../ttrss-client.service';
import { Observable, Subscription, observable, of } from 'rxjs';
import { ObservableMedia, MediaChange } from '@angular/flex-layout';
import { MatSidenav, MatDialog, MatToolbar, MatSidenavContent, MatTreeNestedDataSource } from '@angular/material';
import { MarkreaddialogComponent } from '../markreaddialog/markreaddialog.component';
import { ScrollToService, ScrollToConfigOptions } from '@nicky-lenaers/ngx-scroll-to';
import { CounterResult } from '../model/counter-result';
import { SettingsService } from '../settings.service';
import { TranslateService } from '@ngx-translate/core';
import { Title } from '@angular/platform-browser';
import { NestedTreeControl } from '@angular/cdk/tree';
@Component({
  selector: 'ttrss-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class OverviewComponent implements OnInit, OnDestroy {

  @ViewChild('snav') public snav: MatSidenav;
  @ViewChild('feedtoolbar') public feedtoolbar: MatToolbar;

  nestedTreeControl: NestedTreeControl<ICategory>;
  nestedDataSource: MatTreeNestedDataSource<ICategory>;

  scrollContainer: HTMLElement;

  watcher: Subscription;
  activeMediaQuery = '';
  isMobile = false;

  counters: CounterResult[];
  selectedFeed: ICategory;
  is_cat = false;
  multiSelectEnabled = false;
  headlines: Headline[] = [];
  multiSelectedHeadlines: Headline[] = [];
  selectedHeadline: Headline;
  fetch_more = true;

  private _mobileQueryListener: () => void;

  constructor(private _scrollToService: ScrollToService, media: ObservableMedia, public dialog: MatDialog,
    private client: TtrssClientService, private settings: SettingsService,
    private translate: TranslateService, private titleService: Title, private ngZone: NgZone) {
    this.watcher = media.subscribe((change: MediaChange) => {
      this.activeMediaQuery = change ? `'${change.mqAlias}' = (${change.mediaQuery})` : '';
      if (change.mqAlias === 'sm' || change.mqAlias === 'xs') {
        this.isMobile = true;
      } else {
        this.isMobile = false;
      }
    });
    this.nestedDataSource = new MatTreeNestedDataSource<ICategory>();
    this.nestedTreeControl = new NestedTreeControl<ICategory>(this._getChildren);
  }

  private _getChildren = (node: ICategory) => {
    return of(node.items);
  }

  hasNestedChild = (_: number, nodeData: ICategory) => {
    return nodeData.type === 'category';
  }

  onSelect(feed: ICategory) {
    if (this.isMobile) {
      this.snav.close();
    }
    this.selectedFeed = feed;
    this.headlines = [];
    this.fetch_more = true;
    this._scrollToService.scrollTo({
      target: 'feedtoolbar',
      duration: 0
    });
    this.is_cat = this.selectedFeed.type === 'category';
    this.settings.lastFeedId = feed.bare_id;
    this.settings.lastSelectionIsCat = this.is_cat;
    this.client.getHeadlines(this.selectedFeed, 20, 0, null, this.is_cat)
      .subscribe(data =>
        this.headlines = data);
    this.selectedHeadline = null;
    this.multiSelectedHeadlines.length = 0;
    this.multiSelectEnabled = false;
  }

  ngOnDestroy(): void {
    this.watcher.unsubscribe();
  }

  ngOnInit() {
    this.scrollContainer = document.getElementById('feedView');

    this.refreshCounters();
    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        this.ngZone.run(() => {
          this.refreshCounters();
        });
      }, 60000);
    });
    this.client.getFeedTree().subscribe(
      data => {
        this.nestedDataSource.data = data;
        this.initLastFeed();
      }
    );
  }

  initLastFeed(): void {
    const selId = this.settings.lastFeedId;
    const isCat = this.settings.lastSelectionIsCat;
    const foundFeed: ICategory = this.recursiveFindICategory(this.nestedDataSource.data, selId, isCat);
    if (foundFeed !== null) {
      this.onSelect(foundFeed);
    }
  }

  recursiveFindICategory(cats: ICategory[], id: number, is_cat: boolean): ICategory {
    for (const cat of cats) {
      if (is_cat && cat.type === 'category' || !is_cat && cat.type !== 'category') {
        if (cat.bare_id === id) {
          return cat;
        }
      }
      if (cat.type === 'category') {
        const sub = this.recursiveFindICategory(cat.items, id, is_cat);
        if (sub !== null) {
          return sub;
        }
      }
    }
    return null;
  }

  refreshCounters() {
    this.client.updateCounters().subscribe(data => {
      this.counters = data;
      const fresh = this.counters.find(cnt => cnt.id === '-3' && !cnt.kind);
      if (fresh) {
        let prefix = '';
        if (fresh.counter > 0) {
          prefix = '(' + fresh.counter + ') ';
        }
        this.translate.get('title').subscribe(result => this.titleService.setTitle(prefix + result));
      }
    }
    );
  }

  loadHeadlines() {
    if (this.fetch_more) {
      let skip = this.headlines.length;
      if (this.selectedFeed.bare_id === -3) {
        skip = this.headlines.filter(h => h.unread).length;
      } else if (this.selectedFeed.bare_id === -1) {
        skip = this.headlines.filter(h => h.marked).length;
      }
      // probably we need more logic here.
      this.client.getHeadlines(this.selectedFeed, 20, skip, null, this.is_cat)
        .subscribe(data => {
          if (data.length === 0) {
            this.fetch_more = false;
          } else {
            this.headlines.push(...data);
          }
        });
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  onArticleSelect(headline: Headline) {
    if (!this.multiSelectEnabled) {
      if (headline !== this.selectedHeadline) {
        this.selectedHeadline = null;
        if (!headline.content) {
          this.client.getArticle(headline.id).subscribe(article => headline.content = article.content);
        }

        this.selectedHeadline = headline;
        if (headline.unread) {
          this.updateSelected(2);
        }
        const config: ScrollToConfigOptions = {
          target: 'article' + headline.id,
          offset: -this.feedtoolbar._elementRef.nativeElement.offsetHeight,
          duration: 0
        };
        this.sleep(200).then(() => this._scrollToService.scrollTo(config));
      } else {
        this.selectedHeadline = null;
      }
    } else {
      const index = this.multiSelectedHeadlines.indexOf(headline);
      if (index < 0) {
        this.multiSelectedHeadlines.push(headline);
      } else {
        this.multiSelectedHeadlines.splice(index, 1);
      }
    }
  }
  catchupFeed() {
    const dialogRef = this.dialog.open(MarkreaddialogComponent);
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.client.catchupFeed(this.selectedFeed, this.is_cat).subscribe(success => {
          if (success) {
            this.headlines.forEach(head => head.unread = false);
            this.refreshCounters();
          }
        });
      }
    });
  }

  updateArticle(heads: Headline[], field: number, mode: number) {
    const feedOrCat = this.selectedFeed;
    const isCat = this.is_cat;
    if (heads.length === 0) {
      return;
    }
    this.client.updateArticle(heads, field, mode).subscribe(result => {
      if (result) {
        switch (field) {
          case 0:
            let amount = 0;
            heads.forEach(head => {
              switch (mode) {
                case 0:
                  if (head.marked) {
                    head.marked = false;
                    amount--;
                  }
                  break;
                case 1:
                  if (!head.marked) {
                    head.marked = true;
                    amount++;
                  }
                  break;
                default:
                  head.marked = !head.marked;
                  head.marked ? amount++ : amount--;
                  break;
              }
            });
            this.updateFavCounter(amount);
            break;
          case 2:
            let change = 0;
            heads.forEach(head => {
              switch (mode) {
                case 0:
                  if (head.unread) {
                    head.unread = false;
                    change--;
                  }
                  break;
                case 1:
                  if (!head.unread) {
                    head.unread = true;
                    change++;
                  }
                  break;
                default:
                  head.unread = !head.unread;
                  head.unread ? change++ : change--;
                  break;
              }
            });
            if (isCat) {
              this.updateReadCounters(change, null, feedOrCat.bare_id);
            } else {
              this.updateReadCounters(change, feedOrCat.bare_id, null);
            }
            break;
        }
      }
    });
  }

  updateSelected(field: number) {
    if (this.multiSelectEnabled) {
      this.updateArticle(this.multiSelectedHeadlines, field, 2);
    } else {
      let mode = 2;
      switch (field) {
        case 0:
          mode = this.selectedHeadline.marked ? 0 : 1;
          break;
        case 2:
          mode = this.selectedHeadline.unread ? 0 : 1;
          break;
      }

      this.updateArticle(new Array(this.selectedHeadline), field, mode);
    }
  }

  updateFavCounter(amount: number) {
    const cntResult: CounterResult = this.counters.find(cnt => cnt.id === '-1' && (!cnt.kind || cnt.kind !== 'cat'));
    if (cntResult) {
      cntResult.auxcounter += amount;
    }
  }

  updateReadCounters(amount: number, feedid: number, catid: number): void {
    const arr: string[] = [];
    if (feedid != null) {
      arr.push(feedid + '');
    }
    arr.push('-3');
    arr.push('-4');
    this.counters.forEach(cnt => {
      if (arr.includes(cnt.id) && (!cnt.kind || cnt.kind !== 'cat')
        || catid && catid + '' === cnt.id && cnt.kind === 'cat') {
        cnt.counter += amount;
      }
    });
  }

  multiselectChanged(checked: boolean) {
    this.multiSelectEnabled = checked;
    if (this.multiSelectEnabled) {
      this.selectedHeadline = null;
    } else {
      this.multiSelectedHeadlines.length = 0;
    }
  }

  inview(event) {
    if (this.settings.markReadOnScroll && !this.multiSelectEnabled) {
      let idx = 0;
      if (this.fetch_more && event.isClipped && !event.parts.top) {
        idx = this.headlines.indexOf(event.data) + 3;
      } else if (!this.fetch_more && event.status && this.headlines.indexOf(event.data) === this.headlines.length - 1) {
        idx = this.headlines.length;
      }
      if (idx > 0) {
        this.updateArticle(this.headlines.slice(0, idx).filter(h => h.unread), 2, 0);
      }
    }
  }
}
