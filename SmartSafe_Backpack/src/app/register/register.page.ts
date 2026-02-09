import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../services/firebaseService';
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  standalone: false,
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit{
  name: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  constructor(
    private firebaseService: FirebaseService,
    private router: Router,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) { }

  // Toggle para mostrar/ocultar contraseña
  togglePasswordVisibility(field: 'password' | 'confirm') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  // Calcular fortaleza de contraseña
  getPasswordStrength(): { level: string; class: string; text: string } {
    if (this.password.length === 0) {
      return { level: '0', class: '', text: '' };
    }

    let strength = 0;
    if (this.password.length >= 8) strength++;
    if (/[a-z]/.test(this.password)) strength++;
    if (/[A-Z]/.test(this.password)) strength++;
    if (/[0-9]/.test(this.password)) strength++;
    if (/[^a-zA-Z0-9]/.test(this.password)) strength++;

    if (strength <= 2) {
      return { level: '33', class: 'weak', text: 'Contraseña débil' };
    } else if (strength <= 4) {
      return { level: '66', class: 'medium', text: 'Contraseña media' };
    } else {
      return { level: '100', class: 'strong', text: 'Contraseña fuerte' };
    }
  }

  async register() {
    // Validaciones
    if (!this.name || !this.email || !this.password || !this.confirmPassword) {
      this.showAlert('Error', 'Por favor completa todos los campos');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.showAlert('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (this.password.length < 6) {
      this.showAlert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Mostrar loading
    const loading = await this.loadingController.create({
      message: 'Creando cuenta...',
      spinner: 'crescent'
    });
    await loading.present();

    // Registrar usuario
    const result = await this.firebaseService.register(
      this.email,
      this.password,
      this.name
    );

    await loading.dismiss();

    if (result.success) {
      this.showAlert('¡Éxito!', `Bienvenido ${this.name}! Tu cuenta ha sido creada correctamente`, () => {
        this.router.navigate(['/tabs/tab1']);
      });
    } else {
      this.showAlert('Error', result.error);
    }
  }

  async showAlert(header: string, message: string, handler?: () => void) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [{
        text: 'OK',
        handler: handler || (() => { })
      }]
    });
    await alert.present();
  }

  ngOnInit() {
  }
}