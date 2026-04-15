import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private notifications$ = new BehaviorSubject<AppNotification[]>([]);
  notifications = this.notifications$.asObservable();

  // Control de notificaciones ya enviadas para no duplicar
  private sentNotifications = new Set<string>();

  // Cooldowns por tipo (ms)
  private readonly COOLDOWN = 5 * 60 * 1000; // 5 minutos
  private lastSent: { [key: string]: number } = {};

  getNotifications(): AppNotification[] {
    return this.notifications$.getValue();
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

  private add(notif: Omit<AppNotification, 'id' | 'timestamp' | 'timeText'>) {
    const id = Date.now().toString();
    const newNotif: AppNotification = {
      ...notif,
      id,
      timestamp: new Date(),
      timeText: 'Ahora mismo'
    };
    const current = this.notifications$.getValue();
    this.notifications$.next([newNotif, ...current]);
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

  // ── TEMPERATURA ─────────────────────────────────────
  checkTemperatura(temp: number) {
    if (temp <= 0) return;

    if (temp >= 35 && this.canSend('temp_alta')) {
      this.add({
        type: 'alert',
        icon: 'thermometer',
        iconClass: 'temperature-icon',
        title: 'Temperatura muy alta',
        message: `Temperatura actual: ${temp.toFixed(1)}°C. Se recomienda ropa ligera y mantenerse hidratado.`,
        badge: 'Alerta',
        badgeClass: 'alert-badge'
      });
    } else if (temp >= 28 && temp < 35 && this.canSend('temp_calor')) {
      this.add({
        type: 'warning',
        icon: 'thermometer',
        iconClass: 'temperature-icon',
        title: 'Temperatura elevada',
        message: `Temperatura actual: ${temp.toFixed(1)}°C. Se recomienda ropa fresca y llevar agua.`,
        badge: 'Importante',
        badgeClass: ''
      });
    } else if (temp <= 10 && this.canSend('temp_frio')) {
      this.add({
        type: 'info',
        icon: 'snow',
        iconClass: 'gps-icon',
        title: 'Temperatura baja',
        message: `Temperatura actual: ${temp.toFixed(1)}°C. Se recomienda llevar ropa abrigada.`,
        badge: 'Info',
        badgeClass: 'info-badge'
      });
    }
  }

  // ── UV ───────────────────────────────────────────────
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

  // ── GPS ──────────────────────────────────────────────
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

  // ── CONEXIÓN ESP32 ───────────────────────────────────
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
}