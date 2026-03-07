import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Association } from 'src/app/shared/models/association.model';
import { AssociationService } from 'src/app/shared/services/association.service';
import { VolunteerFormData } from '../../models/volunteer.model';
import { VolunteerService } from '../../services/volunteer.service';
import { finalize } from 'rxjs/operators';

declare var google: any;

@Component({
  selector: 'app-volunteer-complete-signup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
  ],
  templateUrl: './volunteer-complete-signup.component.html',
  styleUrl: './volunteer-complete-signup.component.scss',
})
export class VolunteerCompleteSignupComponent implements OnInit {
  private autocompleteInitialized = false;

  @ViewChild('addressInput') set addressInput(el: ElementRef | undefined) {
    if (el && !this.autocompleteInitialized) {
      this.autocompleteInitialized = true;
      this.initGooglePlacesAutocomplete(el);
    }
  }

  association?: Association;
  loading = true;
  error = false;
  assoId = '';
  email = '';
  token = '';
  
  submitting = false;
  submitError = false;
  submitErrorMessage = '';
  submitSuccess = false;

  currentStep = 1;
  totalSteps = 3;

  showPassword = false;
  showConfirmPassword = false;

  volunteerForm: FormGroup;

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
    private router: Router,
    private associationService: AssociationService,
    private volunteerService: VolunteerService,
    private fb: FormBuilder,
    private ngZone: NgZone
  ) {
    // Récupérer les données depuis navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state) {
      this.token = navigation.extras.state['token'] || '';
      this.email = navigation.extras.state['email'] || '';
      this.assoId = navigation.extras.state['associationId'] || '';
    }

    this.volunteerForm = this.fb.group({
      // Étape 1 : Informations personnelles (sans email car déjà vérifié)
      prenom: ['', [Validators.required, Validators.minLength(2)]],
      nom: ['', [Validators.required, Validators.minLength(2)]],
      date_naissance: ['', [Validators.required]],
      genre: ['', Validators.required],
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
      metiers_competences: [''],
    }, {
      validators: [this.passwordMatchValidator]
    });

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
    // Vérifier qu'on a bien un token et un email
    if (!this.token || !this.email) {
      console.error('Token ou email manquant, redirection vers formulaire');
      this.router.navigate(['/signup']);
      return;
    }

    if (!this.assoId) {
      this.assoId = 'au-coeur-de-la-precarite';
    }

    this.associationService.getAssociationConfig(this.assoId).subscribe({
      next: (data) => {
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

  onSubmit(): void {
    if (this.volunteerForm.invalid) {
      this.volunteerForm.markAllAsTouched();
      return;
    }

    this.submitError = false;
    this.submitErrorMessage = '';
    this.submitSuccess = false;
    this.submitting = true;
    
    const volunteerData = this.formatVolunteerData();
    
    this.volunteerService.completeSignup(this.token, volunteerData)
      .pipe(finalize(() => { this.submitting = false; }))
      .subscribe({
        next: (response) => {
          console.log('✅ Inscription complétée:', response);
          this.submitSuccess = true;
          
          // Rediriger vers la page de connexion après 3 secondes
          setTimeout(() => {
            this.router.navigate(['/signin']);
          }, 3000);
        },
        error: (error) => {
          console.error('❌ Erreur complétion inscription:', error);
          this.submitError = true;
          this.submitErrorMessage = error.error?.message || 'Une erreur est survenue. Veuillez réessayer.';
        }
      });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }
    
    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

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

  private formatVolunteerData(): VolunteerFormData {
    const formValue = this.volunteerForm.value;
    
    return {
      nom: formValue.nom,
      prenom: formValue.prenom,
      email: this.email, // Email déjà vérifié
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

  isFieldInvalid(fieldName: string): boolean {
    const field = this.volunteerForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.volunteerForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Ce champ est obligatoire';
    if (field.errors['minlength']) return `Minimum ${field.errors['minlength'].requiredLength} caractères`;
    if (field.errors['pattern']) {
      if (fieldName === 'telephone') return 'Format de téléphone invalide';
      if (fieldName === 'code_postal') return 'Code postal invalide (5 chiffres)';
    }
    return 'Champ invalide';
  }

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

  isStepValid(step: number): boolean {
    const step1Fields = ['prenom', 'nom', 'date_naissance', 'genre', 'password', 'confirmPassword'];
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
        if (this.volunteerForm.get('source_connaissance')?.value === 'Autre') {
          fieldsToCheck.push('source_connaissance_autre');
        }
        break;
    }

    const formErrors = this.volunteerForm.errors;
    if (step === 1 && formErrors?.['passwordMismatch']) {
      return false;
    }

    return fieldsToCheck.every(field => {
      const control = this.volunteerForm.get(field);
      return control && control.valid;
    });
  }

  private markStepAsTouched(step: number): void {
    const step1Fields = ['prenom', 'nom', 'date_naissance', 'genre', 'password', 'confirmPassword'];
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

  private initGooglePlacesAutocomplete(el: ElementRef): void {
    if (typeof google === 'undefined') return;

    const autocomplete = new google.maps.places.Autocomplete(
      el.nativeElement,
      { fields: ['address_components', 'formatted_address'], types: ['address'] }
    );

    autocomplete.addListener('place_changed', () => {
      this.ngZone.run(() => {
        const place = autocomplete.getPlace();
        if (!place?.address_components) return;

        let streetNumber = '';
        let street = '';
        let city = '';
        let postalCode = '';
        let country = '';

        for (const component of place.address_components) {
          const type = component.types[0];
          switch (type) {
            case 'street_number': streetNumber = component.long_name; break;
            case 'route': street = component.long_name; break;
            case 'locality': city = component.long_name; break;
            case 'postal_code': postalCode = component.long_name; break;
            case 'country': country = component.long_name; break;
          }
        }

        const addressLine = streetNumber && street ? `${streetNumber} ${street}` : street;
        this.volunteerForm.patchValue({
          adresse: place.formatted_address || addressLine,
          code_postal: postalCode,
          ville: city,
          pays: country || 'France',
        });
      });
    });
  }

  showSourceAutreField(): boolean {
    return this.volunteerForm.get('source_connaissance')?.value === 'Autre';
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
