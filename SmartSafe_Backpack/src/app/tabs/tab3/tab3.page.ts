import { Component, OnInit } from '@angular/core';
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

  constructor(private db: Database) {}

  ngOnInit() {
    this.detectarDia();
    this.cargarCuadernosGuardados(); // 🔥 cargar desde localStorage
    this.escucharFirebase();
    this.programarActualizacionMedianoche();
  }

  detectarDia() {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoy = new Date().getDay();
    this.diaHoy = dias[hoy];
    this.materiasHoy = this.horario[this.diaHoy] || [];
    this.actualizarMensaje();
  }

  // 🔥 Cargar cuadernos guardados del día actual
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

  // 🔥 Guardar cuadernos en localStorage
  guardarCuadernos() {
    const hoyKey = this.getDiaKey();
    localStorage.setItem('cuadernos_' + hoyKey, JSON.stringify(this.cuadernosIngresados));
  }

  // 🔥 Clave única por día (ej: "2026-02-20")
  getDiaKey(): string {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
  }

  escucharFirebase() {
    const nfcRef = ref(this.db, '/NFC');
    onValue(nfcRef, (snapshot) => {
      const data = snapshot.val();
      if (!data || !data.detectada) return;

      const uid = data.UID?.toLowerCase();
      if (!this.uidsConocidos.includes(uid)) return;

      const primerMateria = this.materiasHoy[0];
      if (!primerMateria) return;

      if (!this.cuadernosIngresados.includes(primerMateria)) {
        this.cuadernosIngresados.push(primerMateria);
        this.guardarCuadernos(); // 🔥 guardar inmediatamente
        this.ultimoIngresado = `✅ Cuaderno de ${primerMateria} ingresado con éxito`;
        this.actualizarMensaje();

        setTimeout(() => {
          this.ultimoIngresado = '';
        }, 3000);
      }
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
      this.guardarCuadernos(); // 🔥 limpiar también en localStorage
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