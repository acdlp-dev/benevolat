import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { VolunteerService } from '../../services/volunteer.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-volunteer-otp-verification',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
  ],
  templateUrl: './volunteer-otp-verification.component.html',
  styleUrls: ['./volunteer-otp-verification.component.scss']
})
export class VolunteerOtpVerificationComponent implements OnInit {
  otpForm: FormGroup;
  email = '';
  associationId = '';
  submitting = false;
  submitError = false;
  submitErrorMessage = '';
  
  // Timer pour le code OTP (10 minutes = 600 secondes)
  timeRemaining = 600;
  timerInterval: any;

  constructor(
    private router: Router,
    private volunteerService: VolunteerService,
    private fb: FormBuilder
  ) {
    this.otpForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });

    // Récupérer l'email depuis le state de navigation
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state) {
      this.email = navigation.extras.state['email'] || '';
      this.associationId = navigation.extras.state['associationId'] || '';
    }
  }

  ngOnInit(): void {
    // Si pas d'email, rediriger vers la page d'inscription
    if (!this.email) {
      this.router.navigate(['/signup']);
      return;
    }

    // Démarrer le timer
    this.startTimer();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      
      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
        this.submitError = true;
        this.submitErrorMessage = 'Le code a expiré. Veuillez demander un nouveau code.';
      }
    }, 1000);
  }

  get timerDisplay(): string {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.otpForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.otpForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Le code est obligatoire';
    if (field.errors['pattern']) return 'Le code doit contenir 6 chiffres';
    
    return 'Code invalide';
  }

  onSubmit(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.submitError = false;
    this.submitErrorMessage = '';
    this.submitting = true;

    const { code } = this.otpForm.value;

    this.volunteerService.verifyOTP(this.email, code)
      .pipe(finalize(() => { this.submitting = false; }))
      .subscribe({
        next: (response) => {
          console.log('✅ OTP vérifié avec succès:', response);
          
          // Arrêter le timer
          if (this.timerInterval) {
            clearInterval(this.timerInterval);
          }
          
          // Rediriger vers le formulaire complet avec le token
          this.router.navigate(['/complete-signup'], {
            state: { 
              token: response.token, 
              email: response.email,
              associationId: this.associationId
            }
          });
        },
        error: (error) => {
          console.error('❌ Erreur vérification OTP:', error);
          this.submitError = true;
          this.submitErrorMessage = error.error?.message || 'Code invalide ou expiré.';
        }
      });
  }

  resendCode(): void {
    this.submitError = false;
    this.submitting = true;

    this.volunteerService.requestOTP(this.email, this.email, this.associationId)
      .pipe(finalize(() => { this.submitting = false; }))
      .subscribe({
        next: (response) => {
          console.log('✅ Nouveau code envoyé');
          // Réinitialiser le timer
          this.timeRemaining = 600;
          if (this.timerInterval) {
            clearInterval(this.timerInterval);
          }
          this.startTimer();
          
          // Message de succès
          alert('Un nouveau code a été envoyé à votre adresse email.');
        },
        error: (error) => {
          console.error('❌ Erreur renvoi code:', error);
          this.submitError = true;
          this.submitErrorMessage = error.error?.message || 'Impossible de renvoyer le code.';
        }
      });
  }
}
