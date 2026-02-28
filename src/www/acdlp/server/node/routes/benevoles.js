const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../services/bdd');
const mailService = require('../services/mailService');
const googleSheetsService = require('../services/googleSheetsService');
const icsService = require('../services/icsService');
const { authMiddleware } = require('./auth');


/**
 * GET /api/benevolat/actions/:associationName
 * Récupère les actions d'une association pour le calendrier bénévole
 * Supporte le filtrage par profil bénévole et inscriptions
 */
router.get('/benevolat/actions/:associationName', authMiddleware, async (req, res) => {
    try {
        const { associationName } = req.params;
        const { filter = 'all' } = req.query; // 'all' ou 'inscribed'
        const benevoleId = req.user.id;

        // Récupérer le profil du bénévole pour le filtrage
        const benevoleQuery = 'SELECT genre, age FROM benevoles WHERE id = ?';
        const benevoles = await db.select(benevoleQuery, [benevoleId]);

        if (!benevoles || benevoles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profil bénévole introuvable'
            });
        }

        const benevole = benevoles[0];
        const benevoleAge = benevole.age;
        const benevoleGenre = benevole.genre;

        // 1. Récupérer les actions depuis la base remote
        let actionsQuery = `
            SELECT
                a.id,
                a.association_nom,
                a.rue,
                a.ville,
                a.pays,
                a.nom,
                a.description,
                a.date_action,
                a.heure_debut,
                a.heure_fin,
                a.recurrence,
                a.responsable_email,
                resp.nom as responsable_nom,
                resp.prenom as responsable_prenom,
                resp.telephone as responsable_telephone,
                a.nb_participants,
                a.genre,
                a.age,
                a.created_at
            FROM actions a
            LEFT JOIN benevoles resp ON a.responsable_email = resp.email
            WHERE a.association_nom = ?
        `;

        let params = [associationName];

        // Filtrage par profil bénévole (genre et âge)
        actionsQuery += ` AND (a.genre = 'mixte' OR a.genre = ?)`;
        params.push(benevoleGenre);

        actionsQuery += ` AND (a.age = 'tous' OR
                        (? >= 18 AND a.age = 'majeure') OR
                        (? < 18 AND a.age = 'mineur'))`;
        params.push(benevoleAge, benevoleAge);

        actionsQuery += ` ORDER BY a.date_action ASC, a.heure_debut ASC`;

        let actions = await db.select(actionsQuery, params, 'remote');
        console.log(`[DEBUG] Actions récupérées: ${actions ? actions.length : 0}`);

        // 1.4 Récupérer les actions masquées pour filtrer côté frontend
        const maskedActionsQuery = `
            SELECT action_id, date_masquee
            FROM Actions_Masquees
            WHERE association_nom = ?
        `;
        const maskedActions = await db.select(maskedActionsQuery, [associationName], 'remote');

        // 1.5. Récupérer le nombre total de participants pour chaque action de cette association
        const participantsCountQuery = `
            SELECT ba.action_id, ba.date_action, COUNT(*) as nb_inscrits
            FROM Benevoles_Actions ba
            JOIN actions a ON ba.action_id = a.id
            WHERE a.association_nom = ?
            GROUP BY ba.action_id, ba.date_action
        `;
        const participantsCounts = await db.select(participantsCountQuery, [associationName]);
        console.log(`[DEBUG] Participants counts récupérés: ${participantsCounts ? participantsCounts.length : 0}`);

        // Créer une map pour un accès rapide : key = "action_id_date_action", value = nb_inscrits
        const participantsMap = new Map();
        if (participantsCounts && participantsCounts.length > 0) {
            participantsCounts.forEach(count => {
                // Normaliser la date au format YYYY-MM-DD
                const dateStr = count.date_action instanceof Date
                    ? count.date_action.toISOString().split('T')[0]
                    : count.date_action;
                const key = `${count.action_id}_${dateStr}`;
                participantsMap.set(key, count.nb_inscrits);
                console.log(`[DEBUG] Compteur ajouté: ${key} = ${count.nb_inscrits}`);
            });
        }

        // 2. Récupérer les infos de l'association depuis la base REMOTE
        let associationInfo = null;
        if (actions && actions.length > 0) {
            console.log(`[DEBUG] Recherche association pour: ${associationName}`);
            const assoQuery = `
                SELECT surnom, nom, logoUrl
                FROM Assos
                WHERE uri = ?
            `;
            const assoResults = await db.select(assoQuery, [associationName], 'remote');
            console.log(`[DEBUG] Résultats Assos:`, assoResults);

            if (assoResults && assoResults.length > 0) {
                associationInfo = assoResults[0];
                console.log(`[DEBUG] Association trouvée:`, {
                    surnom: associationInfo.surnom,
                    nom: associationInfo.nom,
                    logoUrl: associationInfo.logoUrl
                });
            } else {
                console.log(`[DEBUG] Aucune association trouvée pour surnom: ${associationName}`);
            }
        }

        // 3. Enrichir les actions avec les infos de l'association
        if (associationInfo) {
            console.log(`[DEBUG] Enrichissement des actions avec:`, {
                logo_url: associationInfo.logoUrl,
                nom_complet: associationInfo.nom,
                surnom: associationInfo.surnom
            });
            actions = actions.map(action => ({
                ...action,
                association_logo_url: associationInfo.logoUrl,
                association_nom_complet: associationInfo.nom,
                association_surnom: associationInfo.surnom
            }));
            console.log(`[DEBUG] Premier action enrichie:`, {
                id: actions[0].id,
                nom: actions[0].nom,
                association_logo_url: actions[0].association_logo_url,
                association_nom_complet: actions[0].association_nom_complet
            });
        } else {
            console.log(`[DEBUG] Pas d'enrichissement - associationInfo est null`);
        }

        // Si on ne veut que les actions inscrites, on les filtre après récupération des inscriptions
        if (filter === 'inscribed') {
            // Récupérer toutes les inscriptions du bénévole
            const inscriptionsQuery = `
                SELECT DISTINCT action_id, date_action
                FROM Benevoles_Actions
                WHERE benevole_id = ?
            `;
            const inscriptions = await db.select(inscriptionsQuery, [benevoleId]);

            // Filtrer les actions pour ne garder que celles où le bénévole est inscrit
            const inscriptionsSet = new Set();
            inscriptions.forEach(ins => {
                inscriptionsSet.add(`${ins.action_id}_${ins.date_action}`);
            });

            // On garde toutes les actions car le filtrage par inscription se fait côté frontend
            // en fonction des dates calculées des instances récurrentes
        }

        // Récupérer toutes les inscriptions du bénévole pour cette association
        const inscriptionsQuery = `
            SELECT ba.id as inscription_id, ba.action_id, ba.date_action
            FROM Benevoles_Actions ba
            JOIN actions a ON ba.action_id = a.id
            WHERE ba.benevole_id = ? AND a.association_nom = ?
        `;
        const inscriptions = await db.select(inscriptionsQuery, [benevoleId, associationName]);

        // Créer une map pour les actions masquées
        const maskedMap = new Map();
        if (maskedActions && maskedActions.length > 0) {
            maskedActions.forEach(masked => {
                const dateStr = masked.date_masquee instanceof Date
                    ? masked.date_masquee.toISOString().split('T')[0]
                    : masked.date_masquee;
                const key = `${masked.action_id}_${dateStr}`;
                maskedMap.set(key, true);
            });
        }

        // Convertir les maps en objets pour l'envoyer au frontend
        const participantsCountsObject = {};
        participantsMap.forEach((count, key) => {
            participantsCountsObject[key] = count;
        });

        const maskedActionsObject = {};
        maskedMap.forEach((isMasked, key) => {
            maskedActionsObject[key] = isMasked;
        });

        res.status(200).json({
            success: true,
            actions: actions || [],
            inscriptions: inscriptions || [],
            participants_counts: participantsCountsObject,
            masked_actions: maskedActionsObject, // NOUVEAU : actions masquées
            total: actions ? actions.length : 0,
            filter: filter,
            benevole: {
                id: benevoleId,
                email: req.user.email,
                genre: benevoleGenre,
                age: benevoleAge
            }
        });

    } catch (error) {
        console.error('Erreur lors de la récupération des actions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des actions'
        });
    }
});

/**
 * POST /api/benevolat/inscription
 * Inscription d'un bénévole à une action spécifique
 * Si benevole_id est fourni dans le body, l'admin peut inscrire un autre bénévole
 */
router.post('/benevolat/inscription', authMiddleware, async (req, res) => {
    try {
        const { action_id, date_action, benevole_id: benevoleIdFromBody } = req.body;

        // Si benevole_id est fourni, utiliser celui-ci (inscription par admin)
        // Sinon, utiliser l'id de l'utilisateur connecté (auto-inscription)
        const benevole_id = benevoleIdFromBody || req.user.id;

        if (!action_id || !date_action) {
            return res.status(400).json({
                success: false,
                message: 'action_id et date_action sont requis'
            });
        }

        // Vérifier que l'action existe et récupérer ses détails
        const actionQuery = `
            SELECT a.*,
                   COUNT(ba.id) as inscriptions_actuelles,
                   (a.nb_participants - COUNT(ba.id)) as places_restantes
            FROM actions a
            LEFT JOIN Benevoles_Actions ba ON a.id = ba.action_id AND ba.date_action = ?
            WHERE a.id = ?
            GROUP BY a.id
        `;

        const actions = await db.select(actionQuery, [date_action, action_id]);

        if (!actions || actions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Action introuvable'
            });
        }

        const action = actions[0];

        // Vérifier s'il reste des places
        if (action.places_restantes <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Action complète, plus de places disponibles'
            });
        }

        // Vérifier si déjà inscrit
        const existingQuery = `
            SELECT id FROM Benevoles_Actions
            WHERE benevole_id = ? AND action_id = ? AND date_action = ?
        `;

        const existing = await db.select(existingQuery, [benevole_id, action_id, date_action]);

        if (existing && existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Vous êtes déjà inscrit à cette action'
            });
        }

        // Procéder à l'inscription
        const insertQuery = `
            INSERT INTO Benevoles_Actions (benevole_id, action_id, date_action)
            VALUES (?, ?, ?)
        `;

        const result = await db.query(insertQuery, [benevole_id, action_id, date_action], 'remote');

        // Envoi des emails de notification après l'inscription réussie
        try {
            console.log(`[BENEVOLAT INSCRIPTION] Envoi des notifications email pour l'inscription ${result.insertId}`);

            // 1. Récupérer les informations du bénévole inscrit
            const benevoleQuery = 'SELECT nom, prenom, email, telephone FROM benevoles WHERE id = ?';
            const benevoleResults = await db.select(benevoleQuery, [benevole_id]);

            if (benevoleResults && benevoleResults.length > 0) {
                const benevole = benevoleResults[0];

                // 2. Récupérer les informations du responsable depuis la table benevoles
                const responsableQuery = 'SELECT nom, prenom, telephone FROM benevoles WHERE email = ?';
                const responsableResults = await db.select(responsableQuery, [action.responsable_email]);

                const responsable = responsableResults && responsableResults.length > 0
                    ? responsableResults[0]
                    : { nom: '', prenom: '', telephone: '' };

                // 3. Récupérer le logo de l'association
                let logoUrl = '';
                if (action.association_nom) {
                    try {
                        const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                        const assoResults = await db.select(assoQuery, [action.association_nom], 'remote');
                        if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
                            // Préfixer le logo avec l'URL de base
                            logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                        }
                    } catch (assoErr) {
                        console.warn(`[BENEVOLAT INSCRIPTION] Impossible de récupérer le logo de l'association:`, assoErr);
                    }
                }

                // 4. Formater la date et les horaires
                const dateFormatted = new Date(date_action).toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const heureDebut = action.heure_debut.substring(0, 5); // Format HH:MM
                const heureFin = action.heure_fin.substring(0, 5); // Format HH:MM

                // Construire le lieu
                const lieu = [action.rue, action.ville, action.pays]
                    .filter(Boolean)
                    .join(', ') || 'À préciser';

                // Variables communes aux deux emails
                const commonVariables = {
                    action_nom: action.nom,
                    action_date: dateFormatted,
                    action_heure_debut: heureDebut,
                    action_heure_fin: heureFin,
                    action_lieu: lieu,
                    logo_url: logoUrl
                };

                // 5a. Envoyer l'email au responsable
                try {
                    const responsableTemplateId = 7450635;
                    const responsableVariables = {
                        ...commonVariables,
                        responsable_prenom: responsable.prenom || 'Responsable',
                        benevole_prenom: benevole.prenom,
                        benevole_nom: benevole.nom,
                        benevole_email: benevole.email,
                        benevole_telephone: benevole.telephone || 'Non renseigné'
                    };

                    await mailService.sendTemplateEmail(
                        action.responsable_email,
                        responsableTemplateId,
                        responsableVariables,
                        `Inscription : ${action.nom} le ${dateFormatted} ${heureDebut}`
                    );

                    console.log(`[BENEVOLAT INSCRIPTION] ✓ Email envoyé au responsable: ${action.responsable_email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT INSCRIPTION] ✗ Erreur envoi email responsable:`, emailErr);
                }

                // 5b. Envoyer l'email de confirmation au bénévole avec fichier ICS
                try {
                    const benevoleTemplateId = 7450641;
                    const benevoleVariables = {
                        ...commonVariables,
                        benevole_prenom: benevole.prenom
                    };

                    // Récupérer le nom complet de l'association pour le fichier ICS
                    let associationNomComplet = action.association_nom;
                    try {
                        const assoQuery = 'SELECT nom FROM Assos WHERE uri = ?';
                        const assoResults = await db.select(assoQuery, [action.association_nom], 'remote');
                        if (assoResults && assoResults.length > 0 && assoResults[0].nom) {
                            associationNomComplet = assoResults[0].nom;
                        }
                    } catch (assoErr) {
                        console.warn(`[BENEVOLAT INSCRIPTION] Impossible de récupérer le nom complet de l'association:`, assoErr);
                    }

                    // Construire le nom complet du responsable
                    const responsableNomComplet = responsable.prenom && responsable.nom
                        ? `${responsable.prenom} ${responsable.nom}`
                        : '';

                    // Générer le fichier ICS
                    const icsBase64 = icsService.generateICSBase64({
                        associationNom: associationNomComplet,
                        actionNom: action.nom,
                        dateAction: date_action,
                        heureDebut: action.heure_debut,
                        heureFin: action.heure_fin,
                        lieu: lieu,
                        description: action.description,
                        responsableEmail: action.responsable_email,
                        responsableNom: responsableNomComplet,
                        inscriptionId: result.insertId
                    });

                    // Préparer la pièce jointe ICS
                    const attachments = [{
                        ContentType: 'text/calendar',
                        Filename: 'evenement.ics',
                        Base64Content: icsBase64
                    }];

                    await mailService.sendTemplateEmail(
                        benevole.email,
                        benevoleTemplateId,
                        benevoleVariables,
                        `Confirmation : Vous êtes inscrit(e) à ${action.nom} le ${date_action}`,
                        undefined, // replyTo
                        undefined, // from
                        attachments // pièce jointe ICS
                    );

                    console.log(`[BENEVOLAT INSCRIPTION] ✓ Email de confirmation avec fichier ICS envoyé au bénévole: ${benevole.email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT INSCRIPTION] ✗ Erreur envoi email bénévole:`, emailErr);
                }
            }
        } catch (notificationErr) {
            // Logger l'erreur mais ne pas bloquer la réponse de l'inscription
            console.error('[BENEVOLAT INSCRIPTION] Erreur lors de l\'envoi des notifications:', notificationErr);
        }

        res.status(201).json({
            success: true,
            message: 'Inscription réussie',
            inscription_id: result.insertId,
            action: {
                id: action.id,
                nom: action.nom,
                date_action: date_action,
                places_restantes: action.places_restantes - 1
            }
        });

    } catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'inscription'
        });
    }
});

/**
 * GET /api/benevolat/actions/:actionId/participants
 * Récupère la liste des participants d'une action (réservé aux bénévoles de type "responsable")
 * Query params: date_action (optionnel) pour filtrer par date (utile pour actions récurrentes)
 */
router.get('/benevolat/actions/:actionId/participants', authMiddleware, async (req, res) => {
  try {
    const { actionId } = req.params;
    const { date_action } = req.query; // Date spécifique pour les actions récurrentes
    const userId = req.user.id;

    // Vérifier que l'action existe
    const actionQuery = 'SELECT id FROM actions WHERE id = ?';
    const actions = await db.select(actionQuery, [actionId], 'remote');

    if (!actions || actions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Action introuvable'
      });
    }

    // Vérifier que l'utilisateur connecté est de type "responsable"
    const benevoleQuery = 'SELECT type FROM benevoles WHERE id = ?';
    const benevoles = await db.select(benevoleQuery, [userId]);

    if (!benevoles || benevoles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bénévole introuvable'
      });
    }

    const benevole = benevoles[0];

    // Autoriser uniquement les bénévoles de type "responsable"
    if (benevole.type !== 'responsable') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux responsables'
      });
    }

    // Récupérer les participants
    let participantsQuery = `
      SELECT
        ba.id as inscription_id,
        ba.statut,
        ba.date_action,
        b.nom,
        b.prenom,
        b.email,
        b.telephone
      FROM Benevoles_Actions ba
      JOIN benevoles b ON ba.benevole_id = b.id
      WHERE ba.action_id = ?
    `;

    const queryParams = [actionId];

    // Si une date spécifique est fournie, filtrer par cette date
    if (date_action) {
      participantsQuery += ' AND ba.date_action = ?';
      queryParams.push(date_action);
    }

    participantsQuery += ' ORDER BY b.nom, b.prenom';

    const participants = await db.select(participantsQuery, queryParams);

    return res.status(200).json({
      success: true,
      participants: participants || [],
      total: participants ? participants.length : 0
    });
  } catch (err) {
    console.error('[Get Action Participants Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des participants'
    });
  }
});

/**
 * PATCH /api/benevolat/actions/participants/:inscriptionId/statut
 * Met à jour le statut d'un participant (réservé au responsable)
 */
router.patch('/benevolat/actions/participants/:inscriptionId/statut', authMiddleware, async (req, res) => {
  try {
    const { inscriptionId } = req.params;
    const { statut } = req.body;
    const userEmail = req.user.email;

    // Validation du statut
    if (!statut || !['inscrit', 'présent', 'absent'].includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide. Doit être "inscrit", "présent" ou "absent"'
      });
    }

    // Vérifier que l'inscription existe et que l'utilisateur est le responsable
    const checkQuery = `
      SELECT ba.id, a.responsable_email
      FROM Benevoles_Actions ba
      JOIN actions a ON ba.action_id = a.id
      WHERE ba.id = ?
    `;

    const inscriptions = await db.select(checkQuery, [inscriptionId]);

    if (!inscriptions || inscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Inscription introuvable'
      });
    }

    // Vérifier que l'utilisateur connecté est un bénévole de type responsable
    const userTypeQuery = 'SELECT type FROM benevoles WHERE email = ?';
    const userTypes = await db.select(userTypeQuery, [userEmail]);

    if (!userTypes || userTypes.length === 0 || userTypes[0].type !== 'responsable') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les responsables peuvent modifier le statut'
      });
    }

    // Mettre à jour le statut
    await db.update(
      'Benevoles_Actions',
      { statut: statut },
      'id = ?',
      [inscriptionId],
      'remote'
    );

    // Si le statut passe à "présent", débloquer automatiquement le bénévole
    if (statut === 'présent') {
      try {
        console.log(`[Déblocage Auto] Vérification pour l'inscription ${inscriptionId}`);

        // 1. Récupérer le benevole_id et son statut actuel
        const getBenevoleQuery = `
          SELECT ba.benevole_id, b.statut as benevole_statut, b.email as benevole_email
          FROM Benevoles_Actions ba
          JOIN benevoles b ON ba.benevole_id = b.id
          WHERE ba.id = ?
        `;
        const inscriptionData = await db.select(getBenevoleQuery, [inscriptionId]);

        if (inscriptionData && inscriptionData.length > 0) {
          const benevoleId = inscriptionData[0].benevole_id;
          const currentStatut = inscriptionData[0].benevole_statut;
          const benevoleEmail = inscriptionData[0].benevole_email;

          // 2. Vérifier si le bénévole n'est pas déjà confirmé
          if (currentStatut !== 'confirmé') {
            // 3. Mettre à jour le statut à "confirmé"
            await db.update(
              'benevoles',
              { statut: 'confirmé' },
              'id = ?',
              [benevoleId],
              'remote'
            );

            console.log(`[Déblocage Auto] ✓ Bénévole ${benevoleId} (${benevoleEmail}) confirmé (était: ${currentStatut || 'restreint'})`);

            // 4. Synchroniser automatiquement vers Google Sheets
            try {
              console.log('[Déblocage Auto] Déclenchement de la synchronisation Google Sheets');

              // Récupérer tous les bénévoles
              const syncQuery = 'SELECT nom, prenom, genre, telephone, statut FROM benevoles ORDER BY nom, prenom';
              const allBenevoles = await db.select(syncQuery, [], 'remote');

              // Synchroniser de manière asynchrone (ne pas bloquer la réponse)
              googleSheetsService.syncVolunteers(allBenevoles)
                .then(result => {
                  console.log(`[Déblocage Auto] ✓ Synchronisation Google Sheets réussie: ${result.count} bénévoles`);
                })
                .catch(syncErr => {
                  console.error('[Déblocage Auto] ✗ Erreur synchronisation Google Sheets:', syncErr);
                });

            } catch (syncErr) {
              console.error('[Déblocage Auto] ✗ Erreur lors du déclenchement de la synchronisation:', syncErr);
            }
          } else {
            console.log(`[Déblocage Auto] ℹ Bénévole ${benevoleId} (${benevoleEmail}) déjà confirmé, aucune action requise`);
          }
        }
      } catch (err) {
        // Logger l'erreur mais ne pas bloquer la mise à jour du statut de participation
        console.error('[Déblocage Auto] Erreur lors du déblocage du bénévole:', err);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Statut mis à jour avec succès',
      statut: statut
    });
  } catch (err) {
    console.error('[Update Participant Status Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut'
    });
  }
});

/**
 * GET /api/benevolat/stats
 * Récupère les statistiques du bénévole connecté
 */
router.get('/benevolat/stats', authMiddleware, async (req, res) => {
  try {
    const benevoleId = req.user.id;

    // Récupérer les infos du bénévole
    const benevoleQuery = 'SELECT nom, prenom, statut, genre, type FROM benevoles WHERE id = ?';
    const benevoles = await db.select(benevoleQuery, [benevoleId]);

    if (!benevoles || benevoles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bénévole introuvable'
      });
    }

    const benevole = benevoles[0];

    // Compter les actions par statut
    const statsQuery = `
      SELECT
        COUNT(CASE WHEN statut = 'inscrit' THEN 1 END) as inscrites,
        COUNT(CASE WHEN statut = 'présent' THEN 1 END) as effectuees,
        COUNT(CASE WHEN statut = 'absent' THEN 1 END) as manquees
      FROM Benevoles_Actions
      WHERE benevole_id = ?
    `;

    const stats = await db.select(statsQuery, [benevoleId]);

    return res.status(200).json({
      success: true,
      nom: benevole.nom,
      prenom: benevole.prenom,
      statut: benevole.statut || 'restreint',
      genre: benevole.genre,
      type: benevole.type || 'bénévole',
      inscrites: stats[0]?.inscrites || 0,
      effectuees: stats[0]?.effectuees || 0,
      manquees: stats[0]?.manquees || 0
    });
  } catch (err) {
    console.error('[Get Benevole Stats Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

/**
 * GET /api/benevolat/profile
 * Récupère les informations de profil du bénévole connecté
 */
router.get('/benevolat/profile', authMiddleware, async (req, res) => {
  try {
    const benevoleId = req.user.id;

    console.log(`[GET PROFILE] Récupération du profil pour benevole_id: ${benevoleId}`);

    // Récupérer les informations du bénévole
    const query = `
      SELECT nom, prenom, adresse, ville, code_postal, pays, telephone, vehicule
      FROM benevoles
      WHERE id = ?
    `;

    const benevoles = await db.select(query, [benevoleId]);

    if (!benevoles || benevoles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bénévole introuvable'
      });
    }

    const benevole = benevoles[0];

    console.log(`[GET PROFILE] ✓ Profil récupéré pour: ${benevole.nom} ${benevole.prenom}`);

    return res.status(200).json({
      success: true,
      profile: {
        nom: benevole.nom,
        prenom: benevole.prenom,
        adresse: benevole.adresse || '',
        ville: benevole.ville || '',
        code_postal: benevole.code_postal || '',
        pays: benevole.pays || 'France',
        telephone: benevole.telephone || '',
        vehicule: benevole.vehicule || 'non'
      }
    });
  } catch (err) {
    console.error('[Get Profile Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du profil'
    });
  }
});

/**
 * PATCH /api/benevolat/profile
 * Met à jour les informations modifiables du profil du bénévole connecté
 * Champs modifiables : adresse, ville, code_postal, pays, telephone, vehicule
 * Champs en lecture seule : nom, prenom
 */
router.patch('/benevolat/profile', authMiddleware, async (req, res) => {
  try {
    const benevoleId = req.user.id;
    const { adresse, ville, code_postal, pays, telephone, vehicule } = req.body;

    console.log(`[UPDATE PROFILE] Mise à jour du profil pour benevole_id: ${benevoleId}`);

    // Vérifier que le bénévole existe
    const checkQuery = 'SELECT id FROM benevoles WHERE id = ?';
    const existing = await db.select(checkQuery, [benevoleId]);

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bénévole introuvable'
      });
    }

    // Validation du champ vehicule
    if (vehicule && vehicule !== 'oui' && vehicule !== 'non') {
      return res.status(400).json({
        success: false,
        message: 'Le champ vehicule doit être "oui" ou "non"'
      });
    }

    // Préparer les données de mise à jour (uniquement les champs modifiables fournis)
    const updateData = {};
    if (adresse !== undefined) updateData.adresse = adresse;
    if (ville !== undefined) updateData.ville = ville;
    if (code_postal !== undefined) updateData.code_postal = code_postal;
    if (pays !== undefined) updateData.pays = pays;
    if (telephone !== undefined) updateData.telephone = telephone;
    if (vehicule !== undefined) updateData.vehicule = vehicule;

    // Vérifier qu'au moins un champ est fourni
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune donnée à mettre à jour'
      });
    }

    console.log(`[UPDATE PROFILE] Champs à mettre à jour:`, Object.keys(updateData));

    // Mettre à jour le profil
    await db.update(
      'benevoles',
      updateData,
      'id = ?',
      [benevoleId],
      'remote'
    );

    console.log(`[UPDATE PROFILE] ✓ Profil mis à jour avec succès`);

    return res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès'
    });
  } catch (err) {
    console.error('[Update Profile Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du profil',
      error: err.message
    });
  }
});

/**
 * DELETE /api/benevolat/desinscription/:inscriptionId/future-occurrences
 * Désinscription d'un bénévole de toutes les occurrences futures d'une action récurrente
 */
router.delete('/benevolat/desinscription/:inscriptionId/future-occurrences', authMiddleware, async (req, res) => {
    try {
        const { inscriptionId } = req.params;
        const currentUserId = req.user.id;
        const userAssociationNom = req.user.uri;

        // Récupérer l'inscription et l'action
        const checkQuery = `
            SELECT ba.*,
                   a.nom as action_nom,
                   a.association_nom,
                   a.recurrence,
                   a.rue, a.ville, a.pays,
                   a.heure_debut, a.heure_fin,
                   a.responsable_email
            FROM Benevoles_Actions ba
            JOIN actions a ON ba.action_id = a.id
            WHERE ba.id = ?
        `;

        const inscriptions = await db.select(checkQuery, [inscriptionId]);

        if (!inscriptions || inscriptions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Inscription introuvable'
            });
        }

        const inscription = inscriptions[0];

        // Vérifier les permissions
        const isOwnInscription = inscription.benevole_id === currentUserId;
        const isAssociationAdmin = inscription.association_nom === userAssociationNom;

        if (!isOwnInscription && !isAssociationAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Vous n\'avez pas les permissions pour désinscrire ce bénévole'
            });
        }

        // Vérifier que l'action est récurrente
        if (inscription.recurrence === 'Aucune') {
            return res.status(400).json({
                success: false,
                message: 'Cette action n\'est pas récurrente'
            });
        }

        // Récupérer toutes les inscriptions futures (>= date de l'occurrence cliquée)
        const futureInscriptionsQuery = `
            SELECT ba.id, ba.date_action
            FROM Benevoles_Actions ba
            WHERE ba.benevole_id = ?
              AND ba.action_id = ?
              AND ba.date_action >= ?
            ORDER BY ba.date_action ASC
        `;

        const futureInscriptions = await db.select(futureInscriptionsQuery, [
            inscription.benevole_id,
            inscription.action_id,
            inscription.date_action
        ]);

        if (!futureInscriptions || futureInscriptions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Aucune inscription future trouvée'
            });
        }

        const count = futureInscriptions.length;
        const dateDebut = futureInscriptions[0].date_action;
        const dateFin = futureInscriptions[count - 1].date_action;

        // Récupérer les informations du bénévole pour l'email
        const benevoleQuery = 'SELECT nom, prenom, email, telephone FROM benevoles WHERE id = ?';
        const benevoleResults = await db.select(benevoleQuery, [inscription.benevole_id]);

        // Supprimer toutes les inscriptions futures
        const deleteQuery = `
            DELETE FROM Benevoles_Actions
            WHERE benevole_id = ?
              AND action_id = ?
              AND date_action >= ?
        `;

        await db.query(deleteQuery, [
            inscription.benevole_id,
            inscription.action_id,
            inscription.date_action
        ],'remote' );

        // Envoyer l'email récapitulatif
        if (benevoleResults && benevoleResults.length > 0) {
            try {
                const benevole = benevoleResults[0];

                // Récupérer le logo de l'association
                let logoUrl = '';
                if (inscription.association_nom) {
                    try {
                        const assoQuery = 'SELECT logoUrl FROM Assos WHERE uri = ?';
                        const assoResults = await db.select(assoQuery, [inscription.association_nom], 'remote');
                        if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
                            logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                        }
                    } catch (assoErr) {
                        console.warn(`[BENEVOLAT DESINSCRIPTION GROUPEE] Logo introuvable:`, assoErr);
                    }
                }

                // Formater les dates
                const dateDebutFormatted = new Date(dateDebut).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const dateFinFormatted = new Date(dateFin).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const heureDebut = inscription.heure_debut.substring(0, 5);
                const heureFin = inscription.heure_fin.substring(0, 5);

                const lieu = [inscription.rue, inscription.ville, inscription.pays]
                    .filter(Boolean)
                    .join(', ') || 'À préciser';

                // Construire le libellé de récurrence
                let recurrenceLabel = '';
                switch (inscription.recurrence) {
                    case 'Quotidienne':
                        recurrenceLabel = 'quotidiennes';
                        break;
                    case 'Hebdomadaire':
                        recurrenceLabel = 'hebdomadaires';
                        break;
                    default:
                        recurrenceLabel = '';
                }

                // Construire le texte de date pour l'email
                const actionDateText = `Toutes les "${inscription.action_nom}" ${recurrenceLabel} à partir du ${dateDebutFormatted}`;

                // Variables pour l'email récapitulatif
                const variables = {
                    logo_url: logoUrl,
                    benevole_prenom: benevole.prenom,
                    action_nom: inscription.action_nom,
                    action_date: actionDateText,
                    action_heure_debut: heureDebut,
                    action_heure_fin: heureFin,
                    action_lieu: lieu,
                    nb_occurrences: count.toString(),
                    date_debut: dateDebutFormatted,
                    date_fin: dateFinFormatted
                };

                // Envoyer l'email au bénévole
                await mailService.sendTemplateEmail(
                    benevole.email,
                    7450673, // Utiliser le même template que pour la désinscription simple (à adapter si besoin)
                    variables,
                    `Désinscription : ${inscription.action_nom} - ${count} occurrence(s)`
                );

                console.log(`[BENEVOLAT DESINSCRIPTION GROUPEE] ✓ Email envoyé à ${benevole.email} pour ${count} occurrences`);
            } catch (emailErr) {
                console.error(`[BENEVOLAT DESINSCRIPTION GROUPEE] ✗ Erreur envoi email:`, emailErr);
            }
        }

        res.status(200).json({
            success: true,
            message: `Bénévole désinscrit de ${count} occurrence(s)`,
            count: count,
            date_debut: dateDebut,
            date_fin: dateFin,
            action: {
                nom: inscription.action_nom
            }
        });

    } catch (error) {
        console.error('Erreur lors de la désinscription groupée:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la désinscription groupée'
        });
    }
});

/**
 * DELETE /api/benevolat/desinscription/:inscriptionId
 * Désinscription d'un bénévole d'une action
 * Un admin (membre de l'association) peut désinscrire n'importe quel bénévole
 */
router.delete('/benevolat/desinscription/:inscriptionId', authMiddleware, async (req, res) => {
    try {
        const { inscriptionId } = req.params;
        const currentUserId = req.user.id;
        const userAssociationNom = req.user.uri; // Association de l'utilisateur connecté

        // Récupérer l'inscription et vérifier les permissions
        const checkQuery = `
            SELECT ba.*,
                   a.nom as action_nom,
                   a.association_nom,
                   a.rue, a.ville, a.pays,
                   a.heure_debut, a.heure_fin,
                   a.responsable_email
            FROM Benevoles_Actions ba
            JOIN actions a ON ba.action_id = a.id
            WHERE ba.id = ?
        `;

        const inscriptions = await db.select(checkQuery, [inscriptionId]);

        if (!inscriptions || inscriptions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Inscription introuvable'
            });
        }

        const inscription = inscriptions[0];

        // Vérifier les permissions : soit c'est le bénévole lui-même, soit c'est un admin de l'association
        const isOwnInscription = inscription.benevole_id === currentUserId;
        const isAssociationAdmin = inscription.association_nom === userAssociationNom;

        if (!isOwnInscription && !isAssociationAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Vous n\'avez pas les permissions pour désinscrire ce bénévole'
            });
        }

        // Envoi des emails de notification AVANT la suppression
        try {
            console.log(`[BENEVOLAT DESINSCRIPTION] Envoi des notifications email pour la désinscription ${inscriptionId}`);

            // 1. Récupérer les informations du bénévole
            const benevoleQuery = 'SELECT nom, prenom, email, telephone FROM benevoles WHERE id = ?';
            const benevoleResults = await db.select(benevoleQuery, [inscription.benevole_id]);

            if (benevoleResults && benevoleResults.length > 0) {
                const benevole = benevoleResults[0];

                // 2. Récupérer les informations du responsable
                const responsableQuery = 'SELECT nom, prenom FROM benevoles WHERE email = ?';
                const responsableResults = await db.select(responsableQuery, [inscription.responsable_email]);

                const responsable = responsableResults && responsableResults.length > 0
                    ? responsableResults[0]
                    : { nom: '', prenom: '' };

                // 3. Récupérer le logo de l'association
                let logoUrl = '';
                if (inscription.association_nom) {
                    try {
                        const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                        const assoResults = await db.select(assoQuery, [inscription.association_nom], 'remote');
                        if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
                            logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                        }
                    } catch (assoErr) {
                        console.warn(`[BENEVOLAT DESINSCRIPTION] Impossible de récupérer le logo de l'association:`, assoErr);
                    }
                }

                // 4. Formater la date et les horaires
                const dateFormatted = new Date(inscription.date_action).toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const heureDebut = inscription.heure_debut.substring(0, 5);
                const heureFin = inscription.heure_fin.substring(0, 5);

                // Construire le lieu
                const lieu = [inscription.rue, inscription.ville, inscription.pays]
                    .filter(Boolean)
                    .join(', ') || 'À préciser';

                // Variables communes aux deux emails
                const commonVariables = {
                    action_nom: inscription.action_nom,
                    action_date: dateFormatted,
                    action_heure_debut: heureDebut,
                    action_heure_fin: heureFin,
                    action_lieu: lieu,
                    logo_url: logoUrl
                };

                // 5a. Envoyer l'email de confirmation au bénévole
                try {
                    const benevoleTemplateId = 7450673;
                    const benevoleVariables = {
                        ...commonVariables,
                        benevole_prenom: benevole.prenom
                    };

                    await mailService.sendTemplateEmail(
                        benevole.email,
                        benevoleTemplateId,
                        benevoleVariables,
                        `Désinscription : ${inscription.action_nom} le ${dateFormatted} ${heureDebut}`
                    );

                    console.log(`[BENEVOLAT DESINSCRIPTION] ✓ Email de confirmation envoyé au bénévole: ${benevole.email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT DESINSCRIPTION] ✗ Erreur envoi email bénévole:`, emailErr);
                }

                // 5b. Envoyer l'email de notification au responsable
                try {
                    const responsableTemplateId = 7450675;
                    const responsableVariables = {
                        ...commonVariables,
                        responsable_prenom: responsable.prenom || 'Responsable',
                        benevole_prenom: benevole.prenom,
                        benevole_nom: benevole.nom,
                        benevole_email: benevole.email,
                        benevole_telephone: benevole.telephone || 'Non renseigné'
                    };

                    await mailService.sendTemplateEmail(
                        inscription.responsable_email,
                        responsableTemplateId,
                        responsableVariables,
                        `Désinscription : ${inscription.action_nom} le ${dateFormatted} ${heureDebut}`
                    );

                    console.log(`[BENEVOLAT DESINSCRIPTION] ✓ Email envoyé au responsable: ${inscription.responsable_email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT DESINSCRIPTION] ✗ Erreur envoi email responsable:`, emailErr);
                }
            }
        } catch (notificationErr) {
            // Logger l'erreur mais ne pas bloquer la désinscription
            console.error('[BENEVOLAT DESINSCRIPTION] Erreur lors de l\'envoi des notifications:', notificationErr);
        }

        // Supprimer l'inscription
        const deleteQuery = 'DELETE FROM Benevoles_Actions WHERE id = ?';
        await db.query(deleteQuery, [inscriptionId],'remote');

        res.status(200).json({
            success: true,
            message: 'Désinscription réussie',
            action: {
                nom: inscription.action_nom,
                date_action: inscription.date_action
            }
        });

    } catch (error) {
        console.error('Erreur lors de la désinscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la désinscription'
        });
    }
});


/**
 * GET /api/benevolat/cron/send-reminders
 * Envoie un email de rappel aux bénévoles inscrits à une action prévue le lendemain
 * Cette route est appelée par un cron quotidien à 14h
 */
router.get('/benevolat/cron/send-reminders', async (req, res) => {
  try {
    console.log('[CRON REMINDERS] Début de l\'exécution du cron de rappel');

    // 1. Calculer la date de demain
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // Format YYYY-MM-DD

    console.log(`[CRON REMINDERS] Date cible: ${tomorrowStr}`);

    // 2. Récupérer toutes les inscriptions pour demain
    const query = `
      SELECT
        ba.id as inscription_id,
        ba.benevole_id,
        ba.action_id,
        ba.date_action,
        b.nom as benevole_nom,
        b.prenom as benevole_prenom,
        b.email as benevole_email,
        a.nom as action_nom,
        a.heure_debut,
        a.heure_fin,
        a.rue,
        a.ville,
        a.pays,
        a.association_nom
      FROM Benevoles_Actions ba
      JOIN benevoles b ON ba.benevole_id = b.id
      JOIN actions a ON ba.action_id = a.id
      WHERE ba.date_action = ?
        AND ba.statut = 'inscrit'
        AND ba.relance_email IS NULL
      ORDER BY b.email, a.heure_debut
    `;

    const inscriptions = await db.select(query, [tomorrowStr]);

    console.log(`[CRON REMINDERS] ${inscriptions ? inscriptions.length : 0} inscriptions trouvées`);

    if (!inscriptions || inscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucune inscription à rappeler pour demain',
        date_cible: tomorrowStr,
        emails_envoyes: 0,
        erreurs: 0
      });
    }

    // 3. Envoyer les emails de rappel
    let emailsEnvoyes = 0;
    let erreurs = 0;
    const details = [];
    const dateExecution = new Date();

    for (const inscription of inscriptions) {
      try {
        console.log(`[CRON REMINDERS] Traitement de l'inscription ${inscription.inscription_id} pour ${inscription.benevole_email}`);

        // 3a. Récupérer le logo de l'association
        let logoUrl = '';
        if (inscription.association_nom) {
          try {
            const assoQuery = 'SELECT logoUrl FROM Assos WHERE uri = ?';
            const assoResults = await db.select(assoQuery, [inscription.association_nom], 'remote');
            if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
              logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
            }
          } catch (assoErr) {
            console.warn(`[CRON REMINDERS] Impossible de récupérer le logo pour ${inscription.association_nom}:`, assoErr);
          }
        }

        // 3b. Formater la date en français
        const dateFormatted = new Date(inscription.date_action).toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // 3c. Formater les horaires
        const heureDebut = inscription.heure_debut.substring(0, 5); // HH:MM
        const heureFin = inscription.heure_fin.substring(0, 5); // HH:MM

        // 3d. Construire l'adresse
        const lieu = [inscription.rue, inscription.ville, inscription.pays]
          .filter(Boolean)
          .join(', ') || 'À préciser';

        // 3e. Préparer les variables du template
        const variables = {
          logo_url: logoUrl,
          benevole_prenom: inscription.benevole_prenom || 'Bénévole',
          action_nom: inscription.action_nom,
          action_date: dateFormatted,
          action_heure_debut: heureDebut,
          action_heure_fin: heureFin,
          action_lieu: lieu
        };

        // 3f. Envoyer l'email
        await mailService.sendTemplateEmail(
          inscription.benevole_email,
          7451569, // ID du template de rappel
          variables,
          `Rappel : ${inscription.action_nom} demain à ${heureDebut}`
        );

        // 3g. Mettre à jour la colonne relance_email
        await db.update(
          'Benevoles_Actions',
          { relance_email: dateExecution },
          'id = ?',
          [inscription.inscription_id],
          'remote'
        );

        emailsEnvoyes++;
        details.push({
          benevole_email: inscription.benevole_email,
          action_nom: inscription.action_nom,
          date_action: inscription.date_action,
          statut: 'envoyé'
        });

        console.log(`[CRON REMINDERS] ✓ Email envoyé à ${inscription.benevole_email} pour ${inscription.action_nom}`);

      } catch (emailErr) {
        erreurs++;
        details.push({
          benevole_email: inscription.benevole_email,
          action_nom: inscription.action_nom,
          date_action: inscription.date_action,
          statut: 'erreur',
          erreur: emailErr.message
        });

        console.error(`[CRON REMINDERS] ✗ Erreur envoi email pour ${inscription.benevole_email}:`, emailErr);
      }
    }

    // 4. Retourner le résumé
    console.log(`[CRON REMINDERS] Fin de l'exécution: ${emailsEnvoyes} emails envoyés, ${erreurs} erreurs`);

    return res.status(200).json({
      success: true,
      message: `${emailsEnvoyes} email(s) de rappel envoyé(s)`,
      date_cible: tomorrowStr,
      date_execution: dateExecution.toISOString(),
      emails_envoyes: emailsEnvoyes,
      erreurs: erreurs,
      details: details
    });

  } catch (error) {
    console.error('[CRON REMINDERS] Erreur globale:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi des rappels',
      error: error.message
    });
  }
});

/**
 * GET /api/benevolat/cron/sync-to-sheets
 * Synchronise tous les bénévoles de la base de données vers le Google Sheet
 * Cette route est appelée par un cron pour maintenir le Google Sheet à jour
 */
router.get('/benevolat/cron/sync-to-sheets', async (req, res) => {
  try {
    console.log('[CRON SHEETS SYNC] Début de la synchronisation vers Google Sheets');

    const dateExecution = new Date();

    // 1. Récupérer tous les bénévoles de la table
    const query = `
      SELECT nom, prenom, genre, telephone, statut
      FROM benevoles
      ORDER BY nom, prenom
    `;

    const benevoles = await db.select(query, [], 'remote');

    console.log(`[CRON SHEETS SYNC] ${benevoles ? benevoles.length : 0} bénévole(s) récupéré(s) de la base de données`);

    if (!benevoles || benevoles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucun bénévole à synchroniser',
        date_execution: dateExecution.toISOString(),
        count: 0
      });
    }

    // 2. Synchroniser vers Google Sheets
    const result = await googleSheetsService.syncVolunteers(benevoles);

    console.log(`[CRON SHEETS SYNC] Synchronisation terminée avec succès: ${result.count} bénévole(s) synchronisé(s)`);

    return res.status(200).json({
      success: true,
      message: `${result.count} bénévole(s) synchronisé(s) vers Google Sheets`,
      date_execution: dateExecution.toISOString(),
      count: result.count,
      updated_cells: result.updatedCells,
      updated_rows: result.updatedRows
    });

  } catch (error) {
    console.error('[CRON SHEETS SYNC] Erreur lors de la synchronisation:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation vers Google Sheets',
      error: error.message
    });
  }
});


module.exports = router;
