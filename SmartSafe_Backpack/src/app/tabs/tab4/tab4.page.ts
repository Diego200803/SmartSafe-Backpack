import { Component, OnInit, ViewChildren, QueryList } from '@angular/core';
import { IonItemSliding } from '@ionic/angular';

@Component({
  standalone: false,
  selector: 'app-tab4',
  templateUrl: './tab4.page.html',
  styleUrls: ['./tab4.page.scss'],
})
export class Tab4Page implements OnInit {

  constructor() { }

  ngOnInit() {
  }

  // Función para eliminar notificación
  deleteNotification(slidingItem: IonItemSliding, event: Event) {
    // Obtener el elemento HTML padre
    const element = (event.target as HTMLElement).closest('ion-item-sliding');
    
    if (element) {
      // Agregar animación de salida
      element.classList.add('deleting');
      
      // Esperar a que termine la animación
      setTimeout(() => {
        slidingItem.close();
        element.style.display = 'none';
      }, 300);
    }
  }

}