import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from './profile-popover.component';
import { getDatabase, ref, onValue } from "firebase/database";
import { initializeApp } from "firebase/app";
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

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

  temperatura: number = 0;
  presion: number = 0;
  altitud: number = 0;
  peso: number = 0;

  uvIndex: number = 0;
  uvLevel: string = 'Sin datos';
  uvColor: string = '#888';
  uvLoading: boolean = true;
  cityName: string = '';

  isConnected: boolean = false;
  lastDataUpdate: number = 0;
  lastUpdateText: string = 'Esperando datos...';

  private connectionHistory: boolean[] = [];
  private readonly BUFFER_SIZE = 8;
  private monitoringInterval: any;
  private uvInterval: any;
  private readonly DATA_TIMEOUT = 5000;
  private readonly QUICK_RECONNECT = 2;
  private readonly STABLE_DISCONNECT = 6;
  private consecutiveSuccess: number = 0;

  private readonly OPENWEATHER_KEY = '1bf9772e66b038c7e9f7b3d8de4124b2';

  constructor(
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router,
    private http: HttpClient,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.loadUserData();
    this.initializeFirebaseListeners();
    this.startMonitoring();
    this.loadUVIndex();
    this.uvInterval = setInterval(() => this.loadUVIndex(), 10 * 60 * 1000);
  }

  ngOnDestroy() {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.uvInterval) clearInterval(this.uvInterval);
  }

  // ── UV ──────────────────────────────────────────────
  loadUVIndex() {
    this.uvLoading = true;

    if (Capacitor.isNativePlatform()) {
      Geolocation.requestPermissions().then(result => {
        if (result.location === 'granted' || result.coarseLocation === 'granted') {
          Geolocation.getCurrentPosition({ timeout: 8000 }).then(pos => {
            this.fetchUV(pos.coords.latitude, pos.coords.longitude);
          }).catch(() => {
            this.fetchUV(-2.9001, -79.0059);
          });
        } else {
          this.fetchUV(-2.9001, -79.0059);
        }
      }).catch(() => {
        this.fetchUV(-2.9001, -79.0059);
      });
    } else {
      if (!navigator.geolocation) {
        this.fetchUV(-2.9001, -79.0059);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => this.fetchUV(pos.coords.latitude, pos.coords.longitude),
        () => {
          console.warn('Geolocalización denegada, usando Cuenca EC por defecto');
          this.fetchUV(-2.9001, -79.0059);
        },
        { timeout: 8000 }
      );
    }
  }

  fetchUV(lat: number, lon: number) {
    const url = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${this.OPENWEATHER_KEY}`;

    this.http.get<any>(url).subscribe({
      next: (data) => {
        this.uvIndex = Math.round(data.value);
        this.setUVLevel(this.uvIndex);
        this.uvLoading = false;

        const cityUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.OPENWEATHER_KEY}&units=metric`;
        this.http.get<any>(cityUrl).subscribe({
          next: (cityData) => {
            this.cityName = cityData.name || '';
            this.notificationService.checkUV(this.uvIndex, this.cityName);
          },
          error: () => {
            this.cityName = '';
            this.notificationService.checkUV(this.uvIndex, '');
          }
        });
      },
      error: (err) => {
        console.error('Error UV:', err);
        this.uvLevel = 'Error';
        this.uvLoading = false;
      }
    });
  }

  setUVLevel(uvi: number) {
    if (uvi <= 2) { this.uvLevel = 'Bajo'; this.uvColor = '#00c853'; }
    else if (uvi <= 5) { this.uvLevel = 'Moderado'; this.uvColor = '#ffd600'; }
    else if (uvi <= 7) { this.uvLevel = 'Alto'; this.uvColor = '#ff6d00'; }
    else if (uvi <= 10) { this.uvLevel = 'Muy alto'; this.uvColor = '#dd2c00'; }
    else { this.uvLevel = 'Extremo'; this.uvColor = '#aa00ff'; }
  }

  get pesoDisplay(): string {
    if (!this.isConnected || this.peso === 0) return '0 g';
    if (this.peso >= 1000) return (this.peso / 1000).toFixed(1).replace('.', ',') + ' kg';
    return Math.round(this.peso) + ' g';
  }

  initializeFirebaseListeners() {
    const app = initializeApp(environment.firebaseConfig);
    const db = getDatabase(app);

    const tempRef = ref(db, 'BMP280/temperatura');
    onValue(tempRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.temperatura = value;
        this.onDataReceived('temperatura', value);
      }
    }, (error) => { console.error('❌ Error temperatura:', error); });

    const presionRef = ref(db, 'BMP280/presion');
    onValue(presionRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.presion = value;
        this.onDataReceived('presion', value);
      }
    }, (error) => { console.error('❌ Error presión:', error); });

    const altitudRef = ref(db, 'BMP280/altitud');
    onValue(altitudRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.altitud = value;
        this.onDataReceived('altitud', value);
      }
    }, (error) => { console.error('❌ Error altitud:', error); });

    const lastUpdateRef = ref(db, 'BMP280/lastUpdate');
    onValue(lastUpdateRef, (snapshot) => {
      const timestamp = snapshot.val();
      if (timestamp !== null && timestamp !== undefined) {
        this.onDataReceived('heartbeat', timestamp);
      }
    }, (error) => { console.error('❌ Error heartbeat:', error); });

    const pesoRef = ref(db, 'HX711/peso');
    onValue(pesoRef, (snapshot) => {
      const value = snapshot.val();
      if (value !== null && value !== undefined) {
        this.peso = value;
        this.onDataReceived('peso', value);
      }
    }, (error) => { console.error('❌ Error peso:', error); });
  }

  onDataReceived(source: string, value: any) {
    this.lastDataUpdate = Date.now();
    this.consecutiveSuccess++;
    this.addToHistory(true);
    if (source !== 'heartbeat') console.log('📡', source + ':', value);
    if (source === 'temperatura') this.notificationService.checkTemperatura(value);
  }

  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionStatus();
      this.updateLastUpdateText();
    }, 500);
  }

  checkConnectionStatus() {
    const now = Date.now();
    const timeSinceLastData = now - this.lastDataUpdate;

    if (timeSinceLastData > this.DATA_TIMEOUT) {
      this.addToHistory(false);
      this.consecutiveSuccess = 0;
    }

    if (this.consecutiveSuccess >= this.QUICK_RECONNECT) {
      if (!this.isConnected) {
        console.log('✅ ESP32 CONECTADO');
        this.isConnected = true;
        this.notificationService.checkConexion(true);
      }
      return;
    }

    if (this.connectionHistory.length >= this.BUFFER_SIZE) {
      const successCount = this.connectionHistory.filter(x => x === true).length;
      const failCount = this.BUFFER_SIZE - successCount;

      if (failCount >= this.STABLE_DISCONNECT) {
        if (this.isConnected) {
          console.log('❌ ESP32 DESCONECTADO - Fallos:', failCount + '/' + this.BUFFER_SIZE);
          this.isConnected = false;
          this.resetSensorValues();
          this.notificationService.checkConexion(false);
        }
      } else if (successCount >= (this.BUFFER_SIZE - this.STABLE_DISCONNECT + 1)) {
        if (!this.isConnected) {
          console.log('✅ ESP32 CONECTADO (estable)');
          this.isConnected = true;
          this.notificationService.checkConexion(true);
        }
      }
    }
  }

  addToHistory(success: boolean) {
    this.connectionHistory.push(success);
    if (this.connectionHistory.length > this.BUFFER_SIZE) this.connectionHistory.shift();
  }

  resetSensorValues() {
    this.temperatura = 0;
    this.presion = 0;
    this.altitud = 0;
    this.peso = 0;
  }

  updateLastUpdateText() {
    if (!this.isConnected) { this.lastUpdateText = 'Desconectado'; return; }
    if (this.lastDataUpdate === 0) { this.lastUpdateText = 'Esperando datos...'; return; }
    const timeDiff = Math.floor((Date.now() - this.lastDataUpdate) / 1000);
    if (timeDiff < 2) this.lastUpdateText = 'Ahora mismo';
    else if (timeDiff < 60) this.lastUpdateText = 'Hace ' + timeDiff + ' seg';
    else if (timeDiff < 3600) this.lastUpdateText = 'Hace ' + Math.floor(timeDiff / 60) + ' min';
    else this.lastUpdateText = 'Hace ' + Math.floor(timeDiff / 3600) + ' h';
  }

  async loadUserData() {
    const currentUser = this.firebaseService.getCurrentUser();
    console.log('👤 currentUser:', currentUser);
    if (currentUser) {
      this.userEmail = currentUser.email || '';
      if (currentUser.displayName) {
        this.userFullName = currentUser.displayName;
      } else if (currentUser.email) {
        const userData = await this.firebaseService.getUserData(currentUser.email);
        console.log('👤 userData:', userData);
        if (userData.success && userData.data) this.userFullName = userData.data.nombre;
      }
    }
  }

  getFirstName(fullName: string): string {
    if (!fullName) return 'Usuario';
    const firstName = fullName.trim().split(' ')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
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