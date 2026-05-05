import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { IonTabs } from '@ionic/angular';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements AfterViewInit, OnDestroy {

  @ViewChild('tabs') tabs!: IonTabs;

  private readonly tabOrder = ['tab1', 'tab5', 'tab2', 'tab3', 'tab4'];
  private currentTab: string = 'tab1';
  notifBadge = 0;

  private startX = 0;
  private startY = 0;
  private axisLocked: 'h' | 'v' | null = null;
  private outlet: HTMLElement | null = null;

  private boundStart = this.onStart.bind(this);
  private boundMove = this.onMove.bind(this);
  private boundEnd = this.onEnd.bind(this);
  private badgeSub: Subscription = new Subscription();

  constructor(private router: Router, private notificationService: NotificationService) {}

  ngAfterViewInit() {
    setTimeout(() => this.attachListeners(), 800);
    this.badgeSub = this.notificationService.unreadCount.subscribe(c => {
      this.notifBadge = c;
    });
  }

  ngOnDestroy() {
    this.detachListeners();
    this.badgeSub.unsubscribe();
  }

  onTabChange(event: any) {
    this.currentTab = event.tab;
  }

  attachListeners() {
    this.outlet = document.querySelector('app-tabs ion-router-outlet') as HTMLElement;
    if (!this.outlet) return;

    this.outlet.addEventListener('touchstart', this.boundStart, { passive: true });
    this.outlet.addEventListener('touchmove', this.boundMove, { passive: true });
    this.outlet.addEventListener('touchend', this.boundEnd, { passive: true });
  }

  detachListeners() {
    if (!this.outlet) return;
    this.outlet.removeEventListener('touchstart', this.boundStart);
    this.outlet.removeEventListener('touchmove', this.boundMove);
    this.outlet.removeEventListener('touchend', this.boundEnd);
  }

onStart(e: TouchEvent) {
  this.startX = e.touches[0].clientX;
  this.startY = e.touches[0].clientY;
  this.axisLocked = null;

  const target = e.target as HTMLElement;
  const blockedSelectors = [
    '#map',
    '.schedule-grid',
  ];
  const isBlocked = blockedSelectors.some(sel => target.closest(sel) !== null);
  if (isBlocked) {
    this.axisLocked = 'v';
  }
}

  onMove(e: TouchEvent) {
    if (this.axisLocked) return;
    const dx = Math.abs(e.touches[0].clientX - this.startX);
    const dy = Math.abs(e.touches[0].clientY - this.startY);
    if (dx > 12 || dy > 12) {
      this.axisLocked = dx > dy ? 'h' : 'v';
    }
  }

onEnd(e: TouchEvent) {
  if (this.axisLocked !== 'h') return;

  const deltaX = e.changedTouches[0].clientX - this.startX;

  // Si viene de una notificación, requiere más distancia para evitar
  // confusión con el swipe de eliminar (que es corto ~60-80px)
  const target = e.target as HTMLElement;
  const isOnNotification = target.closest('ion-item-sliding') !== null;
  const minDistance = isOnNotification ? 160 : 80;

  if (Math.abs(deltaX) < minDistance) return;

  const currentIndex = this.tabOrder.indexOf(this.currentTab);
  if (currentIndex === -1) return;

  if (deltaX < 0 && currentIndex < this.tabOrder.length - 1) {
    this.router.navigate(['/tabs/' + this.tabOrder[currentIndex + 1]]);
  } else if (deltaX > 0 && currentIndex > 0) {
    this.router.navigate(['/tabs/' + this.tabOrder[currentIndex - 1]]);
  }
}
}