import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { VolunteerFormData, SaveVolunteerResponse } from '../models/volunteer.model';

@Injectable({
  providedIn: 'root',
})
export class VolunteerService {
  // L'URL de base de votre API (par exemple : http://localhost:4242/api)
  private apiUrl = environment.apiUrl; 
  constructor(private http: HttpClient) {}

  /**
   * Enregistre les données du bénévole en base de données
   * @param volunteerData Les données du formulaire bénévole
   * @returns Un observable contenant la réponse du serveur
   */
  saveVolunteerData(volunteerData: VolunteerFormData): Observable<SaveVolunteerResponse> {
    console.log("📦 [volunteer.service] Payload complet envoyé au back:", volunteerData);
    return this.http.post<SaveVolunteerResponse>(`${this.apiUrl}/benevolat/signup`, volunteerData).pipe(
      map((response) => {
        console.log("💾 [volunteer.service] Réponse brute saveVolunteerData:", response);
        console.log("💾 [volunteer.service] tracking extrait:", response?.tracking);
        return response;
      })
    );
  }

  /**
   * Récupère la liste des bénévoles par email
   * @param email L'email du bénévole
   * @returns Un observable contenant la liste des bénévoles
   */
  getVolunteersByEmail(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/volunteers`, { email });
  }

  /**
   * Récupère tous les bénévoles d'une association
   * @param asso Le nom de l'association
   * @returns Un observable contenant la liste des bénévoles
   */
  getVolunteersByAssociation(asso: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/volunteers/by-association`, { asso });
  }

  verifyVolunteerEmail(token: string): Observable<any> {
    console.log('🔍 [volunteer.service] Vérification email avec token:', token);
    return this.http.get(`${this.apiUrl}/benevolat/verify-email/${token}`).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Réponse vérification email:', response);
      })
    );
  }

  /**
   * Connexion d'un bénévole
   * @param email L'email du bénévole
   * @param password Le mot de passe du bénévole
   * @returns Un observable contenant la réponse du serveur
   */
  signin(email: string, password: string): Observable<any> {
    console.log('🔐 [volunteer.service] Tentative de connexion pour:', email);
    return this.http.post(`${this.apiUrl}/benevolat/signin`, { email, password }, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Connexion réussie:', response);
      })
    );
  }

  /**
   * Demande de réinitialisation de mot de passe pour un bénévole
   * @param email L'email du bénévole
   * @returns Un observable contenant la réponse du serveur
   */
  requestPasswordReset(email: string): Observable<{ message: string }> {
    console.log('🔑 [volunteer.service] Demande de réinitialisation pour:', email);
    return this.http.post<{ message: string }>(`${this.apiUrl}/benevolat/request-password-reset`, { email }, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Demande envoyée:', response);
      })
    );
  }

  /**
   * Réinitialise le mot de passe avec un token
   * @param token Le token de réinitialisation
   * @param newPassword Le nouveau mot de passe
   * @param confirmPassword La confirmation du nouveau mot de passe
   * @returns Un observable contenant la réponse du serveur
   */
  resetPasswordWithToken(token: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    console.log('🔑 [volunteer.service] Réinitialisation du mot de passe avec token');
    return this.http.post<{ message: string }>(`${this.apiUrl}/benevolat/reset-password`, {
      token,
      newPassword,
      confirmPassword
    }, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Mot de passe réinitialisé:', response);
      })
    );
  }

  /**
   * Demande un code OTP pour vérifier l'email
   * @param email L'email du bénévole
   * @param confirmEmail La confirmation de l'email
   * @param associationName Le nom de l'association
   * @returns Un observable contenant la réponse du serveur
   */
  requestOTP(email: string, confirmEmail: string, associationName: string): Observable<{ message: string; expiresIn: number }> {
    console.log('🔑 [volunteer.service] Demande OTP pour:', email);
    return this.http.post<{ message: string; expiresIn: number }>(`${this.apiUrl}/benevolat/request-otp`, {
      email,
      confirmEmail,
      associationName
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] OTP demandé:', response);
      })
    );
  }

  /**
   * Vérifie le code OTP
   * @param email L'email du bénévole
   * @param code Le code OTP à vérifier
   * @returns Un observable contenant le token de continuation
   */
  verifyOTP(email: string, code: string): Observable<{ message: string; token: string; email: string }> {
    console.log('🔍 [volunteer.service] Vérification OTP pour:', email);
    return this.http.post<{ message: string; token: string; email: string }>(`${this.apiUrl}/benevolat/verify-otp`, {
      email,
      code
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] OTP vérifié:', response);
      })
    );
  }

  /**
   * Complète l'inscription avec toutes les informations
   * @param token Le token de continuation
   * @param volunteerData Les données complètes du bénévole
   * @returns Un observable contenant la réponse du serveur
   */
  completeSignup(token: string, volunteerData: VolunteerFormData): Observable<{ message: string; trackingId: string }> {
    console.log('📝 [volunteer.service] Complétion de l\'inscription');
    return this.http.post<{ message: string; trackingId: string }>(`${this.apiUrl}/benevolat/complete-signup`, {
      token,
      ...volunteerData
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Inscription complétée:', response);
      })
    );
  }

  /**
   * Récupère les informations de profil du bénévole connecté
   * @returns Un observable contenant le profil
   */
  getProfile(): Observable<any> {
    console.log('👤 [volunteer.service] Récupération du profil');
    return this.http.get<any>(`${this.apiUrl}/benevolat/profile`, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Profil récupéré:', response);
      })
    );
  }

  /**
   * Demande une réinitialisation de mot de passe pour le bénévole connecté
   * Cette méthode ne nécessite pas d'email car le backend récupère l'email de l'utilisateur connecté
   * @returns Un observable contenant la réponse du serveur
   */
  requestPasswordResetForCurrentUser(): Observable<{ message: string }> {
    console.log('🔑 [volunteer.service] Demande de réinitialisation de mot de passe pour l\'utilisateur connecté');
    return this.http.post<{ message: string }>(`${this.apiUrl}/benevolat/request-password-reset-current-user`, {}, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Demande de réinitialisation envoyée:', response);
      })
    );
  }

  /**
   * Met à jour les informations modifiables du profil
   * @param profileData Les données à mettre à jour
   * @returns Un observable contenant la réponse du serveur
   */
  updateProfile(profileData: any): Observable<any> {
    console.log('✏️ [volunteer.service] Mise à jour du profil');
    return this.http.patch<any>(`${this.apiUrl}/benevolat/profile`, profileData, {
      withCredentials: true
    }).pipe(
      tap(response => {
        console.log('✅ [volunteer.service] Profil mis à jour:', response);
      })
    );
  }

}
