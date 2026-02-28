const express = require('express');
const db = require('../services/bdd');

const router = express.Router();

// Route pour récupérer les infos d'une association par URI (pour le frontend)
router.get('/assos/:uri', async (req, res) => {
  const uri = req.params.uri;
  console.log("Demande d'infos pour l'association : " + uri);

  try {
    const results = await db.select(
      'SELECT id, nom, email, siren, uri, logoUrl AS logo_url, codeCouleur AS code_couleur, signataire_nom, signataire_prenom, adresse, code_postal, ville, tel FROM Assos WHERE uri = ?',
      [uri], 'remote'
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'Association not found.' });
    }

    return res.status(200).json(results[0]);
  } catch (err) {
    console.error(`[Assos Error]: ${err.message}`, err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route legacy pour la config (donation module - conservée pour compatibilité)
router.get('/assos/config/:asso', async (req, res) => {
  const asso = req.params.asso;
  console.log("Demande de config pour " + asso);

  try {
    const results = await db.select(
      'SELECT nom AS name_asso, surnom AS surname_asso, objet, site, ty_page AS ty_link, site_ponctuel_error AS error_link, logoUrl AS logo_url, codeCouleur AS code_couleur, adresse, adresseCheque, code_postal, code_postalCheque, ville, villeCheque, email AS emailAsso, tel FROM Assos WHERE uri = ? order by ajout desc',
      [asso], 'remote'
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'Asso not found.' });
    }

    return res.status(200).json(results[0]);
  } catch (err) {
    console.error(`[Assos Error]: ${err.message}`, err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
