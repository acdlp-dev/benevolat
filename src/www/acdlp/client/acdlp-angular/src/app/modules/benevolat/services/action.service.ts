import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, map, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { 
  BenevoleAction, 
  CalendarAction, 
  CalendarMonth, 
  CalendarWeek, 
  CalendarDay,
  ActionsResponse,
  InscriptionRequest,
  InscriptionResponse,
  BenevoleProfile
} from '../models/action.model';

@Injectable({
  providedIn: 'root',
})
export class ActionService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Récupère les actions d'une association avec filtrage optionnel
   */
  getActions(associationName: string, filter: 'all' | 'inscribed' = 'all'): Observable<BenevoleAction[]> {
    let params = new HttpParams();
    if (filter !== 'all') {
      params = params.set('filter', filter);
    }
    
    return this.http.get<any>(`${this.apiUrl}/actions/${associationName}`, { 
      params,
      withCredentials: true 
    })
      .pipe(
        map(response => {
          const actions = response.actions || [];
          const inscriptions = response.inscriptions || [];
          const participantsCounts = response.participants_counts || {};
          const maskedActions = response.masked_actions || {};
          const benevole = response.benevole || {};
          
          console.log('[FRONTEND DEBUG] Participants counts reçus:', participantsCounts);
          console.log('[FRONTEND DEBUG] Nombre de compteurs:', Object.keys(participantsCounts).length);
          console.log('[FRONTEND DEBUG] Actions masquées reçues:', maskedActions);
          console.log('[FRONTEND DEBUG] Nombre d\'actions masquées:', Object.keys(maskedActions).length);
          console.log('[FRONTEND DEBUG] Email bénévole:', benevole.email);
          
          // Émettre l'email de l'utilisateur connecté
          if (benevole.email) {
            this.userEmailSubject.next(benevole.email);
          }
          
          // Créer un map des inscriptions pour un accès rapide + stocker les compteurs réels + actions masquées
          this.setInscriptionsMap(inscriptions, participantsCounts, maskedActions);
          
          return actions;
        }),
        catchError(error => {
          console.error('Erreur lors de la récupération des actions:', error);
          return throwError(() => error);
        })
      );
  }

  private inscriptionsMap = new Map<string, number>(); // key: "actionId_dateAction", value: inscriptionId
  private inscriptionsCountMap = new Map<string, number>(); // key: "actionId_dateAction", value: count RÉEL de TOUS les participants
  private userEmailSubject = new BehaviorSubject<string | null>(null);
  public userEmail$ = this.userEmailSubject.asObservable();

  private maskedActionsMap = new Map<string, boolean>(); // key: "actionId_dateAction", value: true si masquée

  /**
   * Met à jour le map des inscriptions et des actions masquées
   */
  private setInscriptionsMap(inscriptions: any[], participantsCounts?: any, maskedActions?: any): void {
    this.inscriptionsMap.clear();
    this.inscriptionsCountMap.clear();
    this.maskedActionsMap.clear();
    
    // Stocker les inscriptions du user connecté
    inscriptions.forEach((inscription: any) => {
      // Normaliser le format de date pour le matching
      const normalizedDate = this.formatDateForApi(new Date(inscription.date_action));
      const key = `${inscription.action_id}_${normalizedDate}`;
      
      this.inscriptionsMap.set(key, inscription.inscription_id);
    });
    
    // Stocker les compteurs réels de TOUS les participants (venant du backend)
    if (participantsCounts) {
      Object.keys(participantsCounts).forEach(key => {
        this.inscriptionsCountMap.set(key, participantsCounts[key]);
      });
    }
    
    // Stocker les actions masquées
    if (maskedActions) {
      Object.keys(maskedActions).forEach(key => {
        this.maskedActionsMap.set(key, true);
      });
    }
  }

  /**
   * Définit les compteurs de participants (utilisé par le backoffice admin)
   */
  setParticipantsCounts(participantsCounts: { [key: string]: number }): void {
    this.inscriptionsCountMap.clear();
    Object.keys(participantsCounts).forEach(key => {
      this.inscriptionsCountMap.set(key, participantsCounts[key]);
    });
  }

  /**
   * Vérifie si le bénévole est inscrit à une action à une date donnée
   */
  private isInscribed(actionId: number, dateAction: string): boolean {
    const key = `${actionId}_${dateAction}`;
    return this.inscriptionsMap.has(key);
  }

  /**
   * Obtient l'ID d'inscription pour une action à une date donnée
   */
  private getInscriptionId(actionId: number, dateAction: string): number | null {
    const key = `${actionId}_${dateAction}`;
    return this.inscriptionsMap.get(key) || null;
  }

  /**
   * Inscription à une action spécifique
   */
  inscrireAction(actionId: number, dateAction: string): Observable<InscriptionResponse> {
    const request: InscriptionRequest = {
      action_id: actionId,
      date_action: dateAction
    };
    
    return this.http.post<InscriptionResponse>(`${this.apiUrl}/inscription`, request, {
      withCredentials: true
    })
      .pipe(
        catchError(error => {
          console.error('Erreur lors de l\'inscription:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Désinscription d'une action
   */
  desinscrireAction(inscriptionId: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/desinscription/${inscriptionId}`, {
      withCredentials: true
    })
      .pipe(
        catchError(error => {
          console.error('Erreur lors de la désinscription:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Récupère les participants d'une action (réservé au responsable)
   * @param actionId L'ID de l'action
   * @param dateAction (optionnel) La date spécifique pour les actions récurrentes (format YYYY-MM-DD)
   */
  getActionParticipants(actionId: number, dateAction?: string): Observable<any> {
    let params = new HttpParams();
    if (dateAction) {
      params = params.set('date_action', dateAction);
    }
    
    return this.http.get<any>(`${this.apiUrl}/actions/${actionId}/participants`, {
      params,
      withCredentials: true
    })
      .pipe(
        catchError(error => {
          console.error('Erreur lors de la récupération des participants:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Met à jour le statut d'un participant (réservé au responsable)
   */
  updateParticipantStatus(inscriptionId: number, statut: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/actions/participants/${inscriptionId}/statut`, 
      { statut },
      { withCredentials: true }
    )
      .pipe(
        catchError(error => {
          console.error('Erreur lors de la mise à jour du statut:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Récupère les statistiques du bénévole connecté
   */
  getBenevoleStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`, {
      withCredentials: true
    })
      .pipe(
        catchError(error => {
          console.error('Erreur lors de la récupération des statistiques:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Génère un calendrier mensuel avec les actions calculées (récurrences incluses)
   * @param year L'année du calendrier
   * @param month Le mois du calendrier (0-11)
   * @param actions La liste des actions
   * @param maxDaysInFuture Limite de jours dans le futur (30 par défaut pour l'espace bénévole, undefined = illimité pour le backoffice)
   */
  generateCalendarMonth(year: number, month: number, actions: BenevoleAction[], maxDaysInFuture?: number): CalendarMonth {
    // Si maxDaysInFuture n'est pas fourni, utiliser 30 par défaut (pour l'espace bénévole)
    const actualMaxDays = maxDaysInFuture === undefined ? 30 : maxDaysInFuture;
    // Si c'est null (passé explicitement), considérer comme illimité
    const finalMaxDays = maxDaysInFuture === null ? undefined : actualMaxDays;
    
    console.log('[CALENDAR DEBUG] generateCalendarMonth - maxDaysInFuture reçu:', maxDaysInFuture, 'finalMaxDays:', finalMaxDays);
    
    const calendarActions = this.calculateRecurrentActions(actions, year, month, finalMaxDays);
    
    // Première date du mois
    const firstDayOfMonth = new Date(year, month, 1);
    // Dernière date du mois
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Premier lundi de la première semaine (peut être du mois précédent)
    const startDate = new Date(firstDayOfMonth);
    const dayOfWeek = firstDayOfMonth.getDay();
    // Correction : JavaScript getDay() : dimanche=0, lundi=1, ..., samedi=6
    // Pour obtenir le lundi précédent : si c'est dimanche (0), reculer de 6 jours, sinon reculer de (dayOfWeek-1) jours
    const daysFromMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - daysFromMonday);

    // Dernier dimanche de la dernière semaine (peut être du mois suivant)  
    const endDate = new Date(lastDayOfMonth);
    const lastDayOfWeek = lastDayOfMonth.getDay();
    // Pour obtenir le dimanche suivant : si c'est dimanche (0), ne pas bouger, sinon avancer de (7-dayOfWeek) jours
    const daysToSunday = (lastDayOfWeek === 0) ? 0 : 7 - lastDayOfWeek;
    endDate.setDate(endDate.getDate() + daysToSunday);

    const weeks: CalendarWeek[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const week: CalendarWeek = { days: [] };

      // Créer 7 jours pour cette semaine
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayDate = new Date(currentDate);
        const isCurrentMonth = dayDate.getMonth() === month;
        
        // Filtrer les actions pour ce jour
        const dayActions = calendarActions.filter(action => 
          this.isSameDay(action.calculatedDate, dayDate)
        );

        week.days.push({
          date: dayDate,
          isCurrentMonth,
          actions: dayActions
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      weeks.push(week);
    }

    return {
      year,
      month,
      weeks
    };
  }

  /**
   * Vérifie si une action est masquée à une date donnée
   */
  private isActionMasked(actionId: number, dateAction: string): boolean {
    const key = `${actionId}_${dateAction}`;
    return this.maskedActionsMap.has(key);
  }

  /**
   * Calcule les actions récurrentes pour un mois donné
   * @param actions Liste des actions
   * @param year Année du calendrier
   * @param month Mois du calendrier
   * @param maxDaysInFuture Limite de jours dans le futur (undefined = illimité)
   */
  private calculateRecurrentActions(actions: BenevoleAction[], year: number, month: number, maxDaysInFuture?: number): CalendarAction[] {
    const result: CalendarAction[] = [];
    
    // Dates limites du mois à afficher (avec marges pour les semaines partielles)
    const startOfDisplay = new Date(year, month - 1, 15); // Milieu du mois précédent
    const endOfDisplay = new Date(year, month + 2, 15);   // Milieu du mois suivant
    
    // Limite dans le futur (optionnelle)
    const maxDate = maxDaysInFuture !== undefined 
      ? (() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const max = new Date(today);
          max.setDate(today.getDate() + maxDaysInFuture);
          return max;
        })()
      : new Date(9999, 11, 31); // Date très lointaine = illimité

    console.log('[CALENDAR DEBUG] calculateRecurrentActions - maxDaysInFuture:', maxDaysInFuture);
    console.log('[CALENDAR DEBUG] calculateRecurrentActions - maxDate:', maxDate);
    console.log('[CALENDAR DEBUG] calculateRecurrentActions - startOfDisplay:', startOfDisplay);
    console.log('[CALENDAR DEBUG] calculateRecurrentActions - endOfDisplay:', endOfDisplay);
    console.log('[CALENDAR DEBUG] calculateRecurrentActions - nombre d\'actions:', actions.length);

    actions.forEach(action => {
      // Normaliser la date pour éviter les problèmes de timezone
      const actionDate = new Date(action.date_action);
      // Forcer la date à minuit heure locale pour une comparaison cohérente
      actionDate.setHours(0, 0, 0, 0);
      
      switch (action.recurrence) {
        case 'Aucune':
          // Action ponctuelle - seulement si dans la période d'affichage, dans les 30 jours ET non masquée
          if (actionDate >= startOfDisplay && actionDate <= endOfDisplay && actionDate <= maxDate) {
            const calculatedDateStr = this.formatDateForApi(actionDate);
            
            // Skip si l'action est masquée
            if (this.isActionMasked(action.id, calculatedDateStr)) {
              break;
            }
            
            const isInscribed = this.isInscribed(action.id, calculatedDateStr);
            const inscriptionId = this.getInscriptionId(action.id, calculatedDateStr);
            
            result.push({
              ...action,
              calculatedDate: actionDate,
              isRecurrentInstance: false,
              est_inscrit: isInscribed,
              inscription_id: inscriptionId
            });
          }
          break;

        case 'Quotidienne':
          // Actions quotidiennes - partir de la date d'action
          let dailyDate = new Date(actionDate);
          let dailyCount = 0;
          console.log(`[CALENDAR DEBUG] Action quotidienne ${action.id} - date début:`, actionDate, 'maxDate:', maxDate);
          while (dailyDate <= endOfDisplay && dailyDate <= maxDate) {
            if (dailyDate >= startOfDisplay) {
              const calculatedDateStr = this.formatDateForApi(dailyDate);
              
              // Skip si cette occurrence est masquée
              if (!this.isActionMasked(action.id, calculatedDateStr)) {
                result.push({
                  ...action,
                  calculatedDate: new Date(dailyDate),
                  isRecurrentInstance: dailyDate.getTime() !== actionDate.getTime(),
                  est_inscrit: this.isInscribed(action.id, calculatedDateStr),
                  inscription_id: this.getInscriptionId(action.id, calculatedDateStr)
                });
                dailyCount++;
              }
            }
            dailyDate.setDate(dailyDate.getDate() + 1);
          }
          console.log(`[CALENDAR DEBUG] Action quotidienne ${action.id} - ${dailyCount} occurrences ajoutées`);
          break;

        case 'Hebdomadaire':
          // Actions hebdomadaires - même jour de la semaine, limité à 30 jours
          let weeklyDate = new Date(actionDate);
          while (weeklyDate <= endOfDisplay && weeklyDate <= maxDate) {
            if (weeklyDate >= startOfDisplay) {
              const calculatedDateStr = this.formatDateForApi(weeklyDate);
              
              // Skip si cette occurrence est masquée
              if (!this.isActionMasked(action.id, calculatedDateStr)) {
                result.push({
                  ...action,
                  calculatedDate: new Date(weeklyDate),
                  isRecurrentInstance: weeklyDate.getTime() !== actionDate.getTime(),
                  est_inscrit: this.isInscribed(action.id, calculatedDateStr),
                  inscription_id: this.getInscriptionId(action.id, calculatedDateStr)
                });
              }
            }
            weeklyDate.setDate(weeklyDate.getDate() + 7);
          }
          break;
      }
    });

    return result;
  }

  /**
   * Vérifie si deux dates correspondent au même jour
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() && 
           date1.getMonth() === date2.getMonth() && 
           date1.getFullYear() === date2.getFullYear();
  }

  /**
   * Formate une heure au format HH:MM
   */
  formatTime(timeString: string): string {
    const parts = timeString.split(':');
    return `${parts[0]}:${parts[1]}`;
  }

  /**
   * Combine date et heure pour créer un objet Date complet
   */
  combineDateTime(dateString: string, timeString: string): Date {
    const date = new Date(dateString);
    const timeParts = timeString.split(':');
    date.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2] || '0'));
    return date;
  }

  /**
   * Obtient les noms des mois en français
   */
  getMonthNames(): string[] {
    return [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
  }

  /**
   * Obtient les noms des jours en français (commence par lundi)
   */
  getDayNames(): string[] {
    return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  }

  /**
   * Détermine le statut d'une action pour un bénévole
   */
  getActionStatus(action: BenevoleAction): 'inscrit' | 'disponible' | 'complet' | 'non-eligible' {
    // Vérifier si déjà inscrit
    if (action.est_inscrit) {
      return 'inscrit';
    }
    
    // Vérifier s'il reste des places
    const placesRestantes = action.places_restantes ?? (action.nb_participants - (action.inscriptions_actuelles ?? 0));
    if (placesRestantes <= 0) {
      return 'complet';
    }
    
    return 'disponible';
  }

  /**
   * Obtient le libellé d'un statut d'action
   */
  getStatusLabel(status: string): string {
    switch (status) {
      case 'inscrit':
        return 'Inscrit';
      case 'disponible':
        return 'Disponible';
      case 'complet':
        return 'Complet';
      case 'non-eligible':
        return 'Non éligible';
      default:
        return 'Inconnu';
    }
  }

  /**
   * Obtient la classe CSS pour un statut d'action
   */
  getStatusClass(status: string): string {
    switch (status) {
      case 'inscrit':
        return 'bg-green-500 text-white';
      case 'disponible':
        return 'bg-blue-500 text-white';
      case 'complet':
        return 'bg-red-500 text-white';
      case 'non-eligible':
        return 'bg-gray-400 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  }

  /**
   * Formate une date au format YYYY-MM-DD pour l'API
   */
  formatDateForApi(date: Date): string {
    return date.getFullYear() + '-' + 
           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
           String(date.getDate()).padStart(2, '0');
  }

  /**
   * Obtient le nombre d'inscrits pour une action à une date spécifique
   */
  getInscriptsCount(actionId: number, dateAction: Date): number {
    const dateStr = this.formatDateForApi(dateAction);
    const key = `${actionId}_${dateStr}`;
    return this.inscriptionsCountMap.get(key) || 0;
  }

  /**
   * Obtient le texte des places restantes
   */
  getPlacesText(action: BenevoleAction): string {
    const placesRestantes = action.places_restantes ?? (action.nb_participants - (action.inscriptions_actuelles ?? 0));
    const total = action.nb_participants;
    
    if (placesRestantes <= 0) {
      return 'Complet';
    } else if (placesRestantes <= 2) {
      return `${placesRestantes}/${total} places`;
    } else {
      return `${placesRestantes}/${total} places`;
    }
  }
}
