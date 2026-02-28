import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { VolunteerService } from '../../services/volunteer.service';

@Component({
  selector: 'app-volunteer-new-password',
  templateUrl: './volunteer-new-password.component.html',
  styleUrls: ['./volunteer-new-password.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
})
export class VolunteerNewPasswordComponent implements OnInit {
  token: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  errorMessage: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private volunteerService: VolunteerService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.errorMessage = 'Token de réinitialisation invalide.';
    }
  }

  isPasswordValid(): boolean {
    return this.newPassword.length >= 6;
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.isPasswordValid()) {
      this.errorMessage = 'Le mot de passe doit contenir au moins 6 caractères.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas.';
      return;
    }

    this.isSubmitting = true;

    this.volunteerService.resetPasswordWithToken(this.token, this.newPassword, this.confirmPassword).subscribe({
      next: (response) => {
        console.log('Mot de passe réinitialisé avec succès:', response);
        this.successMessage = 'Votre mot de passe a été réinitialisé avec succès ! Vous allez être redirigé vers la page de connexion...';
        
        // Rediriger vers la page de connexion après 3 secondes
        setTimeout(() => {
          this.router.navigate(['/signin']);
        }, 3000);
      },
      error: (err) => {
        console.error('Erreur lors de la réinitialisation du mot de passe :', err);
        this.errorMessage = err.error?.message || 'Une erreur est survenue lors de la réinitialisation du mot de passe.';
        this.isSubmitting = false;
      },
    });
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
