import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Database, ref, onValue } from '@angular/fire/database';
import { FirebaseService } from '../../services/firebaseService';
import { PopoverController, AlertController } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tab1/profile-popover.component';
import { Router } from '@angular/router';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

export interface Materia {
  id: string;
  nombre: string;
  color: string;
  uid: string;
}

export interface SlotHora {
  id: string;
  horaInicio: string;
  horaFin: string;
}

export interface CeldaGrid {
  slotId: string;
  dia: string;
  contenido: { tipo: 'materia' | 'recreo'; materiaId?: string } | null;
}

export interface ConfigDia {
  horaInicio: string;
  horaFin: string;
  tieneRecreo: boolean;
  recreoInicio: string;
  recreoFin: string;
}

export interface HorarioData {
  dias: string[];
  slots: SlotHora[];
  grid: { [slotId: string]: { [dia: string]: { tipo: 'materia' | 'recreo'; materiaId?: string } | null } };
  materias: Materia[];
  guardado: boolean;
}

@Component({
  standalone: false,
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss']
})
export class Tab3Page implements OnInit, OnDestroy {

  userFullName: string = 'Usuario';
  userEmail: string = '';

  isConnected: boolean = false;
  lastDataUpdate: number = 0;
  lastUpdateText: string = 'Esperando...';
  private monitoringInterval: any;
  private readonly CONNECTION_TIMEOUT = 8000;
  private readonly DISCONNECT_CONFIRMATION = 12000;
  private disconnectionStartTime: number = 0;

  diaHoy: string = '';
  cuadernosIngresados: string[] = [];
  mensajeEstado: string = '';
  ultimoIngresado: string = '';

  horarioData: HorarioData = {
    dias: [], slots: [], grid: {}, materias: [], guardado: false
  };
  horarioConfigurado: boolean = false;

  vistaActual: 'horario' | 'cuadernos' = 'horario';

  // Modales
  showModalDias: boolean = false;
  showModalMateria: boolean = false;
  showModalEditSlot: boolean = false;
  showModalEditCelda: boolean = false;
  editando: boolean = false;

  // Días
  diasDisponibles = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  diasSeleccionados: string[] = [];

  // Materia temp
  materiaTemp: Materia = { id: '', nombre: '', color: '#3b82f6', uid: '' };
  coloresDisponibles = [
    '#3b82f6', '#ef4444', '#22c55e', '#f97316',
    '#a855f7', '#ec4899', '#0ea5e9', '#eab308',
    '#14b8a6', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16'
  ];
  escuchandoUID: boolean = false;
  private uidListener: any = null;

  // Slot editando
  slotEditando: SlotHora = { id: '', horaInicio: '07:00', horaFin: '07:40' };

  // Celda editando
  celdaEditando: { slotId: string; dia: string } = { slotId: '', dia: '' };

  // Drag state
  dragItem: { tipo: 'materia' | 'recreo'; materiaId?: string } | null = null;

  private coloresGrid = [
    '#3b82f6', '#ef4444', '#22c55e', '#f97316',
    '#a855f7', '#ec4899', '#0ea5e9', '#eab308',
    '#14b8a6', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16'
  ];

  get esMateriaEdicion(): boolean {
    return this.horarioData.materias.some(m => m.id === this.materiaTemp.id);
  }

  get dropListIds(): string[] {
    const ids: string[] = [];
    this.horarioData.slots.forEach(slot => {
      this.horarioData.dias.forEach(dia => {
        ids.push('drop-' + slot.id + '-' + dia);
      });
    });
    ids.push('panel-materias');
    return ids;
  }

  constructor(
    private db: Database,
    private zone: NgZone,
    private firebaseService: FirebaseService,
    private popoverController: PopoverController,
    private alertController: AlertController,
    private router: Router
  ) {}

  ngOnInit() {
    this.detectarDia();
    this.cargarHorario();
    this.cargarCuadernosGuardados();
    this.escucharFirebase();
    this.startMonitoring();
    this.loadUserData();
  }

  ngOnDestroy() {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.uidListener) { this.uidListener(); this.uidListener = null; }
  }

  // ── Horario ──────────────────────────────────────────

  cargarHorario() {
    const saved = localStorage.getItem('smartsafe_horario_v2');
    if (saved) {
      this.horarioData = JSON.parse(saved);
      this.horarioConfigurado = this.horarioData.dias.length > 0;
    }
  }

  guardarHorario() {
    localStorage.setItem('smartsafe_horario_v2', JSON.stringify(this.horarioData));
  }

  // ── Wizard días ──────────────────────────────────────

  abrirModalDias() {
    this.diasSeleccionados = [...this.horarioData.dias];
    this.showModalDias = true;
  }

  toggleDia(dia: string) {
    const i = this.diasSeleccionados.indexOf(dia);
    if (i >= 0) this.diasSeleccionados.splice(i, 1);
    else this.diasSeleccionados.push(dia);
  }

  isDiaSeleccionado(dia: string): boolean {
    return this.diasSeleccionados.includes(dia);
  }

  confirmarDias() {
    if (!this.diasSeleccionados.length) return;
    const orden = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    this.diasSeleccionados.sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
    this.horarioData.dias = [...this.diasSeleccionados];

    // Generar 10 slots iniciales si no hay
    if (!this.horarioData.slots.length) {
      this.horarioData.slots = [];
      let minutos = 7 * 60; // 07:00
      for (let i = 0; i < 10; i++) {
        const id = 'slot_' + i;
        this.horarioData.slots.push({
          id,
          horaInicio: this.minutesToTime(minutos),
          horaFin: this.minutesToTime(minutos + 40)
        });
        if (!this.horarioData.grid[id]) {
          this.horarioData.grid[id] = {};
          this.horarioData.dias.forEach(d => { this.horarioData.grid[id][d] = null; });
        }
        minutos += 40;
      }
    } else {
      // Asegurar que los nuevos días tengan celdas
      this.horarioData.slots.forEach(slot => {
        this.horarioData.dias.forEach(d => {
          if (this.horarioData.grid[slot.id]?.[d] === undefined) {
            if (!this.horarioData.grid[slot.id]) this.horarioData.grid[slot.id] = {};
            this.horarioData.grid[slot.id][d] = null;
          }
        });
      });
    }

    this.horarioConfigurado = true;
    this.guardarHorario();
    this.showModalDias = false;
  }

  // ── Slots ────────────────────────────────────────────

  agregarSlot() {
    const ultimo = this.horarioData.slots[this.horarioData.slots.length - 1];
    const nuevoInicio = ultimo ? ultimo.horaFin : '07:00';
    const id = 'slot_' + Date.now();
    const nuevoSlot: SlotHora = {
      id,
      horaInicio: nuevoInicio,
      horaFin: this.minutesToTime(this.timeToMinutes(nuevoInicio) + 40)
    };
    this.horarioData.slots.push(nuevoSlot);
    this.horarioData.grid[id] = {};
    this.horarioData.dias.forEach(d => { this.horarioData.grid[id][d] = null; });
    this.guardarHorario();
  }

  abrirEditSlot(slot: SlotHora) {
    if (this.horarioData.guardado) return;
    this.slotEditando = { ...slot };
    this.showModalEditSlot = true;
  }

  guardarEditSlot() {
    const idx = this.horarioData.slots.findIndex(s => s.id === this.slotEditando.id);
    if (idx >= 0) this.horarioData.slots[idx] = { ...this.slotEditando };
    this.guardarHorario();
    this.showModalEditSlot = false;
  }

  async eliminarSlot(slot: SlotHora) {
    if (this.horarioData.guardado) return;
    const alert = await this.alertController.create({
      header: 'Eliminar fila',
      message: '¿Eliminar esta fila de horario?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', handler: () => {
          this.horarioData.slots = this.horarioData.slots.filter(s => s.id !== slot.id);
          delete this.horarioData.grid[slot.id];
          this.guardarHorario();
        }}
      ]
    });
    await alert.present();
  }

  // ── Celda ────────────────────────────────────────────

  getCelda(slotId: string, dia: string) {
    return this.horarioData.grid[slotId]?.[dia] || null;
  }

  getMateriaById(id: string): Materia | undefined {
    return this.horarioData.materias.find(m => m.id === id);
  }

  limpiarCelda(slotId: string, dia: string) {
    if (this.horarioData.guardado) return;
    if (this.horarioData.grid[slotId]) {
      this.horarioData.grid[slotId][dia] = null;
      this.guardarHorario();
    }
  }

// ── Drag & Drop (Mouse) ──────────────────────────────
onDragStartMateria(event: DragEvent, tipo: 'materia' | 'recreo', materiaId?: string) {
  this.dragItem = { tipo, materiaId };
  this.dragSourceSlot = '';
  this.dragSourceDia = '';
}

dragSourceSlot: string = '';
dragSourceDia: string = '';

onDragStartCelda(event: DragEvent, slotId: string, dia: string) {
  if (this.horarioData.guardado) { event.preventDefault(); return; }
  const celda = this.getCelda(slotId, dia);
  if (!celda) { event.preventDefault(); return; }
  this.dragItem = { ...celda };
  this.dragSourceSlot = slotId;
  this.dragSourceDia = dia;
  // NO limpiar aquí — limpiar solo cuando el drop sea exitoso
}

onDragOver(event: DragEvent) {
  event.preventDefault();
  // Auto-scroll al arrastrar cerca de los bordes
  const threshold = 80;
  const scrollSpeed = 8;
  const y = event.clientY;
  const viewH = window.innerHeight;
  if (y < threshold) {
    window.scrollBy(0, -scrollSpeed);
  } else if (y > viewH - threshold) {
    window.scrollBy(0, scrollSpeed);
  }
}

onDropEnCelda(slotId: string, dia: string) {
  if (!this.dragItem || this.horarioData.guardado) return;

  // Limpiar origen solo si venía de una celda del grid
  if (this.dragSourceSlot && this.dragSourceDia) {
    if (this.horarioData.grid[this.dragSourceSlot]) {
      this.horarioData.grid[this.dragSourceSlot][this.dragSourceDia] = null;
    }
  }

  if (!this.horarioData.grid[slotId]) this.horarioData.grid[slotId] = {};
  this.horarioData.grid[slotId][dia] = { ...this.dragItem };

  this.dragItem = null;
  this.dragSourceSlot = '';
  this.dragSourceDia = '';
  this.guardarHorario();
}

onDragEnd(event: DragEvent) {
  // Si el drop no fue en ninguna celda válida, restaurar
  this.dragItem = null;
  this.dragSourceSlot = '';
  this.dragSourceDia = '';
}

// ── Touch (Móvil) ────────────────────────────────────
touchStartX: number = 0;
touchStartY: number = 0;
touchDragItem: { tipo: 'materia' | 'recreo'; materiaId?: string } | null = null;
touchSourceSlot: string = '';
touchSourceDia: string = '';
private scrollInterval: any = null;

onTouchStartPanel(event: TouchEvent, tipo: 'materia' | 'recreo', materiaId?: string) {
  if (this.horarioData.guardado) return;
  this.touchStartX = event.touches[0].clientX;
  this.touchStartY = event.touches[0].clientY;
  this.touchDragItem = { tipo, materiaId };
  this.touchSourceSlot = '';
  this.touchSourceDia = '';
}

onTouchStartCelda(event: TouchEvent, slotId: string, dia: string) {
  if (this.horarioData.guardado) return;
  const celda = this.getCelda(slotId, dia);
  if (!celda) return;
  this.touchStartX = event.touches[0].clientX;
  this.touchStartY = event.touches[0].clientY;
  this.touchDragItem = { ...celda };
  this.touchSourceSlot = slotId;
  this.touchSourceDia = dia;
  // NO limpiar aquí
}

onTouchMove(event: TouchEvent) {
  if (!this.touchDragItem) return;
  const touch = event.touches[0];
  const threshold = 100;
  const scrollSpeed = 6;
  const y = touch.clientY;
  const viewH = window.innerHeight;

  if (this.scrollInterval) clearInterval(this.scrollInterval);

  if (y < threshold) {
    this.scrollInterval = setInterval(() => window.scrollBy(0, -scrollSpeed), 16);
  } else if (y > viewH - threshold) {
    this.scrollInterval = setInterval(() => window.scrollBy(0, scrollSpeed), 16);
  }
}

onTouchEnd(event: TouchEvent) {
  if (this.scrollInterval) { clearInterval(this.scrollInterval); this.scrollInterval = null; }
  if (!this.touchDragItem || this.horarioData.guardado) return;

  const touch = event.changedTouches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!el) { this.touchDragItem = null; return; }

  const celdaEl = el.closest('[data-slot-id]') as HTMLElement;
  if (celdaEl) {
    const slotId = celdaEl.getAttribute('data-slot-id')!;
    const dia = celdaEl.getAttribute('data-dia')!;

    // Limpiar origen solo si era de una celda
    if (this.touchSourceSlot && this.touchSourceDia) {
      if (this.horarioData.grid[this.touchSourceSlot]) {
        this.horarioData.grid[this.touchSourceSlot][this.touchSourceDia] = null;
      }
    }

    if (!this.horarioData.grid[slotId]) this.horarioData.grid[slotId] = {};
    this.horarioData.grid[slotId][dia] = { ...this.touchDragItem };
    this.guardarHorario();
  }

  this.touchDragItem = null;
  this.touchSourceSlot = '';
  this.touchSourceDia = '';
}

  // ── Modal Materia ────────────────────────────────────

  abrirModalMateria(materia?: Materia) {
    if (materia) {
      this.materiaTemp = { ...materia };
    } else {
      const colorIndex = this.horarioData.materias.length % this.coloresGrid.length;
      this.materiaTemp = {
        id: 'mat_' + Date.now(),
        nombre: '',
        color: this.coloresGrid[colorIndex],
        uid: ''
      };
    }
    this.escuchandoUID = false;
    this.showModalMateria = true;
  }

  seleccionarColor(color: string) {
    this.materiaTemp.color = color;
  }

  iniciarEscaneoUID() {
    this.escuchandoUID = true;
    const uidRef = ref(this.db, '/NFC/UID');
    this.uidListener = onValue(uidRef, (snapshot) => {
      this.zone.run(() => {
        const uid = snapshot.val();
        if (uid && uid !== '---') {
          this.materiaTemp.uid = uid;
          this.escuchandoUID = false;
          if (this.uidListener) { this.uidListener(); this.uidListener = null; }
        }
      });
    });
  }

  guardarMateria() {
    if (!this.materiaTemp.nombre.trim()) return;
    const idx = this.horarioData.materias.findIndex(m => m.id === this.materiaTemp.id);
    if (idx >= 0) {
      this.horarioData.materias[idx] = { ...this.materiaTemp };
    } else {
      if (this.horarioData.materias.length >= 13) return;
      this.horarioData.materias.push({ ...this.materiaTemp });
    }
    this.guardarHorario();
    this.showModalMateria = false;
    if (this.uidListener) { this.uidListener(); this.uidListener = null; }
  }

  async eliminarMateria(materia: Materia) {
    const alert = await this.alertController.create({
      header: 'Eliminar materia',
      message: `¿Eliminar ${materia.nombre}? Se quitará del horario también.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', handler: () => {
          // Limpiar del grid
          Object.keys(this.horarioData.grid).forEach(slotId => {
            Object.keys(this.horarioData.grid[slotId]).forEach(dia => {
              const c = this.horarioData.grid[slotId][dia];
              if (c?.tipo === 'materia' && c.materiaId === materia.id) {
                this.horarioData.grid[slotId][dia] = null;
              }
            });
          });
          this.horarioData.materias = this.horarioData.materias.filter(m => m.id !== materia.id);
          this.guardarHorario();
        }}
      ]
    });
    await alert.present();
  }

  // ── Guardar/Editar horario ───────────────────────────

  guardarHorarioFinal() {
    this.horarioData.guardado = true;
    this.guardarHorario();
    this.actualizarMensaje();
  }

  editarHorario() {
    this.horarioData.guardado = false;
    this.guardarHorario();
  }

  async resetearHorario() {
    const alert = await this.alertController.create({
      header: 'Resetear horario',
      message: 'Se borrará todo el horario y materias configuradas.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Resetear', handler: () => {
          this.horarioData = { dias: [], slots: [], grid: {}, materias: [], guardado: false };
          this.horarioConfigurado = false;
          this.guardarHorario();
        }}
      ]
    });
    await alert.present();
  }

  // ── Cuadernos ────────────────────────────────────────

  get materiasHoy(): Materia[] {
    if (!this.horarioData.guardado) return [];
    const idsHoy = new Set<string>();
    this.horarioData.slots.forEach(slot => {
      const celda = this.getCelda(slot.id, this.diaHoy);
      if (celda?.tipo === 'materia' && celda.materiaId) {
        idsHoy.add(celda.materiaId);
      }
    });
    return this.horarioData.materias.filter(m => idsHoy.has(m.id));
  }

  cargarCuadernosGuardados() {
    const saved = localStorage.getItem('cuadernos_' + this.getDiaKey());
    this.cuadernosIngresados = saved ? JSON.parse(saved) : [];
    this.actualizarMensaje();
  }

  guardarCuadernos() {
    localStorage.setItem('cuadernos_' + this.getDiaKey(), JSON.stringify(this.cuadernosIngresados));
  }

  getDiaKey(): string {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
  }

  reiniciarEscaneo() {
    this.cuadernosIngresados = [];
    this.ultimoIngresado = '';
    this.guardarCuadernos();
    this.actualizarMensaje();
  }

  actualizarMensaje() {
    const esFinde = this.diaHoy === 'Sábado' || this.diaHoy === 'Domingo';
    if (esFinde) { this.mensajeEstado = '🌅 ¡Es fin de semana!'; return; }
    if (!this.horarioData.guardado) { this.mensajeEstado = '📋 Guarda el horario primero'; return; }
    const pendientes = this.materiasHoy.filter(m => !this.cuadernosIngresados.includes(m.uid));
    if (pendientes.length === 0) this.mensajeEstado = '🎒 ¡Todo listo para hoy!';
    else this.mensajeEstado = `⏳ Faltan ${pendientes.length} cuaderno(s)`;
  }

  // ── Firebase ─────────────────────────────────────────

  escucharFirebase() {
    const heartbeatRef = ref(this.db, '/NFC/heartbeat');
    onValue(heartbeatRef, (snapshot) => {
      this.zone.run(() => {
        const hb = snapshot.val();
        if (hb && hb > 0) this.lastDataUpdate = Date.now();
      });
    });

    const nfcRef = ref(this.db, '/NFC/detectada');
    onValue(nfcRef, (snapshot) => {
      this.zone.run(() => {
        if (!snapshot.val()) return;
        const uidRef = ref(this.db, '/NFC/UID');
        onValue(uidRef, (uidSnapshot) => {
          this.zone.run(() => {
            const uid = uidSnapshot.val()?.toLowerCase();
            if (!uid || uid === '---') return;
            const materia = this.horarioData.materias.find(m => m.uid.toLowerCase() === uid);
            if (!materia) return;
            if (!this.cuadernosIngresados.includes(uid)) {
              this.cuadernosIngresados.push(uid);
              this.guardarCuadernos();
              this.ultimoIngresado = `Cuaderno de ${materia.nombre} ingresado`;
              this.actualizarMensaje();
              setTimeout(() => { this.ultimoIngresado = ''; }, 3000);
            }
          });
        }, { onlyOnce: true });
      });
    });
  }

  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionStatus();
      this.updateLastUpdateText();
    }, 1000);
  }

  checkConnectionStatus() {
    const now = Date.now();
    const timeSince = now - this.lastDataUpdate;
    if (timeSince < this.CONNECTION_TIMEOUT) {
      this.disconnectionStartTime = 0;
      if (!this.isConnected) this.isConnected = true;
      return;
    }
    if (!this.isConnected) return;
    if (this.disconnectionStartTime === 0) { this.disconnectionStartTime = now; return; }
    if (now - this.disconnectionStartTime >= this.DISCONNECT_CONFIRMATION) {
      this.isConnected = false;
      this.disconnectionStartTime = 0;
    }
  }

  updateLastUpdateText() {
    if (!this.isConnected) { this.lastUpdateText = 'ESP32 desconectado'; return; }
    if (this.lastDataUpdate === 0) { this.lastUpdateText = 'Esperando...'; return; }
    const diff = Math.floor((Date.now() - this.lastDataUpdate) / 1000);
    if (diff < 2) this.lastUpdateText = 'ahora mismo';
    else if (diff < 60) this.lastUpdateText = 'hace ' + diff + ' seg';
    else this.lastUpdateText = 'hace ' + Math.floor(diff / 60) + ' min';
  }

  detectarDia() {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    this.diaHoy = dias[new Date().getDay()];
    this.actualizarMensaje();
  }

  timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // ── Usuario ──────────────────────────────────────────

  async loadUserData() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser) {
      this.userEmail = currentUser.email || '';
      if (currentUser.displayName) {
        this.userFullName = currentUser.displayName;
      } else if (currentUser.email) {
        const userData = await this.firebaseService.getUserData(currentUser.email);
        if (userData.success && userData.data) this.userFullName = userData.data.nombre;
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
      componentProps: { name: this.userFullName, email: this.userEmail, onLogout: () => this.logout() }
    });
    await popover.present();
  }

  async logout() {
    const alert = await this.alertController.create({
      header: '¿Cerrar sesión?',
      message: '¿Estás seguro?',
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