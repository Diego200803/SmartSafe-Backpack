import { Component, OnInit, NgZone } from '@angular/core';
import { Database, ref, onValue } from '@angular/fire/database';

@Component({
  standalone: false,
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss']
})
export class Tab3Page implements OnInit {

  diaHoy: string = '';
  materiasHoy: string[] = [];
  cuadernosIngresados: string[] = [];
  mensajeEstado: string = '';
  ultimoIngresado: string = '';

// 🔥 Estados de conexión ESP32
isConnected: boolean = false;
lastDataUpdate: number = 0;
lastUpdateText: string = 'Esperando...';
private monitoringInterval: any;
private readonly CONNECTION_TIMEOUT = 8000;
private readonly DISCONNECT_CONFIRMATION = 12000;
private disconnectionStartTime: number = 0;

  readonly uidsConocidos: string[] = [
    '3:8:84:a9'
  ];

  readonly horario: { [dia: string]: string[] } = {
    'Lunes':     ['Matemáticas', 'Lengua y Literatura', 'Ciencias Naturales', 'Educación Física'],
    'Martes':    ['Lengua y Literatura', 'Matemáticas', 'Estudios Sociales', 'Ciencias Naturales', 'Religión'],
    'Miércoles': ['Matemáticas', 'Lengua y Literatura', 'Ciencias Naturales', 'Estudios Sociales', 'Orientación', 'Educación Física'],
    'Jueves':    ['Ciencias Naturales', 'Educación Física', 'Matemáticas', 'Religión'],
    'Viernes':   ['Estudios Sociales', 'Lengua y Literatura', 'Orientación', 'Religión', 'Matemáticas']
  };

  constructor(private db: Database, private zone: NgZone) {}

  ngOnInit() {
    this.detectarDia();
    this.cargarCuadernosGuardados();
    this.escucharFirebase();
    this.startMonitoring();
    this.programarActualizacionMedianoche();
  }

  ngOnDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  // 🔥 Monitoreo de conexión
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionStatus();
      this.updateLastUpdateText();
    }, 1000);
  }

  checkConnectionStatus() {
    const now = Date.now();
    const timeSinceLastData = now - this.lastDataUpdate;

    if (timeSinceLastData < this.CONNECTION_TIMEOUT) {
      this.disconnectionStartTime = 0;
      if (!this.isConnected) {
        this.isConnected = true;
      }
      return;
    }

    if (!this.isConnected) return;

    if (this.disconnectionStartTime === 0) {
      this.disconnectionStartTime = now;
      return;
    }

    const timeDisconnected = now - this.disconnectionStartTime;
    if (timeDisconnected >= this.DISCONNECT_CONFIRMATION) {
      this.isConnected = false;
      this.disconnectionStartTime = 0;
    }
  }

  updateLastUpdateText() {
    if (!this.isConnected) {
      this.lastUpdateText = 'ESP32 desconectado';
      return;
    }
    if (this.lastDataUpdate === 0) {
      this.lastUpdateText = 'Esperando datos...';
      return;
    }
    const timeDiff = Math.floor((Date.now() - this.lastDataUpdate) / 1000);
    if (timeDiff < 2) this.lastUpdateText = 'ahora mismo';
    else if (timeDiff < 60) this.lastUpdateText = 'hace ' + timeDiff + ' seg';
    else this.lastUpdateText = 'hace ' + Math.floor(timeDiff / 60) + ' min';
  }

  detectarDia() {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoy = new Date().getDay();
    this.diaHoy = dias[hoy];
    this.materiasHoy = this.horario[this.diaHoy] || [];
    this.actualizarMensaje();
  }

  cargarCuadernosGuardados() {
    const hoyKey = this.getDiaKey();
    const guardados = localStorage.getItem('cuadernos_' + hoyKey);
    if (guardados) {
      this.cuadernosIngresados = JSON.parse(guardados);
    } else {
      this.cuadernosIngresados = [];
    }
    this.actualizarMensaje();
  }

  guardarCuadernos() {
    const hoyKey = this.getDiaKey();
    localStorage.setItem('cuadernos_' + hoyKey, JSON.stringify(this.cuadernosIngresados));
  }

  getDiaKey(): string {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
  }

  // 🔥 Botón reiniciar escaneo
  reiniciarEscaneo() {
    this.cuadernosIngresados = [];
    this.ultimoIngresado = '';
    this.guardarCuadernos();
    this.actualizarMensaje();
  }

escucharFirebase() {
  // 🔥 Heartbeat exclusivo del NFC para detectar si ESP32 está prendido
  const heartbeatRef = ref(this.db, '/NFC/heartbeat');
  onValue(heartbeatRef, (snapshot) => {
    const heartbeat = snapshot.val();
    this.zone.run(() => {
      if (heartbeat && heartbeat > 0) {
        this.lastDataUpdate = Date.now();
      }
    });
  });

  // 🔥 Escuchar tarjeta NFC
  const nfcRef = ref(this.db, '/NFC/detectada');
  onValue(nfcRef, (snapshot) => {
    this.zone.run(() => {
      const detectada = snapshot.val();
      if (!detectada) return;

      // Leer UID cuando hay tarjeta
      const uidRef = ref(this.db, '/NFC/UID');
      onValue(uidRef, (uidSnapshot) => {
        this.zone.run(() => {
          const uid = uidSnapshot.val()?.toLowerCase();
          if (!this.uidsConocidos.includes(uid)) return;

          const primerMateria = this.materiasHoy[0];
          if (!primerMateria) return;

          if (!this.cuadernosIngresados.includes(primerMateria)) {
            this.cuadernosIngresados.push(primerMateria);
            this.guardarCuadernos();
            this.ultimoIngresado = `✅ Cuaderno de ${primerMateria} ingresado con éxito`;
            this.actualizarMensaje();
            setTimeout(() => { this.ultimoIngresado = ''; }, 3000);
          }
        });
      }, { onlyOnce: true });
    });
  });
}

  programarActualizacionMedianoche() {
    const ahora = new Date();
    const medianoche = new Date();
    medianoche.setHours(24, 0, 0, 0);
    const msHastaMedianoche = medianoche.getTime() - ahora.getTime();

    setTimeout(() => {
      this.detectarDia();
      this.cuadernosIngresados = [];
      this.guardarCuadernos();
      this.programarActualizacionMedianoche();
    }, msHastaMedianoche);
  }

  actualizarMensaje() {
    const esFinde = this.diaHoy === 'Sábado' || this.diaHoy === 'Domingo';
    if (esFinde) {
      this.mensajeEstado = '🌅 ¡Es fin de semana! No hay clases hoy';
      return;
    }
    const pendientes = this.getCuadernosPendientes();
    if (pendientes.length === 0) {
      this.mensajeEstado = '🎒 ¡Todo listo para el día de hoy!';
    } else {
      this.mensajeEstado = `⏳ Esperando cuaderno de: ${pendientes[0]}`;
    }
  }

  getCuadernosPendientes(): string[] {
    return this.materiasHoy.filter(m => !this.cuadernosIngresados.includes(m));
  }
}