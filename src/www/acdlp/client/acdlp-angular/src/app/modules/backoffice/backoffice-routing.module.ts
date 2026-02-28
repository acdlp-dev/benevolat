import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BackofficeComponent } from './backoffice.component';
import { InfosComponent } from './components/infos/infos.component';
import { ParametresComponent } from './components/parametres/parametres.component';

const routes: Routes = [
  {
    path: '',
    component: BackofficeComponent,
    children: [
      {
        path: '',
        redirectTo: 'benevolat/benevoles',
        pathMatch: 'full'
      },

      // Routes pour les informations générales et paramètres
      { path: 'infos', component: InfosComponent },
      { path: 'parametres', component: ParametresComponent },

      // Routes pour le bénévolat
      {
        path: 'benevolat/benevoles',
        loadComponent: () => import('./components/benevolat-list/benevolat-list.component').then(c => c.BenevolatListComponent),
      },
      {
        path: 'benevolat/actions',
        loadComponent: () => import('./components/benevolat-actions/benevolat-actions.component').then(c => c.BenevolatActionsComponent),
      },
      {
        path: 'benevolat/actions-list',
        loadComponent: () => import('./components/benevolat-actions-list/benevolat-actions-list.component').then(c => c.BenevolatActionsListComponent),
      },
      {
        path: 'benevolat/attestations',
        loadComponent: () => import('./components/benevolat-attestations/benevolat-attestations.component').then(c => c.BenevolatAttestationsComponent),
      },
      {
        path: 'benevolat/calendar',
        loadComponent: () => import('./components/benevolat-calendar/benevolat-calendar.component').then(c => c.BenevolatCalendarComponent),
      },

      { path: '**', redirectTo: '' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BackofficeRoutingModule { }
