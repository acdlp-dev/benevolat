-- Migration : ajout du flag is_responsable par occurrence
-- Source de vérité du "responsable du jour" pour une action récurrente.
-- actions.responsable_email reste la valeur par défaut utilisée à l'inscription.

ALTER TABLE Benevoles_Actions
  ADD COLUMN is_responsable TINYINT(1) NOT NULL DEFAULT 0;

-- Backfill : marquer comme responsable les inscriptions existantes
-- où l'email du bénévole correspond au responsable_email de l'action.
UPDATE Benevoles_Actions ba
JOIN actions a ON ba.action_id = a.id
JOIN benevoles_users b ON ba.benevole_id = b.id
SET ba.is_responsable = 1
WHERE b.email = a.responsable_email;
