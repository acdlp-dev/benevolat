import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ActionService } from '../../services/action.service';

@Component({
  selector: 'app-volunteer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './volunteer-dashboard.component.html',
  styleUrls: ['./volunteer-dashboard.component.scss']
})
export class VolunteerDashboardComponent implements OnInit {
  benevoleStats: any = null;
  isMobileSidebarOpen = false;
  
  constructor(
    private router: Router,
    private actionService: ActionService
  ) {}

  ngOnInit(): void {
    // Charger les stats du bénévole
    this.loadBenevoleStats();
    
    // Rediriger automatiquement vers les actions
    this.router.navigate(['/dashboard/actions']);
  }

  /**
   * Charge les statistiques du bénévole
   */
  loadBenevoleStats(): void {
    this.actionService.getBenevoleStats().subscribe({
      next: (response) => {
        if (response && response.success) {
          this.benevoleStats = response;
        }
      },
      error: (error) => {
        console.error('Erreur lors du chargement des statistiques:', error);
      }
    });
  }

  /**
   * Vérifie si le bénévole est de type "responsable"
   */
  isResponsableType(): boolean {
    return this.benevoleStats?.type === 'responsable';
  }

  /**
   * Bascule l'état du menu mobile (ouvert/fermé)
   */
  toggleMobileSidebar(): void {
    this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
  }

  /**
   * Ferme le menu mobile
   */
  closeMobileSidebar(): void {
    this.isMobileSidebarOpen = false;
  }

  /**
   * Déconnecte le bénévole et redirige vers la page de connexion
   */
  logout(): void {
    // Supprimer le token de session/localStorage
    localStorage.removeItem('volunteer_token');
    sessionStorage.removeItem('volunteer_token');
    
    // Rediriger vers la page de connexion
    this.router.navigate(['/signin']);
  }
}
