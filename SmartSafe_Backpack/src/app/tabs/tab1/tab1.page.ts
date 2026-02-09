import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from './profile-popover.component';
import { getDatabase, ref, onValue } from "firebase/database";
import { initializeApp } from "firebase/app";
import { environment } from 'src/environments/environment';

@Component({
  standalone: false,
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss']
})
export class Tab1Page implements OnInit, OnDestroy {

  userName: string = 'Usuario';
  userFullName: string = 'Usuario';
  userEmail: string = '';

  // Sensores BMP280
  temperatura: number = 0;
  presion: number = 0;
  altitud: number = 0;

  // 🔥 Sistema de conexión
  isConnected: boolean = false;
  lastDataUpdate: number = 0;
  lastUpdateText: string = 'Esperando datos...';
  
  // Buffer de conexión
  private connectionHistory: boolean[] = [];
  private readonly BUFFER_SIZE = 8;
  
  // Intervalo de verificación
  private monitoringInterval: any;
  
  // Tiempos optimizados
  private readonly DATA_TIMEOUT = 5000;
  private readonly QUICK_RECONNECT = 2;
  private readonly STABLE_DISCONNECT = 6;
  
  // Contadores
  private consecutiveSuccess: number = 0;

  constructor(
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadUserData();
    this.initializeFirebaseListeners();
    this.startMonitoring();
  }

  ngOnDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  initializeFirebaseListeners() {
    const app = initializeApp(environment.firebaseConfig);
    const db = getDatabase(app);

    // 🔥 NUEVO: Listeners INDEPENDIENTES para cada sensor (MÁS RÁPIDO)
    
    // Listener 1: TEMPERATURA (actualización instantánea)
    const tempRef = ref(db, 'BMP280/temperatura');
    onValue(tempRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.temperatura = value;
        this.onDataReceived('temperatura', value);
      }
    }, (error) => {
      console.error('❌ Error temperatura:', error);
    });

    // Listener 2: PRESIÓN (actualización instantánea)
    const presionRef = ref(db, 'BMP280/presion');
    onValue(presionRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.presion = value;
        this.onDataReceived('presion', value);
      }
    }, (error) => {
      console.error('❌ Error presión:', error);
    });

    // Listener 3: ALTITUD (actualización instantánea)
    const altitudRef = ref(db, 'BMP280/altitud');
    onValue(altitudRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.altitud = value;
        this.onDataReceived('altitud', value);
      }
    }, (error) => {
      console.error('❌ Error altitud:', error);
    });

    // 🔥 Listener 4: lastUpdate (para verificar conexión)
    const lastUpdateRef = ref(db, 'BMP280/lastUpdate');
    onValue(lastUpdateRef, (snapshot) => {
      const timestamp = snapshot.val();
      if (timestamp !== null && timestamp !== undefined) {
        this.onDataReceived('heartbeat', timestamp);
      }
    }, (error) => {
      console.error('❌ Error heartbeat:', error);
    });
  }

  // 🔥 NUEVO: Callback cuando llegan datos (CUALQUIER dato)
  onDataReceived(source: string, value: any) {
    const now = Date.now();
    this.lastDataUpdate = now;
    this.consecutiveSuccess++;
    this.addToHistory(true);
    
    // Log solo para debugging (puedes comentar esta línea en producción)
    if (source !== 'heartbeat') {
      console.log('📡', source + ':', value);
    }
  }

  // Monitoreo activo cada 500ms
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionStatus();
      this.updateLastUpdateText();
    }, 500);
  }

  // Verificar estado de conexión
  checkConnectionStatus() {
    const now = Date.now();
    const timeSinceLastData = now - this.lastDataUpdate;
    
    // Si han pasado más de DATA_TIMEOUT sin datos
    if (timeSinceLastData > this.DATA_TIMEOUT) {
      this.addToHistory(false);
      this.consecutiveSuccess = 0;
    }
    
    // Reconexión RÁPIDA: 2 actualizaciones consecutivas
    if (this.consecutiveSuccess >= this.QUICK_RECONNECT) {
      if (!this.isConnected) {
        console.log('✅ ESP32 CONECTADO');
        this.isConnected = true;
      }
      return;
    }
    
    // Evaluación del buffer
    if (this.connectionHistory.length >= this.BUFFER_SIZE) {
      const successCount = this.connectionHistory.filter(x => x === true).length;
      const failCount = this.BUFFER_SIZE - successCount;
      
      if (failCount >= this.STABLE_DISCONNECT) {
        if (this.isConnected) {
          console.log('❌ ESP32 DESCONECTADO - Fallos:', failCount + '/' + this.BUFFER_SIZE);
          this.isConnected = false;
          this.resetSensorValues();
        }
      }
      else if (successCount >= (this.BUFFER_SIZE - this.STABLE_DISCONNECT + 1)) {
        if (!this.isConnected) {
          console.log('✅ ESP32 CONECTADO (estable)');
          this.isConnected = true;
        }
      }
    }
  }

  // Agregar al historial de conexión
  addToHistory(success: boolean) {
    this.connectionHistory.push(success);
    
    if (this.connectionHistory.length > this.BUFFER_SIZE) {
      this.connectionHistory.shift();
    }
  }

  // Resetear valores a 0
  resetSensorValues() {
    this.temperatura = 0;
    this.presion = 0;
    this.altitud = 0;
  }

  // Actualizar texto de última actualización
  updateLastUpdateText() {
    if (!this.isConnected) {
      this.lastUpdateText = 'Desconectado';
      return;
    }

    if (this.lastDataUpdate === 0) {
      this.lastUpdateText = 'Esperando datos...';
      return;
    }

    const timeDiff = Math.floor((Date.now() - this.lastDataUpdate) / 1000);

    if (timeDiff < 2) {
      this.lastUpdateText = 'Ahora mismo';
    } else if (timeDiff < 60) {
      this.lastUpdateText = 'Hace ' + timeDiff + ' seg';
    } else if (timeDiff < 3600) {
      const minutes = Math.floor(timeDiff / 60);
      this.lastUpdateText = 'Hace ' + minutes + ' min';
    } else {
      const hours = Math.floor(timeDiff / 3600);
      this.lastUpdateText = 'Hace ' + hours + ' h';
    }
  }

  async loadUserData() {
    const currentUser = this.firebaseService.getCurrentUser();

    if (currentUser) {
      this.userEmail = currentUser.email || '';

      if (currentUser.displayName) {
        this.userFullName = currentUser.displayName;
        this.userName = this.getFirstName(currentUser.displayName);
      } else if (currentUser.email) {
        const userData = await this.firebaseService.getUserData(currentUser.email);
        if (userData.success && userData.data) {
          this.userFullName = userData.data.nombre;
          this.userName = this.getFirstName(userData.data.nombre);
        }
      }
    }
  }

  getFirstName(fullName: string): string {
    if (!fullName) return 'Usuario';
    const firstName = fullName.trim().split(' ')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }

  async presentPopover(event: any) {
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
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar sesión',
          handler: async () => {
            await this.firebaseService.logout();
            this.popoverController.dismiss();
            this.router.navigate(['/pagina-inicio']);
          }
        }
      ]
    });

    await alert.present();
  }
}