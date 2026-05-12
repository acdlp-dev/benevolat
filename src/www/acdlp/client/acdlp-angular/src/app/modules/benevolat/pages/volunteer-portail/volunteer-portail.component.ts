import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionService } from '../../services/action.service';

type PortailState = 'idle' | 'loading' | 'success' | 'error' | 'cooldown';

@Component({
  selector: 'app-volunteer-portail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './volunteer-portail.component.html',
  styleUrls: ['./volunteer-portail.component.scss']
})
export class VolunteerPortailComponent implements OnDestroy {
  state: PortailState = 'idle';
  message = '';
  cooldownRemaining = 0;

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private actionService: ActionService) {}

  ngOnDestroy(): void {
    this.clearTimer();
  }

  ouvrir(): void {
    if (this.state === 'loading' || this.state === 'cooldown') return;

    this.state = 'loading';
    this.message = '';

    this.actionService.ouvrirPortail().subscribe({
      next: (res) => {
        this.state = 'success';
        this.message = res.message || 'Portail en cours d\'ouverture !';
        this.startCooldown(10);
      },
      error: (err) => {
        this.state = 'error';
        const body = err.error;
        if (err.status === 429) {
          this.message = body?.message || 'Veuillez patienter avant de réessayer.';
          // Extraire le délai depuis le message si possible
          const match = body?.message?.match(/(\d+) seconde/);
          const delay = match ? parseInt(match[1], 10) : 10;
          this.startCooldown(delay);
        } else {
          this.message = body?.message || 'Une erreur est survenue.';
        }
      }
    });
  }

  private startCooldown(seconds: number): void {
    this.clearTimer();
    this.cooldownRemaining = seconds;
    this.cooldownTimer = setInterval(() => {
      this.cooldownRemaining--;
      if (this.cooldownRemaining <= 0) {
        this.clearTimer();
        if (this.state !== 'error') this.state = 'idle';
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.cooldownTimer !== null) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  get isDisabled(): boolean {
    return this.state === 'loading' || this.cooldownRemaining > 0;
  }
}
