import { Component, OnInit, Input, ViewChild, SimpleChanges, SimpleChange, ElementRef, OnChanges } from '@angular/core';
import { SwiperComponent } from 'ngx-swiper-wrapper';
import { TtrssClientService } from '../ttrss-client.service';

@Component({
  selector: 'ttrss-article',
  templateUrl: './article.component.html',
  styleUrls: ['./article.component.css']
})
export class ArticleComponent implements OnInit, OnChanges {

  @Input() article: Headline;
  @Input() selected: boolean;
  @Input() feed: ICategory;
  @Input() multiSelectEnabled: boolean;
  @ViewChild(SwiperComponent) componentRef: SwiperComponent;

  constructor(private client: TtrssClientService, private artElement: ElementRef) { }

  ngOnInit() {
  }

  elementSwiped(index: number) {
    if (index !== 1) {
      if (index === 0) {
        this.client.updateArticle(this.article, 2, 2).subscribe(result => {
          if (result) {
            this.article.unread = !this.article.unread;
          }
        });
      } else {
        this.client.updateArticle(this.article, 0, 2).subscribe(result => {
          if (result) {
            this.article.marked = !this.article.marked;
          }
        });
      }
    }
    this.componentRef.directiveRef.setIndex(1);
    if (index !== 1) {
      this.componentRef.directiveRef.setIndex(1);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    const multiSelectEnabled: SimpleChange = changes.multiSelectEnabled;
    if (multiSelectEnabled !== undefined) {
      this.multiSelectEnabled = multiSelectEnabled.currentValue;
      if (this.componentRef !== undefined) {
        this.componentRef.directiveRef.update();
      }
    }
  }

  showFeedIcons() {
    return this.feed.bare_id < 0 || this.feed.type === 'category';
  }
}
