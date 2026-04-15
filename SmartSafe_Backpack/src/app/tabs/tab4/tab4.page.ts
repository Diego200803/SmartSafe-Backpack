import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tab1/profile-popover.component';
import { Router } from '@angular/router';
import { NotificationService, AppNotification } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  standalone: false,
  selector: 'app-tab4',
  templateUrl: './tab4.page.html',
  styleUrls: ['./tab4.page.scss'],
})
export class Tab4Page implements OnInit, OnDestroy {

  userFullName: string = 'Usuario';
  userEmail: string = '';
  notifications: AppNotification[] = [];

  private sub: Subscription = new Subscription();
  private timeInterval: any;

  constructor(
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadUserData();

    this.sub = this.notificationService.notifications.subscribe(notifs => {
      this.notifications = notifs;
    });

    // Actualizar textos de tiempo cada minuto
    this.timeInterval = setInterval(() => {
      this.notificationService.updateTimeTexts();
    }, 60000);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.timeInterval) clearInterval(this.timeInterval);
  }

  deleteNotification(id: string, element: HTMLElement) {
    element.classList.add('deleting');
    setTimeout(() => {
      this.notificationService.remove(id);
    }, 300);
  }

  async loadUserData() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser) {
      this.userEmail = currentUser.email || '';
      if (currentUser.displayName) {
        this.userFullName = currentUser.displayName;
      } else if (currentUser.email) {
        const userData = await this.firebaseService.getUserData(currentUser.email);
        if (userData.success && userData.data) {
          this.userFullName = userData.data.nombre;
        }
      }
    }
  }

  async presentPopover(event: any) {
    await this.loadUserData();
    const popover = await this.popoverController.create({
      component: ProfilePopoverComponent,
      event: event,
      translucent: true,
      cssClass: 'profile-popover-class',
      componentProps: {
        name: this.userFullName,
        email: this.userEmail,
        onLogout: () => this.logout()
      }
    });
    await popover.present();
  }

  async logout() {
    const alert = await this.alertController.create({
      header: '¿Cerrar sesión?',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', handler: async () => {
          await this.firebaseService.logout();
          this.popoverController.dismiss();
          this.router.navigate(['/pagina-inicio']);
        }}
      ]
    });
    await alert.present();
  }
}