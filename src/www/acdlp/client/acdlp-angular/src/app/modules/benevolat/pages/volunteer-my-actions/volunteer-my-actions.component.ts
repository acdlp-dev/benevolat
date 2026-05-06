import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionService } from '../../services/action.service';

interface Participation {
  inscription_id: number;
  statut: 'inscrit' | 'présent' | 'absent';
  date_action: string;
  is_responsable: number;
  nom: string;
  heure_debut: string;
  heure_fin: string;
  rue: string;
  ville: string;
}

@Component({
  selector: 'app-volunteer-my-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './volunteer-my-actions.component.html',
  styleUrls: ['./volunteer-my-actions.component.scss']
})
export class VolunteerMyActionsComponent implements OnInit {
  participations: Participation[] = [];
  loading = true;
  error = false;
  downloadingId: number | null = null;

  constructor(private actionService: ActionService) {}

  ngOnInit(): void {
    this.actionService.getParticipations().subscribe({
      next: (res) => {
        this.participations = res.participations as Participation[];
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      }
    });
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHeure(h: string): string {
    return h ? h.substring(0, 5) : '';
  }

  downloadAttestation(inscriptionId: number): void {
    this.downloadingId = inscriptionId;
    this.actionService.downloadAttestation(inscriptionId);
    setTimeout(() => { this.downloadingId = null; }, 2000);
  }
}
