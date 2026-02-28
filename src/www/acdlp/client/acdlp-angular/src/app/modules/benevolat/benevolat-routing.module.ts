import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BenevolatComponent } from './benevolat.component';
import { VolunteerFormComponent } from './pages/volunteer-form/volunteer-form.component';
import { VolunteerVerifyComponent } from './pages/volunteer-verify/volunteer-verify.component';
import { VolunteerSigninComponent } from './pages/volunteer-signin/volunteer-signin.component';
import { VolunteerDashboardComponent } from './pages/volunteer-dashboard/volunteer-dashboard.component';
import { VolunteerActionsComponent } from './pages/volunteer-actions/volunteer-actions.component';
import { VolunteerForgotPasswordComponent } from './pages/volunteer-forgot-password/volunteer-forgot-password.component';
import { VolunteerNewPasswordComponent } from './pages/volunteer-new-password/volunteer-new-password.component';
import { VolunteerEmailStepComponent } from './pages/volunteer-email-step/volunteer-email-step.component';
import { VolunteerOtpVerificationComponent } from './pages/volunteer-otp-verification/volunteer-otp-verification.component';
import { VolunteerCompleteSignupComponent } from './pages/volunteer-complete-signup/volunteer-complete-signup.component';
import { VolunteerProfileComponent } from './pages/volunteer-profile/volunteer-profile.component';
const routes: Routes = [
  {
    path: '',
    component: BenevolatComponent,
  },
  {
    path: 'form/:id',
    component: VolunteerEmailStepComponent,
  },
  {
    path: 'signup/:id',
    component: VolunteerEmailStepComponent, // Redirection pour compatibilité
  },
  {
    path: 'otp-verification',
    component: VolunteerOtpVerificationComponent,
  },
  {
    path: 'complete-signup',
    component: VolunteerCompleteSignupComponent,
  },
  {
    path: 'verify-email/token/:token',
    component: VolunteerVerifyComponent,
  },
  {
    path: 'signin',
    component: VolunteerSigninComponent,
  },
  {
    path: 'signin/:asso',
    component: VolunteerSigninComponent,
  },
  {
    path: 'forgot-password',
    component: VolunteerForgotPasswordComponent,
  },
  {
    path: 'new-password/token/:token',
    component: VolunteerNewPasswordComponent,
  },
  {
    path: 'dashboard',
    component: VolunteerDashboardComponent,
    children: [
      {
        path: '',
        redirectTo: 'actions',
        pathMatch: 'full'
      },
      {
        path: 'actions',
        component: VolunteerActionsComponent
      },
      {
        path: 'profile',
        component: VolunteerProfileComponent
      },
      
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BenevolatRoutingModule {}
