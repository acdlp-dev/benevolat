import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionService } from '../../services/action.service';
import { BenevoleAction, CalendarMonth, CalendarDay, CalendarAction } from '../../models/action.model';

@Component({
  selector: 'app-volunteer-actions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './volunteer-actions.component.html',
  styleUrls: ['./volunteer-actions.component.scss']
})
export class VolunteerActionsComponent implements OnInit {
  currentDate = new Date();
  currentYear = this.currentDate.getFullYear();
  currentMonth = this.currentDate.getMonth();
  currentDay = this.currentDate.getDate();

  // Gestion des vues
  currentView: 'day' | 'week' | 'month' | 'quarter' = 'month';

  // Gestion des filtres
  currentFilter: 'all' | 'inscribed' = 'all';

  calendarData: CalendarMonth | null = null;
  quarterCalendarData: CalendarMonth[] = [];
  actions: BenevoleAction[] = [];
  loading = true;
  error = false;

  monthNames: string[] = [];
  dayNames: string[] = [];

  selectedAction: CalendarAction | null = null;
  showActionModal = false;
  actionInProgress = false;

  actionParticipants: any[] = [];
  isLoadingParticipants = false;
  isResponsable = false;
  userEmail: string | null = null;

  benevoleStats: any = null;
  loadingStats = false;

  get currentDateObject(): Date {
    return new Date(this.currentYear, this.currentMonth, this.currentDay);
  }

  constructor(
    public actionService: ActionService
  ) {
    this.monthNames = this.actionService.getMonthNames();
    this.dayNames = this.actionService.getDayNames();
  }

  ngOnInit(): void {
    this.actionService.userEmail$.subscribe(email => {
      this.userEmail = email;
    });

    this.loadBenevoleStats();
  }

  loadBenevoleStats(): void {
    this.loadingStats = true;

    this.actionService.getBenevoleStats().subscribe({
      next: (response) => {
        if (response && response.success) {
          this.benevoleStats = response;
          this.loadActions();
        }
        this.loadingStats = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des statistiques:', error);
        this.loadingStats = false;
        this.loadActions();
      }
    });
  }

  /**
   * Charge les actions de l'association du bénévole
   */
  loadActions(): void {
    this.loading = true;
    this.error = false;
    
    // Toujours récupérer toutes les actions, le filtrage se fait côté frontend
    this.actionService.getActions('all').subscribe({
      next: (actions) => {
        console.log('[FRONTEND DEBUG] Actions reçues:', actions.length);
        this.actions = actions;
        this.generateCalendar();
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des actions:', error);
        this.error = true;
        this.loading = false;
      }
    });
  }

  /**
   * Change le filtre d'affichage des actions
   */
  changeFilter(filter: 'all' | 'inscribed'): void {
    this.currentFilter = filter;
    this.generateCalendar(); // Régénérer directement le calendrier avec le nouveau filtre
  }

  /**
   * Filtre les actions calculées en fonction du filtre sélectionné
   */
  private filterCalculatedActions(actions: CalendarAction[]): CalendarAction[] {
    if (this.currentFilter === 'inscribed') {
      return actions.filter(action => action.est_inscrit);
    }
    return actions;
  }

  /**
   * Inscription à une action spécifique
   */
  inscrireAction(action: CalendarAction): void {
    if (this.actionInProgress) return;
    
    this.actionInProgress = true;
    const dateAction = this.actionService.formatDateForApi(action.calculatedDate);
    
    this.actionService.inscrireAction(action.id, dateAction).subscribe({
      next: (response) => {
        console.log('Inscription réussie:', response);
        // Recharger les actions pour mettre à jour l'affichage
        this.loadActions();
        this.closeActionModal();
        this.actionInProgress = false;
        
        // Afficher un message de succès (vous pourriez utiliser un service de notification)
        alert('Inscription réussie !');
      },
      error: (error) => {
        console.error('Erreur lors de l\'inscription:', error);
        this.actionInProgress = false;
        
        // Afficher un message d'erreur
        const message = error.error?.message || 'Erreur lors de l\'inscription';
        alert(message);
      }
    });
  }

  /**
   * Désinscription d'une action
   */
  desinscrireAction(action: CalendarAction): void {
    if (this.actionInProgress || !action.inscription_id) return;
    
    this.actionInProgress = true;
    
    this.actionService.desinscrireAction(action.inscription_id).subscribe({
      next: (response) => {
        console.log('Désinscription réussie:', response);
        // Recharger les actions pour mettre à jour l'affichage
        this.loadActions();
        this.closeActionModal();
        this.actionInProgress = false;
        
        // Afficher un message de succès
        alert('Désinscription réussie !');
      },
      error: (error) => {
        console.error('Erreur lors de la désinscription:', error);
        this.actionInProgress = false;
        
        // Afficher un message d'erreur
        const message = error.error?.message || 'Erreur lors de la désinscription';
        alert(message);
      }
    });
  }

  /**
   * Obtient le statut d'une action
   */
  getActionStatus(action: BenevoleAction): 'inscrit' | 'disponible' | 'complet' | 'non-eligible' {
    return this.actionService.getActionStatus(action);
  }

  /**
   * Obtient le nombre d'inscrits pour une action à une date spécifique
   */
  getInscriptsCount(action: CalendarAction): number {
    return this.actionService.getInscriptsCount(action.id, action.calculatedDate);
  }

  /**
   * Obtient le texte des places restantes
   */
  getPlacesText(action: BenevoleAction): string {
    const inscrits = this.getInscriptsCount(action as CalendarAction);
    const placesDisponibles = action.nb_participants;
    return `${inscrits} inscrit${inscrits > 1 ? 's' : ''} / ${placesDisponibles} places disponibles`;
  }

  /**
   * Vérifie si une action peut être sélectionnée pour inscription
   */
  canInscribe(action: CalendarAction): boolean {
    const status = this.getActionStatus(action);
    
    // Empêcher l'inscription aux actions passées (sauf le jour même)
    if (this.isActionInPast(action)) {
      return false;
    }
    
    return status === 'disponible';
  }

  /**
   * Vérifie si une action est dans le passé (heure de fin dépassée)
   */
  private isActionInPast(action: CalendarAction): boolean {
    const now = new Date();

    // Créer la date complète avec l'heure de fin de l'action
    const actionDate = new Date(action.calculatedDate);
    const [heures, minutes] = action.heure_fin.split(':').map(Number);
    actionDate.setHours(heures, minutes, 0, 0);

    // L'action est passée si son heure de fin est dépassée
    return actionDate < now;
  }

  /**
   * Vérifie si une action peut être désélectionnée (désinscription)
   */
  canDesinscribe(action: CalendarAction): boolean {
    const status = this.getActionStatus(action);
    return status === 'inscrit' && !!action.inscription_id;
  }

  /**
   * Obtient le texte du bouton d'action selon le statut
   */
  getActionButtonText(action: CalendarAction): string {
    // Vérifier si l'action est dans le passé
    if (this.isActionInPast(action)) {
      return 'Action passée';
    }

    const status = this.getActionStatus(action);
    switch (status) {
      case 'inscrit':
        return 'Se désinscrire';
      case 'disponible':
        return 'S\'inscrire';
      case 'complet':
        return 'Complet';
      case 'non-eligible':
        return 'Non éligible';
      default:
        return 'Indisponible';
    }
  }

  /**
   * Obtient la classe CSS du bouton d'action selon le statut
   */
  getActionButtonClass(action: CalendarAction): string {
    // Vérifier si l'action est dans le passé
    if (this.isActionInPast(action)) {
      return 'px-4 py-2 bg-gray-300 border border-transparent rounded-md text-sm font-medium text-gray-500 cursor-not-allowed';
    }

    const status = this.getActionStatus(action);
    switch (status) {
      case 'inscrit':
        return 'px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700';
      case 'disponible':
        return 'px-4 py-2 bg-primary border border-transparent rounded-md text-sm font-medium text-white hover:bg-primary-dark';
      case 'complet':
        return 'px-4 py-2 bg-gray-400 border border-transparent rounded-md text-sm font-medium text-white cursor-not-allowed';
      case 'non-eligible':
        return 'px-4 py-2 bg-gray-300 border border-transparent rounded-md text-sm font-medium text-gray-500 cursor-not-allowed';
      default:
        return 'px-4 py-2 bg-gray-400 border border-transparent rounded-md text-sm font-medium text-white cursor-not-allowed';
    }
  }

  /**
   * Gère le clic sur le bouton d'action
   */
  handleActionButtonClick(action: CalendarAction): void {
    const status = this.getActionStatus(action);
    
    switch (status) {
      case 'inscrit':
        this.desinscrireAction(action);
        break;
      case 'disponible':
        this.inscrireAction(action);
        break;
      case 'complet':
      case 'non-eligible':
      default:
        // Aucune action possible
        break;
    }
  }

  /**
   * Génère le calendrier pour le mois courant
   */
  generateCalendar(): void {
    // Déterminer la limite de jours futurs selon le type de bénévole
    const maxDaysInFuture = this.getMaxDaysInFuture();

    if (this.currentView === 'quarter') {
      this.generateQuarterCalendar();
    } else {
      const calendar = this.actionService.generateCalendarMonth(
        this.currentYear,
        this.currentMonth,
        this.actions,
        maxDaysInFuture
      );

      // Appliquer le filtre aux actions calculées
      if (calendar) {
        calendar.weeks.forEach(week => {
          week.days.forEach(day => {
            day.actions = this.filterCalculatedActions(day.actions);
          });
        });
      }

      this.calendarData = calendar;
    }
  }

  getMaxDaysInFuture(): number {
    return this.isResponsableType() ? 90 : 30;
  }

  generateQuarterCalendar(): void {
    this.quarterCalendarData = [];
    const maxDaysInFuture = this.getMaxDaysInFuture();

    for (let i = 0; i < 3; i++) {
      const targetDate = new Date(this.currentYear, this.currentMonth + i, 1);
      const calendar = this.actionService.generateCalendarMonth(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        this.actions,
        maxDaysInFuture
      );

      if (calendar) {
        calendar.weeks.forEach(week => {
          week.days.forEach(day => {
            day.actions = this.filterCalculatedActions(day.actions);
          });
        });
      }

      this.quarterCalendarData.push(calendar);
    }
  }

  /**
   * Navigation vers le mois précédent
   */
  previousMonth(): void {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.generateCalendar();
  }

  /**
   * Navigation vers le mois suivant
   */
  nextMonth(): void {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.generateCalendar();
  }

  previousQuarter(): void {
    this.currentMonth -= 3;
    if (this.currentMonth < 0) {
      this.currentMonth += 12;
      this.currentYear--;
    }
    this.generateCalendar();
  }

  nextQuarter(): void {
    this.currentMonth += 3;
    if (this.currentMonth > 11) {
      this.currentMonth -= 12;
      this.currentYear++;
    }
    this.generateCalendar();
  }

  /**
   * Retour au mois actuel
   */
  goToToday(): void {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.currentDay = today.getDate();
    
    // Régénérer le calendrier et recharger les actions pour s'assurer de la synchronisation
    this.loadActions();
  }

  /**
   * Change la vue du calendrier
   */
  changeView(view: 'day' | 'week' | 'month' | 'quarter'): void {
    this.currentView = view;
    this.generateCalendar();
  }

  /**
   * Navigation précédente selon la vue
   */
  previous(): void {
    switch (this.currentView) {
      case 'day':
        this.previousDay();
        break;
      case 'week':
        this.previousWeek();
        break;
      case 'month':
        this.previousMonth();
        break;
      case 'quarter':
        this.previousQuarter();
        break;
    }
  }

  /**
   * Navigation suivante selon la vue
   */
  next(): void {
    switch (this.currentView) {
      case 'day':
        this.nextDay();
        break;
      case 'week':
        this.nextWeek();
        break;
      case 'month':
        this.nextMonth();
        break;
      case 'quarter':
        this.nextQuarter();
        break;
    }
  }

  /**
   * Navigation vers le jour précédent
   */
  previousDay(): void {
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    currentDate.setDate(currentDate.getDate() - 1);
    this.currentYear = currentDate.getFullYear();
    this.currentMonth = currentDate.getMonth();
    this.currentDay = currentDate.getDate();
    this.generateCalendar();
  }

  /**
   * Navigation vers le jour suivant
   */
  nextDay(): void {
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    currentDate.setDate(currentDate.getDate() + 1);
    this.currentYear = currentDate.getFullYear();
    this.currentMonth = currentDate.getMonth();
    this.currentDay = currentDate.getDate();
    this.generateCalendar();
  }

  /**
   * Navigation vers la semaine précédente
   */
  previousWeek(): void {
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    currentDate.setDate(currentDate.getDate() - 7);
    this.currentYear = currentDate.getFullYear();
    this.currentMonth = currentDate.getMonth();
    this.currentDay = currentDate.getDate();
    this.generateCalendar();
  }

  /**
   * Navigation vers la semaine suivante
   */
  nextWeek(): void {
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    currentDate.setDate(currentDate.getDate() + 7);
    this.currentYear = currentDate.getFullYear();
    this.currentMonth = currentDate.getMonth();
    this.currentDay = currentDate.getDate();
    this.generateCalendar();
  }

  /**
   * Obtient les actions pour un jour spécifique
   */
  getActionsForDay(date: Date): CalendarAction[] {
    if (!this.calendarData) return [];
    
    for (const week of this.calendarData.weeks) {
      for (const day of week.days) {
        if (day.date.getTime() === date.getTime()) {
          return day.actions;
        }
      }
    }
    return [];
  }

  /**
   * Obtient les actions pour la semaine actuelle
   */
  getActionsForWeek(): CalendarAction[] {
    if (!this.calendarData) return [];
    
    const actions: CalendarAction[] = [];
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    const startOfWeek = new Date(currentDate);
    // Correction : calculer le lundi précédent (ou actuel si c'est lundi)
    const dayOfWeek = currentDate.getDay();
    const daysFromMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(currentDate.getDate() - daysFromMonday);
    
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      actions.push(...this.getActionsForDay(dayDate));
    }
    
    return actions;
  }

  /**
   * Obtient le titre selon la vue
   */
  getViewTitle(): string {
    switch (this.currentView) {
      case 'day':
        const dayDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
        // Correction : ajuster l'index pour que lundi=0 dans this.dayNames
        const dayIndex = (dayDate.getDay() + 6) % 7; // dimanche=6, lundi=0, mardi=1, etc.
        return `${this.dayNames[dayIndex]} ${this.currentDay} ${this.monthNames[this.currentMonth]} ${this.currentYear}`;
      case 'week':
        const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
        const startOfWeek = new Date(currentDate);
        // Correction : calculer le lundi précédent (ou actuel si c'est lundi)
        const dayOfWeek = currentDate.getDay();
        const daysFromMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        startOfWeek.setDate(currentDate.getDate() - daysFromMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
          return `${startOfWeek.getDate()} - ${endOfWeek.getDate()} ${this.monthNames[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
        } else {
          return `${startOfWeek.getDate()} ${this.monthNames[startOfWeek.getMonth()]} - ${endOfWeek.getDate()} ${this.monthNames[endOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
        }
      case 'quarter':
        const firstMonth = new Date(this.currentYear, this.currentMonth, 1);
        const thirdMonth = new Date(this.currentYear, this.currentMonth + 2, 1);

        if (firstMonth.getFullYear() === thirdMonth.getFullYear()) {
          return `${this.monthNames[firstMonth.getMonth()]} - ${this.monthNames[thirdMonth.getMonth()]} ${firstMonth.getFullYear()}`;
        } else {
          return `${this.monthNames[firstMonth.getMonth()]} ${firstMonth.getFullYear()} - ${this.monthNames[thirdMonth.getMonth()]} ${thirdMonth.getFullYear()}`;
        }
      case 'month':
      default:
        return `${this.monthNames[this.currentMonth]} ${this.currentYear}`;
    }
  }

  /**
   * Obtient la date d'un jour spécifique de la semaine courante
   */
  getCurrentWeekDay(dayIndex: number): Date {
    const currentDate = new Date(this.currentYear, this.currentMonth, this.currentDay);
    const startOfWeek = new Date(currentDate);
    // Correction : calculer le lundi précédent (ou actuel si c'est lundi)
    const dayOfWeek = currentDate.getDay();
    const daysFromMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(currentDate.getDate() - daysFromMonday);
    
    const dayDate = new Date(startOfWeek);
    dayDate.setDate(startOfWeek.getDate() + dayIndex);
    
    return dayDate;
  }

  /**
   * Ouvre le modal de détail d'une action
   */
  openActionModal(action: CalendarAction): void {
    this.selectedAction = action;
    this.showActionModal = true;
    
    console.log('[OPEN ACTION MODAL] User email:', this.userEmail);
    console.log('[OPEN ACTION MODAL] Action responsable_email:', action.responsable_email);
    console.log('[OPEN ACTION MODAL] Type de bénévole:', this.benevoleStats?.type);
    
    // Vérifier si l'utilisateur est de type "responsable" (tous les responsables peuvent voir tous les participants)
    this.isResponsable = this.isResponsableType();
    
    console.log('[OPEN ACTION MODAL] isResponsable:', this.isResponsable);
    
    // Si c'est le responsable, charger les participants
    if (this.isResponsable) {
      console.log('[OPEN ACTION MODAL] Chargement des participants pour action ID:', action.id);
      this.loadActionParticipants(action.id);
    } else {
      console.log('[OPEN ACTION MODAL] Pas le responsable, section participants masquée');
    }
  }

  /**
   * Ferme le modal de détail d'action
   */
  closeActionModal(): void {
    this.selectedAction = null;
    this.showActionModal = false;
    this.actionParticipants = [];
    this.isResponsable = false;
  }

  /**
   * Charge la liste des participants d'une action (réservé au responsable)
   */
  loadActionParticipants(actionId: number): void {
    if (!this.selectedAction) return;
    
    this.isLoadingParticipants = true;
    
    // Formater la date de l'action pour la passer en paramètre
    const dateAction = this.actionService.formatDateForApi(this.selectedAction.calculatedDate);
    
    this.actionService.getActionParticipants(actionId, dateAction).subscribe({
      next: (response) => {
        if (response && response.success) {
          this.actionParticipants = response.participants || [];
        }
        this.isLoadingParticipants = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des participants:', error);
        this.isLoadingParticipants = false;
        // Si erreur 403, c'est normal (pas le responsable)
        if (error.status !== 403) {
          alert('Erreur lors du chargement des participants');
        }
      }
    });
  }

  /**
   * Met à jour le statut d'un participant (réservé au responsable)
   */
  updateParticipantStatus(participant: any, newStatut: string): void {
    if (!this.isResponsable) {
      return;
    }

    this.actionService.updateParticipantStatus(participant.inscription_id, newStatut).subscribe({
      next: (response) => {
        if (response.success) {
          // Mettre à jour localement
          participant.statut = newStatut;
        }
      },
      error: (error) => {
        console.error('Erreur lors de la mise à jour du statut:', error);
        alert('Erreur lors de la mise à jour du statut');
        // Recharger les participants pour annuler le changement local
        if (this.selectedAction) {
          this.loadActionParticipants(this.selectedAction.id);
        }
      }
    });
  }

  /**
   * Vérifie si un jour est aujourd'hui
   */
  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  /**
   * Obtient la classe CSS pour une action selon son statut d'inscription et sa date
   */
  getActionClass(action: CalendarAction): string {
    const isInPast = this.isActionInPast(action);
    
    // Actions passées non inscrites → gris
    if (isInPast && !action.est_inscrit) {
      return 'bg-gray-400 text-white';
    }
    
    // Actions futures dans lesquelles le bénévole est inscrit → vert
    if (!isInPast && action.est_inscrit) {
      return 'bg-green-500 text-white';
    }
    
    // Toutes les autres actions → bleu
    return 'bg-blue-500 text-white';
  }

  /**
   * Formate une heure au format HH:MM
   */
  formatTime(timeString: string): string {
    return this.actionService.formatTime(timeString);
  }

  /**
   * Obtient le libellé de récurrence pour l'affichage
   */
  getRecurrenceLabel(recurrence: string): string {
    switch (recurrence) {
      case 'Quotidienne':
        return 'Tous les jours';
      case 'Hebdomadaire':
        return 'Chaque semaine';
      case 'Aucune':
      default:
        return 'Action ponctuelle';
    }
  }

  /**
   * Formate une date en français
   */
  formatDateInFrench(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('fr-FR', options);
  }

  isDayBeyondMaxDays(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + this.getMaxDaysInFuture());

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    return checkDate > maxDate;
  }

  getInscriptionLimitMessage(): string {
    return this.isResponsableType()
      ? 'Inscriptions ouvertes à J-90'
      : 'Inscriptions ouvertes à J-30';
  }

  isConfirmed(): boolean {
    return this.benevoleStats?.statut === 'confirmé';
  }

  getWhatsAppLink(): string {
    if (!this.benevoleStats || !this.benevoleStats.genre) {
      return '';
    }

    const genre = this.benevoleStats.genre.toLowerCase();

    if (genre === 'femme') {
      return 'https://chat.whatsapp.com/CBfFt6Q84mCEoRDh9AL3FH?mode=wwt';
    } else if (genre === 'homme') {
      return 'https://chat.whatsapp.com/IqFOnyXHK852XIiI0Y9AlB?mode=wwt';
    }

    return '';
  }

  isResponsableType(): boolean {
    return this.benevoleStats?.type === 'responsable';
  }
}
