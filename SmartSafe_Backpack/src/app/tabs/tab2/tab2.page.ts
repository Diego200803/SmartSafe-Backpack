import { Component, OnInit, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Database, ref, onValue } from '@angular/fire/database';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tab1/profile-popover.component';

declare var google: any;

@Component({
  standalone: false,
  selector: 'app-tab2',
  templateUrl: './tab2.page.html',
  styleUrls: ['./tab2.page.scss'],
})
export class Tab2Page implements OnInit, AfterViewInit, OnDestroy {

  // Datos de usuario
  userName: string = 'Usuario';
  userFullName: string = 'Usuario';
  userEmail: string = '';

  // Mapa
  map: any;
  marker: any;

  // Datos GPS
  latitude: number = 0;
  longitude: number = 0;
  satellites: number = 0;
  speed: number = 0;
  altitude: number = 0;

  // 🔥 Estados del sistema
  isConnected: boolean = false;      // ESP32 está enviando datos
  hasGPSFix: boolean = false;        // GPS tiene señal satelital
  isSearchingGPS: boolean = false;   // ESP32 conectado pero sin FIX
  
  lastDataUpdate: number = 0;
  lastUpdateText: string = 'Esperando GPS...';
  
  // 🔥 Sistema de detección ULTRA ESTABLE
  private lastFirebaseTimestamp: number = 0;
  private readonly CONNECTION_TIMEOUT = 8000;      // 8 segundos (muy tolerante)
  private readonly DISCONNECT_CONFIRMATION = 12000; // 12 segundos para confirmar desconexión real
  private readonly GPS_FIX_THRESHOLD = 3;          // Mínimo de satélites para FIX válido
  
  // Sistema de confirmación progresiva
  private disconnectionStartTime: number = 0;
  private wasConnectedBefore: boolean = false;
  
  // Intervalo de verificación
  private monitoringInterval: any;
  private lastDebugLog: number = 0;

  constructor(
    private db: Database,
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.loadUserData();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.loadMap();
      this.listenGPS();
      this.startMonitoring();
    }, 500);
  }

  ngOnDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  // ================= MAPA =================
 loadMap() {
  const mapElement = document.getElementById('map');
  
  if (!mapElement) {
    console.error('❌ Elemento #map no encontrado, reintentando...');
    setTimeout(() => this.loadMap(), 500); // 🔥 Reintenta si no existe
    return;
  }

  if (!google || !google.maps) {
    console.error('Google Maps no cargado');
    return;
  }

  const mapOptions = {
    center: { lat: -2.8973, lng: -79.0058 },
    zoom: 15,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    disableDefaultUI: true,
    styles: [
      { "elementType": "geometry", "stylers": [{ "color": "#1d2c4d" }] },
      { "elementType": "labels.text.fill", "stylers": [{ "color": "#8ec3b9" }] },
      { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1a3646" }] },
      { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
      { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0a2342" }] }
    ]
  };

  this.map = new google.maps.Map(mapElement, mapOptions);
  console.log('✅ Mapa cargado');
}

  // ================= 🔥 FIREBASE GPS - LISTENER UNIFICADO =================
  listenGPS() {
    const gpsRef = ref(this.db, 'GPS');
    
    onValue(gpsRef, (snapshot) => {
      const data = snapshot.val();

      this.zone.run(() => { // Garantizar actualización en Angular
        if (!data) {
          console.warn('⚠️ Nodo GPS vacío');
          return;
        }

        // 🔥 SIEMPRE actualizar timestamp
        this.lastDataUpdate = Date.now();

        const lat = data.latitud ?? 0;
        const lon = data.longitud ?? 0;
        const sats = data.satelites ?? 0;
        const vel = data.velocidad ?? 0;
        const alt = data.altitud ?? 0;
        const fixFromESP32 = data.fix ?? false;  // 🔥 Fix del Arduino
        const heartbeat = data.heartbeat ?? 0;

        if (heartbeat > this.lastFirebaseTimestamp) {
          this.lastFirebaseTimestamp = heartbeat;
        }

        // Actualizar valores
        this.latitude = lat;
        this.longitude = lon;
        this.satellites = sats;
        this.speed = vel;
        this.altitude = alt;

        // 🔥 Usar el FIX del ESP32 + validar satélites
        this.hasGPSFix = fixFromESP32 && (sats >= this.GPS_FIX_THRESHOLD);

        // Actualizar marcador si hay fix
        if (this.hasGPSFix && lat !== 0 && lon !== 0) {
          this.updateMarker();
        }

        // Debug cada 3 segundos
        if (!this.lastDebugLog || (Date.now() - this.lastDebugLog) > 3000) {
          console.log(`📡 GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)} | SAT: ${sats} | FIX: ${this.hasGPSFix}`);
          this.lastDebugLog = Date.now();
        }
      });
    }, (error) => {
      console.error('❌ Error en listener GPS:', error);
    });
  }

  // 🔥 Actualizar/Crear marcador
  updateMarker() {
    if (!this.map) return;

    const newPosition = { lat: this.latitude, lng: this.longitude };

    if (this.marker) {
      this.marker.setPosition(newPosition);
      this.map.panTo(newPosition);
    } else {
      this.marker = new google.maps.Marker({
        position: newPosition,
        map: this.map,
        title: 'SmartSafe Backpack',
        animation: google.maps.Animation.DROP,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#00d4ff',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });
      this.map.setCenter(newPosition);
      console.log('📍 Marcador creado');
    }
  }

  removeMarker() {
    if (this.marker) {
      this.marker.setMap(null);
      this.marker = null;
      console.log('📍 Marcador eliminado');
    }
  }

  // 🔥 Monitoreo optimizado
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionStatus();
      this.updateLastUpdateText();
    }, 1000);
  }

  // 🔥 Verificar estado de conexión - ULTRA ESTABLE
  checkConnectionStatus() {
    const now = Date.now();
    const timeSinceLastData = now - this.lastDataUpdate;

    // ================= CONEXIÓN INMEDIATA =================
    if (timeSinceLastData < this.CONNECTION_TIMEOUT) {
      this.disconnectionStartTime = 0;

      if (!this.isConnected) {
        console.log('✅ ESP32 CONECTADO');
        this.isConnected = true;
        this.wasConnectedBefore = true;
      }

      // 🔥 SOLO mostrar "Buscando" si está CONECTADO pero NO tiene FIX
      this.isSearchingGPS = !this.hasGPSFix;
      return;
    }

    // ================= PROCESO DE DESCONEXIÓN =================
    if (!this.isConnected) {
      this.isSearchingGPS = false; // 🔥 Desconectado NO busca
      return;
    }

    if (this.disconnectionStartTime === 0) {
      this.disconnectionStartTime = now;
      console.log('⚠️ Iniciando verificación de desconexión...');
      return;
    }

    const timeDisconnected = now - this.disconnectionStartTime;

    if (timeDisconnected >= this.DISCONNECT_CONFIRMATION) {
      console.log('❌ ESP32 DESCONECTADO - Sin datos por ' + Math.floor(timeDisconnected / 1000) + ' segundos');
      this.isConnected = false;
      this.isSearchingGPS = false;  // 🔥 Desconectado NO busca
      this.hasGPSFix = false;
      this.disconnectionStartTime = 0;
      this.resetGPSValues();
      this.removeMarker();
    } else {
      const secondsRemaining = Math.ceil((this.DISCONNECT_CONFIRMATION - timeDisconnected) / 1000);
      console.log('⏳ Verificando conexión... ' + secondsRemaining + 's restantes');
    }
  }

  resetGPSValues() {
    this.latitude = 0;
    this.longitude = 0;
    this.satellites = 0;
    this.speed = 0;
    this.altitude = 0;
  }

  updateLastUpdateText() {
    if (!this.isConnected) {
      this.lastUpdateText = 'Desconectado';
      return;
    }

    if (this.isSearchingGPS) {
      this.lastUpdateText = 'Buscando satélites...';
      return;
    }

    if (this.lastDataUpdate === 0) {
      this.lastUpdateText = 'Esperando GPS...';
      return;
    }

    const timeDiff = Math.floor((Date.now() - this.lastDataUpdate) / 1000);

    if (timeDiff < 2) this.lastUpdateText = 'ahora mismo';
    else if (timeDiff < 60) this.lastUpdateText = 'hace ' + timeDiff + ' seg';
    else this.lastUpdateText = 'hace ' + Math.floor(timeDiff / 60) + ' min';
  }

  // ================= USUARIO =================
  async loadUserData() {
    const currentUser = this.firebaseService.getCurrentUser();

    if (currentUser) {
      this.userEmail = currentUser.email || '';
      if (currentUser.displayName) this.userFullName = currentUser.displayName;
      else if (currentUser.email) {
        const userData = await this.firebaseService.getUserData(currentUser.email);
        if (userData.success && userData.data) this.userFullName = userData.data.nombre;
      }
    }
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