import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../services/firebaseService';
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  email: string = '';
  password: string = '';
  showPassword: boolean = false;

  constructor(
    private firebaseService: FirebaseService,
    private router: Router,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) {}

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    if (!this.email || !this.password) {
      this.showAlert('Error', 'Por favor completa todos los campos');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Iniciando sesión...',
      spinner: 'crescent'
    });
    await loading.present();

    const result = await this.firebaseService.login(this.email, this.password);
    await loading.dismiss();

    if (result.success) {
      this.router.navigate(['/tabs/tab1']);
    } else {
      this.showAlert('Error', result.error);
    }
  }

  async forgotPassword() {
    const alert = await this.alertController.create({
      header: 'Recuperar Contraseña',
      message: 'Ingresa tu correo electrónico',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'correo@ejemplo.com'
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Enviar',
          handler: async (data) => {
            if (data.email) {
              const loading = await this.loadingController.create({
                message: 'Enviando correo...'
              });
              await loading.present();

              const result = await this.firebaseService.resetPassword(data.email);
              await loading.dismiss();

              if (result.success) {
                this.showAlert('Éxito', 'Revisa tu correo para restablecer tu contraseña');
              } else {
                this.showAlert('Error', result.error);
              }
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  ngOnInit() {
  }

}