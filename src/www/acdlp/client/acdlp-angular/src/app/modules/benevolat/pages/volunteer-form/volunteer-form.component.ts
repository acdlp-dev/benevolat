import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Association } from 'src/app/shared/models/association.model';
import { AssociationService } from 'src/app/shared/services/association.service';
import { VolunteerFormData } from '../../models/volunteer.model';
import { VolunteerService } from '../../services/volunteer.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-volunteer-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
  ],
  templateUrl: './volunteer-form.component.html',
  styleUrl: './volunteer-form.component.scss',
})
export class VolunteerFormComponent implements OnInit {
  association?: Association;
  loading = true;
  error = false;
  assoId = '';
  
  // États pour la soumission du formulaire
  submitting = false;
  submitError = false;
  submitErrorMessage = '';
  submitSuccess = false;
  trackingId = '';

  // Gestion des étapes du formulaire
  currentStep = 1;
  totalSteps = 3;

  // Gestion de la visibilité des mots de passe
  showPassword = false;
  showConfirmPassword = false;

  volunteerForm: FormGroup;

  // Options pour le champ "Comment nous avez-vous connu ?"
  sourceOptions = [
    'Réseaux sociaux',
    'Bouche à oreille',
    'Site web',
    'Événement',
    'Moteur de recherche',
    'Presse/Médias',
    'Autre'
  ];

  constructor(
    private route: ActivatedRoute,
    private associationService: AssociationService,
    private volunteerService: VolunteerService,
    private fb: FormBuilder
  ) {
    this.volunteerForm = this.fb.group({
      // Étape 1 : Informations personnelles
      prenom: ['', [Validators.required, Validators.minLength(2)]],
      nom: ['', [Validators.required, Validators.minLength(2)]],
      date_naissance: ['', [Validators.required, this.dateNaissanceValidator.bind(this)]],
      genre: ['', Validators.required],
      email: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^(?=.{1,64}@.{1,255}$)([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9-]+.)+[a-zA-Z]{2,}$/
          ),
        ],
      ],
      confirmEmail: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      
      // Étape 2 : Coordonnées
      telephone: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]{10,}$/)]],
      adresse: ['', [Validators.required, Validators.minLength(5)]],
      code_postal: ['', [Validators.required, Validators.pattern(/^[0-9]{5}$/)]],
      ville: ['', [Validators.required, Validators.minLength(2)]],
      pays: ['France', Validators.required],
      vehicule: ['', Validators.required],
      
      // Étape 3 : Votre engagement
      source_connaissance: ['', Validators.required],
      source_connaissance_autre: [''],
      metiers_competences: [''], // Champ facultatif
    }, {
      validators: [this.passwordMatchValidator, this.emailMatchValidator]
    });

    // Observer les changements sur source_connaissance pour gérer la validation du champ "autre"
    this.volunteerForm.get('source_connaissance')?.valueChanges.subscribe(value => {
      const autreControl = this.volunteerForm.get('source_connaissance_autre');
      if (value === 'Autre') {
        autreControl?.setValidators([Validators.required, Validators.minLength(3)]);
      } else {
        autreControl?.clearValidators();
        autreControl?.setValue('');
      }
      autreControl?.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    this.assoId = 'au-coeur-de-la-precarite';

    this.associationService.getAssociationConfig(this.assoId).subscribe({
      next: (data) => {
        console.log('Association data received in volunteer component:', data);
        this.association = data;
        
        // Log détaillé du chemin du logo
        if (this.association?.logo_url) {
          console.log('🖼️ [BENEVOLAT FORM] Logo chargé depuis:', this.association.logo_url);
          console.log('🖼️ [BENEVOLAT FORM] URL complète du logo:', window.location.origin + this.association.logo_url);
        } else {
          console.warn('⚠️ [BENEVOLAT FORM] Aucun logo disponible pour cette association');
        }
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading association data:', err);
        this.error = true;
        this.loading = false;
        
        // Afficher une alerte pour informer l'utilisateur
        alert('Erreur lors du chargement des données de l\'association. Veuillez réessayer plus tard.');
      },
    });
  }

  onSubmit(): void {
    if (this.volunteerForm.invalid) {
      this.volunteerForm.markAllAsTouched();
      return;
    }

    // Réinitialiser les états d'erreur
    this.submitError = false;
    this.submitErrorMessage = '';
    this.submitSuccess = false;
    
    // Indiquer que la soumission est en cours
    this.submitting = true;
    
    // Formater les données du formulaire
    const volunteerData = this.formatVolunteerData();
    
    // Envoyer les données au backend
    this.volunteerService.saveVolunteerData(volunteerData)
      .pipe(
        finalize(() => {
          this.submitting = false;
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Volunteer data saved successfully:', response);
          this.submitSuccess = true;
          if (response.tracking) {
            this.trackingId = response.tracking;
          }
          
          // Réinitialiser le formulaire après succès
          this.volunteerForm.reset();
          this.volunteerForm.patchValue({ pays: 'France' });
        },
        error: (error) => {
          console.error('Error saving volunteer data:', error);
          this.submitError = true;
          this.submitErrorMessage = error.error?.message || 'Une erreur est survenue lors de l\'enregistrement des données.';
        }
      });
  }

  /**
   * Validateur personnalisé pour vérifier que les mots de passe correspondent
   */
  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }
    
    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  /**
   * Validateur personnalisé pour vérifier que les emails correspondent
   */
  private emailMatchValidator(control: AbstractControl): ValidationErrors | null {
    const email = control.get('email');
    const confirmEmail = control.get('confirmEmail');
    
    if (!email || !confirmEmail) {
      return null;
    }
    
    return email.value === confirmEmail.value ? null : { emailMismatch: true };
  }

  /**
   * Validateur personnalisé pour la date de naissance (minimum 16 ans)
   */
  private dateNaissanceValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null;
    }

    const birthDate = new Date(control.value);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 16) {
      return { minAge: { requiredAge: 16, actualAge: age } };
    }

    if (age > 99) {
      return { maxAge: { requiredAge: 99, actualAge: age } };
    }

    return null;
  }

  /**
   * Calcule l'âge depuis la date de naissance
   */
  private calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Formate les données du formulaire selon la structure attendue par le backend
   */
  private formatVolunteerData(): VolunteerFormData {
    const formValue = this.volunteerForm.value;
    
    return {
      nom: formValue.nom,
      prenom: formValue.prenom,
      email: formValue.email,
      password: formValue.password,
      telephone: formValue.telephone,
      adresse: formValue.adresse,
      code_postal: formValue.code_postal,
      ville: formValue.ville,
      pays: formValue.pays || 'France',
      date_naissance: formValue.date_naissance,
      age: this.calculateAge(formValue.date_naissance),
      genre: formValue.genre,
      vehicule: formValue.vehicule,
      source_connaissance: formValue.source_connaissance,
      source_connaissance_autre: formValue.source_connaissance === 'Autre' ? formValue.source_connaissance_autre : '',
      metiers_competences: formValue.metiers_competences || '',
      asso: this.assoId,
    };
  }

  /**
   * Vérifie si un champ du formulaire est invalide et a été touché
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.volunteerForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  /**
   * Récupère le message d'erreur pour un champ donné
   */
  getFieldError(fieldName: string): string {
    const field = this.volunteerForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Ce champ est obligatoire';
    if (field.errors['minlength']) return `Minimum ${field.errors['minlength'].requiredLength} caractères`;
    if (field.errors['pattern']) {
      if (fieldName === 'email') return 'Format d\'email invalide';
      if (fieldName === 'telephone') return 'Format de téléphone invalide';
      if (fieldName === 'code_postal') return 'Code postal invalide (5 chiffres)';
    }
    if (field.errors['minAge']) return `Vous devez avoir au moins ${field.errors['minAge'].requiredAge} ans`;
    if (field.errors['maxAge']) return `Âge maximum: ${field.errors['maxAge'].requiredAge} ans`;

    return 'Champ invalide';
  }

  /**
   * Navigation entre les étapes
   */
  nextStep(): void {
    if (this.isStepValid(this.currentStep)) {
      this.currentStep++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.markStepAsTouched(this.currentStep);
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep = step;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /**
   * Vérifie si une étape est valide
   */
  isStepValid(step: number): boolean {
    const step1Fields = ['prenom', 'nom', 'date_naissance', 'genre', 'email', 'confirmEmail', 'password', 'confirmPassword'];
    const step2Fields = ['telephone', 'adresse', 'code_postal', 'ville', 'pays', 'vehicule'];
    const step3Fields = ['source_connaissance'];

    let fieldsToCheck: string[] = [];

    switch (step) {
      case 1:
        fieldsToCheck = step1Fields;
        break;
      case 2:
        fieldsToCheck = step2Fields;
        break;
      case 3:
        fieldsToCheck = step3Fields;
        // Vérifier aussi source_connaissance_autre si "Autre" est sélectionné
        if (this.volunteerForm.get('source_connaissance')?.value === 'Autre') {
          fieldsToCheck.push('source_connaissance_autre');
        }
        break;
    }

    // Vérifier aussi la validation du formulaire (passwords et emails match)
    const formErrors = this.volunteerForm.errors;
    if (step === 1 && (formErrors?.['passwordMismatch'] || formErrors?.['emailMismatch'])) {
      return false;
    }

    return fieldsToCheck.every(field => {
      const control = this.volunteerForm.get(field);
      return control && control.valid;
    });
  }

  /**
   * Marque tous les champs d'une étape comme touchés pour afficher les erreurs
   */
  private markStepAsTouched(step: number): void {
    const step1Fields = ['prenom', 'nom', 'date_naissance', 'genre', 'email', 'confirmEmail', 'password', 'confirmPassword'];
    const step2Fields = ['telephone', 'adresse', 'code_postal', 'ville', 'pays', 'vehicule'];
    const step3Fields = ['source_connaissance', 'source_connaissance_autre'];

    let fieldsToMark: string[] = [];

    switch (step) {
      case 1:
        fieldsToMark = step1Fields;
        break;
      case 2:
        fieldsToMark = step2Fields;
        break;
      case 3:
        fieldsToMark = step3Fields;
        break;
    }

    fieldsToMark.forEach(field => {
      this.volunteerForm.get(field)?.markAsTouched();
    });
  }

  /**
   * Calcule la date maximale pour la date de naissance (16 ans en arrière)
   */
  getMaxBirthDate(): string {
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
    return maxDate.toISOString().split('T')[0];
  }

  /**
   * Vérifie si le champ "source_connaissance_autre" doit être affiché
   */
  showSourceAutreField(): boolean {
    return this.volunteerForm.get('source_connaissance')?.value === 'Autre';
  }


  /**
   * Bascule la visibilité du mot de passe
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Bascule la visibilité de la confirmation du mot de passe
   */
  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
