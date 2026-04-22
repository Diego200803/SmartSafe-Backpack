import { Component, OnInit, OnDestroy } from '@angular/core';
import { Database, ref, onValue, set } from '@angular/fire/database';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tab1/profile-popover.component';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';

@Component({
  standalone: false,
  selector: 'app-tab5',
  templateUrl: './tab5.page.html',
  styleUrls: ['./tab5.page.scss'],
})
export class Tab5Page implements OnInit, OnDestroy {

  userFullName: string = 'Usuario';
  userEmail: string = '';

  modoActivo: boolean = false;
  isConnected: boolean = false;
  isMoving: boolean = false;

  ax_g: number = 0;
  ay_g: number = 0;
  az_g: number = 0;
  movimiento: number = 0;
  lastUpdate: number = 0;
  lastUpdateText: string = 'Esperando...';

  historialMovimientos: { texto: string; tiempo: string; fecha: string; }[] = [];

  private monitoringInterval: any;
  private readonly DATA_TIMEOUT = 10000;
  private lastMovingState: boolean = false;
  private isTogglingMode: boolean = false;
  private modeChangedAt: number = 0; // ← timestamp del último cambio de modo
  private readonly MODE_SETTLE_TIME = 3000; // ← 3 seg de gracia tras cambiar modo

  constructor(
    private db: Database,
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadUserData();
    this.listenMPU();
    this.startMonitoring();
  }

  ngOnDestroy() {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
  }

  async toggleModo() {
    if (this.isTogglingMode) return;
    this.isTogglingMode = true;

    const nuevoEstado = !this.modoActivo;

    if (nuevoEstado) {
      const alert = await this.alertController.create({
        header: 'Activar detección',
        message: 'Se activará el modo de detección de movimiento. Recibirás alertas cuando la mochila se mueva.',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => {
              this.isTogglingMode = false;
            }
          },
          {
            text: 'Activar',
            handler: () => {
              this.setModoActivo(true);
            }
          }
        ]
      });
      await alert.present();
      await alert.onDidDismiss();
      this.isTogglingMode = false;
    } else {
      await this.setModoActivo(false);
      this.isTogglingMode = false;
    }
  }

  async setModoActivo(activo: boolean) {
    this.modoActivo = activo;
    this.modeChangedAt = Date.now(); // ← registrar cuándo cambió

    await set(ref(this.db, '/MPU9250/modoActivo'), activo);

    if (activo) {
      this.agregarHistorial('Modo detección activado');
    } else {
      this.agregarHistorial('Modo detección desactivado');
      this.isMoving = false;
      this.lastMovingState = false;
      this.ax_g = 0;
      this.ay_g = 0;
      this.az_g = 0;
      this.movimiento = 0;
      this.lastUpdate = 0;
    }
  }

listenMPU() {
  const mpuRef = ref(this.db, '/MPU9250');
  onValue(mpuRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // ← Ya no sincronizamos modoActivo desde Firebase
    // La app es la única fuente de verdad del modo

    if (!this.modoActivo) return;

    this.lastUpdate = Date.now();
    this.ax_g = data.ax_g ?? 0;
    this.ay_g = data.ay_g ?? 0;
    this.az_g = data.az_g ?? 0;
    this.movimiento = data.movimiento ?? 0;

    const nuevoMoving = data.moving ?? false;

    if (nuevoMoving !== this.lastMovingState) {
      this.lastMovingState = nuevoMoving;
      if (nuevoMoving) {
        this.agregarHistorial('¡Movimiento detectado!');
        this.notificationService.checkMovimiento();
      } else {
        this.agregarHistorial('Mochila quieta');
      }
    }

    this.isMoving = nuevoMoving;
  });
}

  agregarHistorial(texto: string) {
    const ahora = new Date();
    const tiempo = ahora.getHours().toString().padStart(2, '0') + ':' +
                   ahora.getMinutes().toString().padStart(2, '0') + ':' +
                   ahora.getSeconds().toString().padStart(2, '0');
    const fecha = ahora.getDate().toString().padStart(2, '0') + '/' +
                  (ahora.getMonth() + 1).toString().padStart(2, '0') + '/' +
                  ahora.getFullYear();
    this.historialMovimientos.unshift({ texto, tiempo, fecha });
    if (this.historialMovimientos.length > 20) {
      this.historialMovimientos.pop();
    }
  }

  async borrarHistorial() {
    const alert = await this.alertController.create({
      header: 'Borrar historial',
      message: '¿Estás seguro de que deseas borrar todo el historial de eventos?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          handler: () => {
            this.historialMovimientos = [];
          }
        }
      ]
    });
    await alert.present();
  }

  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.updateConnectionStatus();
      this.updateLastUpdateText();
    }, 1000);
  }

  updateConnectionStatus() {
    if (!this.modoActivo) { this.isConnected = false; return; }
    this.isConnected = (Date.now() - this.lastUpdate) < this.DATA_TIMEOUT;
  }

  updateLastUpdateText() {
    if (!this.modoActivo) { this.lastUpdateText = 'Modo inactivo'; return; }
    if (!this.isConnected) { this.lastUpdateText = 'Sin datos'; return; }
    if (this.lastUpdate === 0) { this.lastUpdateText = 'Esperando...'; return; }
    const diff = Math.floor((Date.now() - this.lastUpdate) / 1000);
    if (diff < 2) this.lastUpdateText = 'Ahora mismo';
    else if (diff < 60) this.lastUpdateText = 'Hace ' + diff + ' seg';
    else this.lastUpdateText = 'Hace ' + Math.floor(diff / 60) + ' min';
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