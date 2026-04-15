import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-profile-popover',
  template: `
    <div class="profile-popover">
      <div class="profile-header">
        <div class="avatar-circle">
          <ion-icon name="person"></ion-icon>
        </div>
      </div>

      <div class="profile-info">
        <h3 class="profile-name">{{ name }}</h3>
        <p class="profile-email">{{ email }}</p>
      </div>

      <div class="profile-actions">
        <ion-button
          expand="block"
          fill="clear"
          class="logout-button"
          (click)="onLogout()">
          <div class="logout-content">
            <ion-icon name="power"></ion-icon>
            <span>Cerrar Sesión</span>
          </div>
        </ion-button>
      </div>
    </div>
  `,
styles: []
})
export class ProfilePopoverComponent {
  name: string = '';
  email: string = '';
  onLogout: () => void = () => {};
}