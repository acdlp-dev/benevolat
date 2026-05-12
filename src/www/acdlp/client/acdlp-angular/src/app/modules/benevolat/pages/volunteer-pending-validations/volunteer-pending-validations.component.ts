import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionService, PendingValidationDay, PendingValidationItem } from '../../services/action.service';

@Component({
  selector: 'app-volunteer-pending-validations',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './volunteer-pending-validations.component.html',
  styleUrls: ['./volunteer-pending-validations.component.scss']
})
export class VolunteerPendingValidationsComponent implements OnInit {
  days: PendingValidationDay[] = [];
  loading = false;
  updatingId: number | null = null;
  erreur = '';

  constructor(private actionService: ActionService) {}

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.loading = true;
    this.erreur = '';
    this.actionService.getPendingValidations().subscribe({
      next: (res) => {
        this.days = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.erreur = 'Erreur lors du chargement des validations.';
        this.loading = false;
      }
    });
  }

  valider(item: PendingValidationItem, statut: 'présent' | 'absent'): void {
    this.updatingId = item.inscription_id;
    this.actionService.updateParticipantStatus(item.inscription_id, statut).subscribe({
      next: () => {
        this.updatingId = null;
        // Retirer la ligne du tableau local
        for (const day of this.days) {
          day.inscriptions = day.inscriptions.filter(i => i.inscription_id !== item.inscription_id);
        }
        // Supprimer les jours vides
        this.days = this.days.filter(d => d.inscriptions.length > 0);
      },
      error: () => {
        this.updatingId = null;
        this.erreur = 'Erreur lors de la mise à jour du statut.';
      }
    });
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  get total(): number {
    return this.days.reduce((sum, d) => sum + d.inscriptions.length, 0);
  }
}
