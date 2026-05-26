import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionService, AcdlpAction } from '../../services/action.service';

interface AcdlpActionUI extends AcdlpAction {
  _editQty: number;
  _saving: boolean;
  _saved: boolean;
  _error: string | null;
}

@Component({
  selector: 'app-volunteer-quantites-acdlp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './volunteer-quantites-acdlp.component.html',
  styleUrls: ['./volunteer-quantites-acdlp.component.scss']
})
export class VolunteerQuantitesAcdlpComponent implements OnInit {
  actions: AcdlpActionUI[] = [];
  isLoading = true;
  error: string | null = null;
  globalSuccess: string | null = null;

  constructor(private actionService: ActionService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.error = null;
    this.actionService.getAcdlpQuantites().subscribe({
      next: (res) => {
        this.actions = res.actions.map(a => ({
          ...a,
          _editQty: a.quantite_acdlp,
          _saving: false,
          _saved: false,
          _error: null
        }));
        this.isLoading = false;
      },
      error: (err) => {
        if (err.status === 403) {
          this.error = 'Accès réservé aux responsables.';
        } else {
          this.error = 'Impossible de charger vos actions ACDLP.';
        }
        this.isLoading = false;
      }
    });
  }

  save(action: AcdlpActionUI): void {
    if (action._editQty < 0) return;
    action._saving = true;
    action._error = null;
    this.actionService.updateAcdlpQuantite(action.id, action._editQty).subscribe({
      next: (res) => {
        action.quantite_acdlp = action._editQty;
        action._saving = false;
        action._saved = true;
        this.globalSuccess = `Quantité mise à jour. ${res.commandes_updated} commande(s) future(s) modifiée(s).`;
        setTimeout(() => {
          action._saved = false;
          this.globalSuccess = null;
        }, 4000);
      },
      error: (err) => {
        action._saving = false;
        action._error = err.error?.message || 'Erreur lors de la mise à jour';
      }
    });
  }
}
