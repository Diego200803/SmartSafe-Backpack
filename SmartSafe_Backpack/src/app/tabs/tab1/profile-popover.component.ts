import { Component } from '@angular/core';

@Component({
    standalone: false,
    selector: 'app-profile-popover',
    template: `
    <div class="profile-popover">
      <div class="profile-header">
        <ion-avatar class="avatar-large">
          <ion-icon name="person-circle"></ion-icon>
        </ion-avatar>
      </div>
      
      <div class="profile-info">
        <h3 class="profile-name">{{ name }}</h3>
        <p class="profile-email">{{ email }}</p>
      </div>

      <ion-button 
        expand="block" 
        fill="clear" 
        class="logout-button"
        (click)="onLogout()"
      >
        <ion-icon name="log-out-outline" slot="start"></ion-icon>
        Cerrar Sesión
      </ion-button>
    </div>
  `,
    styles: [`
    .profile-popover {
      padding: 0;
      width: 280px;
      background: rgba(26, 35, 50, 0.98);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      border: 1px solid rgba(0, 212, 255, 0.2);
      overflow: hidden;
    }

    .profile-header {
      background: linear-gradient(135deg, #0a1628 0%, #1a2332 100%);
      padding: 24px;
      text-align: center;
      border-bottom: 1px solid rgba(0, 212, 255, 0.2);
    }

    .avatar-large {
      width: 80px;
      height: 80px;
      margin: 0 auto;
      border: 3px solid #00d4ff;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
    }

    .avatar-large ion-icon {
      font-size: 80px;
      color: #00d4ff;
    }

    .profile-info {
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .profile-name {
      font-size: 18px;
      font-weight: 700;
      color: white;
      margin: 0 0 8px 0;
    }

    .profile-email {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
      word-break: break-all;
    }

    .logout-button {
      margin: 12px;
      --color: #ff6464;
      --background-hover: rgba(255, 100, 100, 0.1);
      font-weight: 600;
    }

    .logout-button ion-icon {
      font-size: 20px;
    }
  `]
})
export class ProfilePopoverComponent {
    name: string = '';
    email: string = '';
    onLogout: () => void = () => { };
}