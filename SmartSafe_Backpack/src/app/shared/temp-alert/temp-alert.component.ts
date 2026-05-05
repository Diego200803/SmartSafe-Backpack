import { Component, Input } from '@angular/core';

interface TempAlert {
  level: number;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: string;
  title: string;
  recs: string[];
}

@Component({
  standalone: false,
  selector: 'app-temp-alert',
  templateUrl: './temp-alert.component.html',
  styleUrls: ['./temp-alert.component.scss']
})
export class TempAlertComponent {
  @Input() temperatura: number = 0;
  @Input() isConnected: boolean = false;

  get alert(): TempAlert | null {
    if (!this.isConnected || this.temperatura <= 0) return null;
    const t = this.temperatura;
    if (t >= 40) return {
      level: 4,
      color: '#9c27b0',
      borderColor: 'rgba(156, 39, 176, 0.5)',
      bgColor: 'rgba(156, 39, 176, 0.1)',
      icon: 'warning',
      title: '⚠️ Temperatura peligrosa',
      recs: [
        'Quédate en espacios frescos o con AC',
        'Hidratación constante',
        'Evita actividad física al aire libre'
      ]
    };
    if (t >= 35) return {
      level: 3,
      color: '#f44336',
      borderColor: 'rgba(244, 67, 54, 0.5)',
      bgColor: 'rgba(244, 67, 54, 0.1)',
      icon: 'thermometer',
      title: 'Calor intenso',
      recs: [
        'Evita salir entre 12h–15h',
        'Usa protector solar',
        'Lleva agua y toma descansos a la sombra'
      ]
    };
    if (t >= 30) return {
      level: 2,
      color: '#ff9800',
      borderColor: 'rgba(255, 152, 0, 0.5)',
      bgColor: 'rgba(255, 152, 0, 0.1)',
      icon: 'thermometer-outline',
      title: 'Hace calor',
      recs: [
        'Usa ropa suelta y ligera',
        'Lleva una botella de agua'
      ]
    };
    if (t >= 27) return {
      level: 1,
      color: '#ffd600',
      borderColor: 'rgba(255, 214, 0, 0.5)',
      bgColor: 'rgba(255, 214, 0, 0.08)',
      icon: 'thermometer-outline',
      title: 'Temperatura cálida',
      recs: ['Mantente hidratado']
    };
    return null;
  }
}
