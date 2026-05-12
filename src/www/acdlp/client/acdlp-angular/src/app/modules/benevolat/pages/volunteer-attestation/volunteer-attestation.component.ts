import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionService, AttestationInfo } from '../../services/action.service';

interface ActionBloquante {
  nom: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
}

@Component({
  selector: 'app-volunteer-attestation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './volunteer-attestation.component.html',
  styleUrls: ['./volunteer-attestation.component.scss']
})
export class VolunteerAttestationComponent implements OnInit {
  dateDebut = '';
  dateFin = '';
  loading = false;
  actionsBloquantes: ActionBloquante[] = [];
  erreurGenerale = '';

  attestations: AttestationInfo[] = [];
  loadingAttestations = false;
  downloadingFilename = '';

  constructor(private actionService: ActionService) {}

  ngOnInit(): void {
    this.chargerAttestations();
  }

  get canGenerate(): boolean {
    return !!this.dateDebut && !!this.dateFin && this.dateDebut <= this.dateFin;
  }

  chargerAttestations(): void {
    this.loadingAttestations = true;
    this.actionService.listAttestations().subscribe({
      next: (res) => {
        this.attestations = res.attestations || [];
        this.loadingAttestations = false;
      },
      error: () => {
        this.loadingAttestations = false;
      }
    });
  }

  generer(): void {
    if (!this.canGenerate) return;

    this.loading = true;
    this.actionsBloquantes = [];
    this.erreurGenerale = '';

    this.actionService.generateAttestation(this.dateDebut, this.dateFin).subscribe({
      next: (blob) => {
        this.loading = false;
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attestation_benevole_${dateStr}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.chargerAttestations();
      },
      error: (err) => {
        this.loading = false;
        // responseType: 'blob' — l'erreur est aussi un Blob, on le parse en JSON
        if (err.error instanceof Blob) {
          err.error.text().then((text: string) => {
            try {
              const body = JSON.parse(text);
              if (body?.code === 'PRESENCE_NON_VALIDEE') {
                this.actionsBloquantes = body.actions_bloquantes || [];
              } else {
                this.erreurGenerale = body?.message || 'Une erreur est survenue. Veuillez réessayer.';
              }
            } catch {
              this.erreurGenerale = 'Une erreur est survenue. Veuillez réessayer.';
            }
          });
        } else {
          const body = err.error;
          if (body?.code === 'PRESENCE_NON_VALIDEE') {
            this.actionsBloquantes = body.actions_bloquantes || [];
          } else {
            this.erreurGenerale = body?.message || 'Une erreur est survenue. Veuillez réessayer.';
          }
        }
      }
    });
  }

  telecharger(attestation: AttestationInfo): void {
    this.downloadingFilename = attestation.filename;
    this.actionService.downloadAttestation(attestation.filename).subscribe({
      next: (blob) => {
        this.downloadingFilename = '';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attestation.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.downloadingFilename = '';
      }
    });
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatDateCourt(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
