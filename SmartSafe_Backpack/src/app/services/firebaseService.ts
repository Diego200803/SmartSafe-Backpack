import { Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User,
  updateProfile
} from '@angular/fire/auth';

import { Observable } from 'rxjs';
import { Firestore, doc, setDoc, getDoc, collection } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {

  constructor(
    private auth: Auth,
    private firestore: Firestore) { }

  // Obtener el usuario actual
  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }


  // ⬇️ MÉTODO PARA GUARDAR DATOS DEL USUARIO EN FIRESTORE
  async saveUserData(email: string, name: string, uid: string): Promise<any> {
    try {
      // Crear referencia al documento con el email como ID
      const userDocRef = doc(this.firestore, `usuarios/${email}`);

      // Datos a guardar
      const userData = {
        nombre: name,
        correo: email,
        uid: uid,
        fechaRegistro: new Date().toISOString(),
        activo: true
      };

      // Guardar en Firestore
      await setDoc(userDocRef, userData);

      return { success: true };
    } catch (error: any) {
      console.error('Error guardando datos del usuario:', error);
      return { success: false, error: error.message };
    }
  }


  async getUserData(email: string): Promise<any> {
    try {
      const userDocRef = doc(this.firestore, `usuarios/${email}`);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        return { success: true, data: userDoc.data() };
      } else {
        return { success: false, error: 'Usuario no encontrado' };
      }
    } catch (error: any) {
      console.error('Error obteniendo datos del usuario:', error);
      return { success: false, error: error.message };
    }
  }

  // Registrar nuevo usuario
  async register(email: string, password: string, displayName: string): Promise<any> {
    try {
      // 1. Crear usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      // 2. Actualizar el perfil con el nombre
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });

        // 3. Guardar datos adicionales en Firestore
        const saveResult = await this.saveUserData(
          email,
          displayName,
          userCredential.user.uid
        );

        if (!saveResult.success) {
          console.error('Error guardando datos en Firestore:', saveResult.error);
          // Aunque falle Firestore, el usuario ya está creado en Auth
        }
      }

      return { success: true, user: userCredential.user };


      
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  }

  // Iniciar sesión
   async login(email: string, password: string): Promise<any> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      // Opcional: Obtener datos del usuario desde Firestore al iniciar sesión
      const userData = await this.getUserData(email);

      return {
        success: true,
        user: userCredential.user,
        userData: userData.success ? userData.data : null
      };
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  }

  // Cerrar sesión
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }

  // Recuperar contraseña
  async resetPassword(email: string): Promise<any> {
    try {
      await sendPasswordResetEmail(this.auth, email);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  }

  // Mensajes de error en español
  private getErrorMessage(errorCode: string): string {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'Este correo ya está registrado',
      'auth/invalid-email': 'Correo electrónico inválido',
      'auth/operation-not-allowed': 'Operación no permitida',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
      'auth/user-not-found': 'No existe una cuenta con este correo',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
      'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
      'auth/invalid-credential': 'Credenciales inválidas'
    };

    return errorMessages[errorCode] || 'Ha ocurrido un error. Intenta nuevamente';
  }
}
