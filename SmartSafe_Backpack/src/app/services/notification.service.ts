import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface AppNotification {
  id: string;
  type: 'warning' | 'alert' | 'info' | 'success';
  icon: string;
  iconClass: string;
  title: string;
  message: string;
  badge: string;
  badgeClass: string;
  timestamp: Date;
  timeText: string;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private notifications$ = new BehaviorSubject<AppNotification[]>([]);
  notifications = this.notifications$.asObservable();

  private unreadCount$ = new BehaviorSubject<number>(0);
  unreadCount = this.unreadCount$.asObservable();

  private readonly COOLDOWN = 5 * 60 * 1000;
  private lastSent: { [key: string]: number } = {};
  private notifIdCounter = 1;
  private permissionGranted = false;

  constructor() {
    this.requestPermissions();
  }

  async requestPermissions() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const result = await LocalNotifications.requestPermissions();
      this.permissionGranted = result.display === 'granted';
      console.log('🔔 Permisos notificaciones:', result.display);
    } catch (e) {
      console.warn('No se pudieron solicitar permisos:', e);
    }
  }

  private canSend(key: string): boolean {
    const now = Date.now();
    const last = this.lastSent[key] || 0;
    if (now - last > this.COOLDOWN) {
      this.lastSent[key] = now;
      return true;
    }
    return false;
  }

  private async add(notif: Omit<AppNotification, 'id' | 'timestamp' | 'timeText' | 'read'>) {
    const id = Date.now().toString();
    const newNotif: AppNotification = {
      ...notif,
      id,
      timestamp: new Date(),
      timeText: 'Ahora mismo',
      read: false
    };

    const current = this.notifications$.getValue();
    this.notifications$.next([newNotif, ...current]);
    this.unreadCount$.next(this.unreadCount$.getValue() + 1);

    await this.sendSystemNotification(notif.title, notif.message);
  }

  clearUnread() {
    const current = this.notifications$.getValue();
    this.notifications$.next(current.map(n => ({ ...n, read: true })));
    this.unreadCount$.next(0);
  }

  clearAll() {
    this.notifications$.next([]);
    this.unreadCount$.next(0);
  }

  private async sendSystemNotification(title: string, body: string) {
    if (!Capacitor.isNativePlatform()) return;
    if (!this.permissionGranted) {
      await this.requestPermissions();
      if (!this.permissionGranted) return;
    }

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: this.notifIdCounter++,
            title,
            body,
            smallIcon: 'ic_stat_logo_app',
            iconColor: '#00d4ff',
            sound: undefined,
            actionTypeId: '',
            extra: null,
          }
        ]
      });
    } catch (e) {
      console.warn('Error enviando notificación del sistema:', e);
    }
  }

  remove(id: string) {
    const current = this.notifications$.getValue();
    this.notifications$.next(current.filter(n => n.id !== id));
  }

  updateTimeTexts() {
    const current = this.notifications$.getValue();
    const updated = current.map(n => ({
      ...n,
      timeText: this.getTimeText(n.timestamp)
    }));
    this.notifications$.next(updated);
  }

  private getTimeText(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Hace ' + diff + ' seg';
    if (diff < 3600) return 'Hace ' + Math.floor(diff / 60) + ' min';
    return 'Hace ' + Math.floor(diff / 3600) + ' h';
  }

  // ── UV ────────────────────────────────────────────────
  checkUV(uvIndex: number, ciudad: string) {
    if (uvIndex <= 0) return;

    if (uvIndex >= 8 && this.canSend('uv_extremo')) {
      this.add({
        type: 'alert',
        icon: 'sunny',
        iconClass: 'temperature-icon',
        title: 'Radiación UV extrema',
        message: `Índice UV: ${uvIndex} en ${ciudad}. Usa protector solar alto, sombrero y evita el sol directo.`,
        badge: 'Alerta',
        badgeClass: 'alert-badge'
      });
    } else if (uvIndex >= 6 && uvIndex < 8 && this.canSend('uv_alto')) {
      this.add({
        type: 'warning',
        icon: 'sunny-outline',
        iconClass: 'temperature-icon',
        title: 'Radiación UV alta',
        message: `Índice UV: ${uvIndex} en ${ciudad}. Se recomienda aplicar protector solar.`,
        badge: 'Importante',
        badgeClass: ''
      });
    } else if (uvIndex >= 3 && uvIndex < 6 && this.canSend('uv_moderado')) {
      this.add({
        type: 'info',
        icon: 'partly-sunny-outline',
        iconClass: 'gps-icon',
        title: 'Radiación UV moderada',
        message: `Índice UV: ${uvIndex} en ${ciudad}. Puedes salir con normalidad, considera protector solar.`,
        badge: 'Info',
        badgeClass: 'info-badge'
      });
    } else if (uvIndex < 3 && this.canSend('uv_bajo')) {
      this.add({
        type: 'success',
        icon: 'checkmark-circle',
        iconClass: 'success-icon',
        title: 'Radiación UV baja',
        message: `Índice UV: ${uvIndex} en ${ciudad}. Condiciones seguras, no se requiere protección especial.`,
        badge: 'OK',
        badgeClass: 'success-badge'
      });
    }
  }

  // ── GPS ───────────────────────────────────────────────
  checkGPSFix(hasFix: boolean, satellites: number) {
    if (hasFix && this.canSend('gps_fix')) {
      this.add({
        type: 'success',
        icon: 'navigate',
        iconClass: 'gps-icon',
        title: 'GPS con señal',
        message: `${satellites} satélites detectados. Ubicación activa y mostrada en el mapa.`,
        badge: 'GPS',
        badgeClass: 'info-badge'
      });
    } else if (!hasFix && this.canSend('gps_buscando')) {
      this.add({
        type: 'info',
        icon: 'scan-circle-outline',
        iconClass: 'gps-icon',
        title: 'GPS buscando señal',
        message: 'El GPS está realizando fix satelital. La ubicación estará disponible en breve.',
        badge: 'Info',
        badgeClass: 'info-badge'
      });
    }
  }

  // ── CONEXIÓN ESP32 ────────────────────────────────────
  checkConexion(isConnected: boolean) {
    if (isConnected && this.canSend('esp32_conectado')) {
      this.add({
        type: 'success',
        icon: 'checkmark-circle',
        iconClass: 'success-icon',
        title: 'Todos los sistemas en funcionamiento',
        message: 'Mochila encendida. Sensores activos: temperatura, presión, altitud y peso.',
        badge: 'OK',
        badgeClass: 'success-badge'
      });
    } else if (!isConnected && this.canSend('esp32_desconectado')) {
      this.add({
        type: 'alert',
        icon: 'power',
        iconClass: 'weight-icon',
        title: 'Mochila desconectada',
        message: 'Se perdió la conexión con la mochila. Verifica que esté encendida.',
        badge: 'Alerta',
        badgeClass: 'alert-badge'
      });
    }
  }

  // ── MOVIMIENTO ────────────────────────────────────────
checkMovimiento() {
  if (this.canSend('movimiento')) {
    this.add({
      type: 'warning',
      icon: 'walk',
      iconClass: 'temperature-icon',
      title: '¡Movimiento detectado!',
      message: 'La mochila se está moviendo. Verifica que esté segura.',
      badge: 'Alerta',
      badgeClass: 'alert-badge'
    });
  }
}

  getNotifications(): AppNotification[] {
    return this.notifications$.getValue();
  }
}