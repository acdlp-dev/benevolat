export interface BenevoleAction {
  id: number;
  rue?: string;
  ville?: string;
  pays?: string;
  nom: string;
  description?: string;
  date_action: string; // ISO date string
  heure_debut: string;
  heure_fin: string;
  recurrence: 'Aucune' | 'Quotidienne' | 'Hebdomadaire';
  responsable_email: string;
  responsable_nom?: string;
  responsable_prenom?: string;
  responsable_telephone?: string;
  nb_participants: number;
  genre: 'homme' | 'femme' | 'mixte';
  age: 'majeure' | 'mineur' | 'tous';
  created_at?: string;
  
  // Propriétés ajoutées par les jointures
  inscriptions_actuelles?: number;
  places_restantes?: number;
  inscription_id?: number | null;
  est_inscrit?: boolean;
}

export interface BenevoleProfile {
  id: number;
  genre: 'homme' | 'femme';
  age: number;
}

export interface InscriptionRequest {
  action_id: number;
  date_action: string; // YYYY-MM-DD format
}

export interface InscriptionResponse {
  success: boolean;
  message: string;
  inscription_id?: number;
  action?: {
    id: number;
    nom: string;
    date_action: string;
    places_restantes: number;
  };
}

export interface CalendarAction extends BenevoleAction {
  calculatedDate: Date; // Date calculée pour l'affichage (avec récurrence)
  isRecurrentInstance?: boolean; // Indique si c'est une instance récurrente
  is_masked?: boolean; // Indique si cette occurrence est masquée (backoffice uniquement)
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  actions: CalendarAction[];
}

export interface CalendarWeek {
  days: CalendarDay[];
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-11 (janvier = 0)
  weeks: CalendarWeek[];
}

export interface ActionsResponse {
  actions: BenevoleAction[];
  total: number;
}
