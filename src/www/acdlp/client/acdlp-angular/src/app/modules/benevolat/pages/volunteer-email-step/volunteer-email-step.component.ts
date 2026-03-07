import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Association } from 'src/app/shared/models/association.model';
import { AssociationService } from 'src/app/shared/services/association.service';
import { VolunteerService } from '../../services/volunteer.service';
import { finalize } from 'rxjs/operators';
import { AuthLayoutComponent } from '../../../../shared/components/auth-layout/auth-layout.component';

@Component({
  selector: 'app-volunteer-email-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    AuthLayoutComponent,
  ],
  templateUrl: './volunteer-email-step.component.html',
  styleUrls: ['./volunteer-email-step.component.scss']
})
export class VolunteerEmailStepComponent implements OnInit {
  association?: Association;
  loading = true;
  error = false;
  assoId = '';
  
  emailForm: FormGroup;
  submitting = false;
  submitError = false;
  submitErrorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private associationService: AssociationService,
    private volunteerService: VolunteerService,
    private fb: FormBuilder
  ) {
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      confirmEmail: ['', [Validators.required]]
    }, {
      validators: this.emailMatchValidator
    });
  }

  ngOnInit(): void {
    this.assoId = 'au-coeur-de-la-precarite';

    this.associationService.getAssociationConfig(this.assoId).subscribe({
      next: (data) => {
        console.log('Association data received:', data);
        this.association = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading association data:', err);
        this.error = true;
        this.loading = false;
      },
    });
  }

  /**
   * Validateur personnalisé pour vérifier que les emails correspondent
   */
  private emailMatchValidator(form: FormGroup): { [key: string]: boolean } | null {
    const email = form.get('email');
    const confirmEmail = form.get('confirmEmail');
    
    if (!email || !confirmEmail) {
      return null;
    }
    
    return email.value === confirmEmail.value ? null : { emailMismatch: true };
  }

  /**
   * Vérifie si un champ est invalide et a été touché
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.emailForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  /**
   * Récupère le message d'erreur pour un champ
   */
  getFieldError(fieldName: string): string {
    const field = this.emailForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Ce champ est obligatoire';
    if (field.errors['email']) return 'Format d\'email invalide';
    
    return 'Champ invalide';
  }

  onSubmit(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    this.submitError = false;
    this.submitErrorMessage = '';
    this.submitting = true;

    const { email, confirmEmail } = this.emailForm.value;

    this.volunteerService.requestOTP(email, confirmEmail)
      .pipe(finalize(() => { this.submitting = false; }))
      .subscribe({
        next: (response) => {
          console.log('✅ OTP demandé avec succès:', response);
          // Rediriger vers la page de vérification OTP
          this.router.navigate(['/otp-verification'], {
            state: { email, associationId: this.assoId }
          });
        },
        error: (error) => {
          console.error('❌ Erreur demande OTP:', error);
          this.submitError = true;
          this.submitErrorMessage = error.error?.message || 'Une erreur est survenue. Veuillez réessayer.';
        }
      });
  }
}
