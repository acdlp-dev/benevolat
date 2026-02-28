import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './layout.component';
import { BackofficeAuthGuard } from 'src/app/guards/backoffice-auth.guard';

const routes: Routes = [
  {
    path: 'backoffice',
    loadChildren: () => import('../backoffice/backoffice.module').then((m) => m.BackofficeModule),
    canActivate: [BackofficeAuthGuard],
  },
  {
    path: 'components',
    component: LayoutComponent,
    loadChildren: () => import('../uikit/uikit.module').then((m) => m.UikitModule),
  },
  { path: '', redirectTo: 'backoffice', pathMatch: 'full' },
  { path: '**', redirectTo: 'error/404' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LayoutRoutingModule {}
