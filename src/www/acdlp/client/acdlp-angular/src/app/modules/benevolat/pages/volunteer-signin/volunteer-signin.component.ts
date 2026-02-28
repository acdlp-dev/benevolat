import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { VolunteerService } from '../../services/volunteer.service';
import { AuthLayoutComponent } from '../../../../shared/components/auth-layout/auth-layout.component';

@Component({
  selector: 'app-volunteer-signin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    AuthLayoutComponent,
  ],
  templateUrl: './volunteer-signin.component.html',
  styleUrls: ['./volunteer-signin.component.scss'],
})
export class VolunteerSigninComponent implements OnInit {
  signinForm: FormGroup;
  submitting = false;
  error = false;
  errorMessage = '';
  assoParam: string | null = null;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private volunteerService: VolunteerService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Récupérer le paramètre 'asso' depuis l'URL
    this.route.params.subscribe(params => {
      this.assoParam = params['asso'] || null;
    });
  }

  onSubmit(): void {
    if (this.signinForm.invalid) {
      this.signinForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.error = false;
    this.errorMessage = '';

    const { email, password } = this.signinForm.value;

    this.volunteerService.signin(email, password).subscribe({
      next: (response) => {
        console.log('Connexion bénévole réussie:', response);
        // Rediriger vers le dashboard bénévole
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.error('Erreur de connexion bénévole:', error);
        this.error = true;
        this.errorMessage = error.error?.message || 'Erreur de connexion. Veuillez vérifier vos identifiants.';
        this.submitting = false;
      },
      complete: () => {
        this.submitting = false;
      }
    });
  }

  /**
   * Vérifie si un champ du formulaire est invalide et a été touché
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.signinForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  /**
   * Récupère le message d'erreur pour un champ donné
   */
  getFieldError(fieldName: string): string {
    const field = this.signinForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Ce champ est obligatoire';
    if (field.errors['email']) return 'Format d\'email invalide';

    return 'Champ invalide';
  }

  /**
   * Bascule la visibilité du mot de passe
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}
