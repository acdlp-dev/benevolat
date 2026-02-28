const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../services/bdd');
const { sendTemplateEmail } = require('../services/mailService');

// Variables et instanciations
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const urlOrigin = process.env.URL_ORIGIN;

// Helpers
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => {
    // Vérifier que le mot de passe fait au moins 6 caractères
    if (password.length < 6) {
        return { valid: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' };
    }

    // Liste des caractères problématiques à détecter
    const problematicChars = [];

    // Vérifier chaque caractère du mot de passe
    for (let i = 0; i < password.length; i++) {
        const char = password[i];
        const charCode = char.charCodeAt(0);

        // Caractères de contrôle (invisibles)
        if (charCode >= 0 && charCode <= 31) {
            problematicChars.push(`caractère de contrôle (code ${charCode})`);
        }
        // Caractère DEL
        else if (charCode === 127) {
            problematicChars.push('caractère DEL');
        }
    }

    // Si des caractères problématiques sont trouvés
    if (problematicChars.length > 0) {
        const uniqueChars = [...new Set(problematicChars)];
        return {
            valid: false,
            message: `Le mot de passe contient des caractères non autorisés : ${uniqueChars.join(', ')}. Veuillez utiliser uniquement des lettres, chiffres et caractères spéciaux visibles.`
        };
    }

    return { valid: true };
};
const generateResetToken = () => crypto.randomBytes(32).toString('hex');

function authMiddleware(req, res, next) {
    try {
        const token = req.cookies.auth_token; // Récupère le JWT depuis le cookie
        if (!token) {
            return res.status(401).json({ message: 'No token provided.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        next();
    } catch (err) {
        console.error(`[AuthMiddleware] Token error : ${err.message}`);
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
}



// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('auth_token');
    return res.status(200).json({ message: 'Logged out successfully.' });
});

// Étape 1 : Demande de code OTP pour inscription bénévolat
router.post('/request-otp', async(req, res) => {
    const { email, confirmEmail, associationName } = req.body;
    console.log("Demande OTP bénévolat reçue pour " + email);

    // Validation
    if (!email || !confirmEmail) {
        return res.status(400).json({ message: 'Email et confirmation requis.' });
    }
    if (email !== confirmEmail) {
        return res.status(400).json({ message: 'Les adresses email ne correspondent pas.' });
    }
    if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Format d\'email invalide.' });
    }

    try {
        // Vérifier si l'email existe déjà
        const existingVolunteer = await db.select('SELECT * FROM benevoles WHERE email = ?', [email]);

        // 🔒 PROTECTION CONTRE L'ENUMERATION D'UTILISATEURS
        // On renvoie TOUJOURS le même message de succès, que le compte existe ou non

        let shouldSendOTP = true;
        let shouldCreateOrUpdate = true;

        if (existingVolunteer.length > 0) {
            const volunteer = existingVolunteer[0];
            if (volunteer.is_verified) {
                // ⚠️ COMPTE DEJA VERIFIE : Ne pas envoyer d'OTP
                // Mais envoyer un email informatif avec lien reset password
                shouldSendOTP = false;
                shouldCreateOrUpdate = false;
                console.log(`⚠️ [BENEVOLAT OTP SECURITY] Tentative d'inscription sur compte existant: ${email}`);

                // Générer un token de réinitialisation et envoyer un email informatif
                try {
                    const resetToken = generateResetToken();
                    const tokenExpiry = Date.now() + 3600000; // 1 heure

                    await db.update('benevoles', {
                        reset_token: resetToken,
                        reset_token_expiry: tokenExpiry
                    }, 'email = ?', [email]);

                    // Récupérer les infos de l'association pour le logo
                    let logoUrl = '';
                    let nomAsso = '';
                    if (associationName) {
                        try {
                            const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                            const assoResults = await db.select(assoQuery, [associationName], 'remote');
                            if (assoResults && assoResults.length > 0) {
                                if (assoResults[0].logoUrl) {
                                    logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                                }
                                nomAsso = assoResults[0].nom;
                            }
                        } catch (assoErr) {
                            console.warn(`[BENEVOLAT ACCOUNT EXISTS] Impossible de récupérer le logo:`, assoErr);
                        }
                    }

                    const resetUrl = `${urlOrigin}/app/new-password/token/${resetToken}`;

                    // Template ID pour "compte existant détecté"
                    const templateId = 7472537; // Template personnalisé pour tentative d'inscription sur compte existant
                    const variables = {
                        prenom: volunteer.prenom || 'Bénévole',
                        lien_reinit_password: resetUrl,
                        logo_url: logoUrl
                    };

                    await sendTemplateEmail(
                        email,
                        templateId,
                        variables,
                        `${nomAsso} : Votre compte existe déjà`
                    );

                    console.log(`📧 [BENEVOLAT ACCOUNT EXISTS] Email informatif envoyé à: ${email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT ACCOUNT EXISTS] Erreur envoi email:`, emailErr);
                    // Ne pas bloquer le flow, on continue avec le message générique
                }
            }
            // Si email existe mais pas vérifié, on continue normalement avec un nouveau OTP
        }

        if (shouldCreateOrUpdate) {
            // Générer un code OTP à 6 chiffres
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiry = Date.now() + (10 * 60000); // 10 minutes

            console.log(`🔑 [BENEVOLAT OTP] Code généré pour ${email}: ${otp} (expire: ${new Date(otpExpiry)})`);

            // Générer un UUID pour le tracking
            const { v4: uuidv4 } = require('uuid');
            const trackingId = uuidv4();

            // INSERT ou UPDATE en base
            if (existingVolunteer.length > 0) {
                // UPDATE
                await db.update('benevoles', {
                    verification_code: otp,
                    verification_code_expiry: otpExpiry,
                    updated_at: new Date()
                }, 'email = ?', [email]);
            } else {
                // INSERT minimal
                await db.insert('benevoles', {
                    email: email,
                    association_nom: associationName || '',
                    verification_code: otp,
                    verification_code_expiry: otpExpiry,
                    tracking_uuid: trackingId,
                    is_verified: 0,
                    created_at: new Date()
                });
            }

            if (shouldSendOTP) {
                // Récupérer le logo de l'association
                let logoUrl = '';
                let nomAsso = '';

                if (associationName) {
                    try {
                        const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                        const assoResults = await db.select(assoQuery, [associationName], 'remote');
                        if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
                            logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                            nomAsso = assoResults[0].nom;
                        }
                    } catch (assoErr) {
                        console.warn(`[BENEVOLAT OTP] Impossible de récupérer le logo de l'association:`, assoErr);
                    }
                }

                // Envoyer l'email avec le code OTP
                try {
                    const templateId = 7367008;
                    const variables = {
                        code_verification: otp,
                        logo_url: logoUrl
                    };

                    await sendTemplateEmail(
                        email,
                        templateId,
                        variables,
                        `${nomAsso} : Votre code de vérification`
                    );

                    console.log(`✅ [BENEVOLAT OTP] Email OTP envoyé à: ${email}`);
                } catch (emailErr) {
                    console.error(`[BENEVOLAT OTP] Erreur envoi email:`, emailErr);
                    return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'email.' });
                }
            }
        }

        // 🔒 MESSAGE GENERIQUE : Toujours le même, que le compte existe ou non
        return res.status(200).json({
            message: 'Si cette adresse email est valide, un code de vérification a été envoyé.',
            expiresIn: 600 // 10 minutes en secondes
        });

    } catch (err) {
        console.error(`[Benevolat Request OTP Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

// Étape 2 : Vérification du code OTP
router.post('/verify-otp', async(req, res) => {
    const { email, code } = req.body;
    console.log(`🔍 [BENEVOLAT OTP] Vérification du code pour: ${email}`);

    if (!email || !code) {
        return res.status(400).json({ message: 'Email et code requis.' });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Format d\'email invalide.' });
    }

    try {
        // Récupérer le bénévole
        const volunteer = await db.select(
            'SELECT * FROM benevoles WHERE email = ? AND verification_code = ? AND verification_code_expiry > ?', [email, code, Date.now()]
        );

        if (volunteer.length === 0) {
            console.log(`❌ [BENEVOLAT OTP] Code invalide ou expiré pour: ${email}`);
            return res.status(400).json({ message: 'Code invalide ou expiré.' });
        }

        const volunteerData = volunteer[0];

        // Générer un token de continuation sécurisé
        const completionToken = generateResetToken(); // Réutiliser la fonction existante
        const completionTokenExpiry = Date.now() + (24 * 3600000); // 24 heures

        // Marquer comme vérifié et stocker le token de continuation
        await db.update(
            'benevoles', {
                is_verified: 1,
                verified_at: new Date(),
                verification_code: null,
                verification_code_expiry: null,
                completion_token: completionToken,
                completion_token_expiry: completionTokenExpiry
            },
            'id = ?', [volunteerData.id]
        );

        console.log(`✅ [BENEVOLAT OTP] Email vérifié avec succès pour: ${email}`);
        console.log(`🔑 [BENEVOLAT OTP] Token de continuation généré: ${completionToken.substring(0, 10)}...`);

        return res.status(200).json({
            message: 'Email vérifié avec succès.',
            token: completionToken,
            email: email
        });

    } catch (err) {
        console.error(`[Benevolat Verify OTP Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

// Étape 3 : Complétion de l'inscription avec toutes les informations
router.post('/complete-signup', async(req, res) => {
    const {
        token,
        password,
        prenom: firstName,
        nom: lastName,
        telephone: phone,
        adresse: address,
        ville: city,
        code_postal: postalCode,
        pays: country,
        age,
        date_naissance: birthDate,
        genre: gender,
        vehicule: hasVehicle,
        source_connaissance: sourceKnowledge,
        source_connaissance_autre: sourceKnowledgeOther,
        metiers_competences: skills
    } = req.body;

    console.log("Demande de complétion d'inscription bénévolat avec token");

    // Validation du token
    if (!token) {
        return res.status(400).json({ message: 'Token requis.' });
    }

    try {
        // Vérifier le token et récupérer le bénévole
        const volunteer = await db.select(
            'SELECT * FROM benevoles WHERE completion_token = ? AND completion_token_expiry > ?', [token, Date.now()]
        );

        if (volunteer.length === 0) {
            console.log(`❌ [BENEVOLAT COMPLETE] Token invalide ou expiré`);
            return res.status(400).json({ message: 'Token invalide ou expiré.' });
        }

        const volunteerData = volunteer[0];
        const email = volunteerData.email;

        console.log(`📝 [BENEVOLAT COMPLETE] Complétion pour: ${email}`);

        // Validation des champs obligatoires
        const missingFields = [];
        if (!password) missingFields.push('mot de passe');
        if (!firstName) missingFields.push('prénom');
        if (!lastName) missingFields.push('nom');
        if (!phone) missingFields.push('téléphone');
        if (!address) missingFields.push('adresse');
        if (!city) missingFields.push('ville');
        if (!postalCode) missingFields.push('code postal');
        if (!age) missingFields.push('âge');
        if (!gender) missingFields.push('genre');

        if (missingFields.length > 0) {
            const fieldsList = missingFields.length === 1 ?
                `Le champ "${missingFields[0]}"` :
                `Les champs "${missingFields.join('", "')}"`;
            return res.status(400).json({
                message: `${fieldsList} ${missingFields.length === 1 ? 'est obligatoire' : 'sont obligatoires'}.`,
                missingFields: missingFields
            });
        }

        // Validation du mot de passe
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ message: passwordValidation.message });
        }

        // Validation de l'âge
        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 16 || ageNum > 99) {
            return res.status(400).json({ message: 'L\'âge doit être compris entre 16 et 99 ans.' });
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // UPDATE du bénévole avec toutes les informations
        await db.update('benevoles', {
            password: hashedPassword,
            nom: lastName,
            prenom: firstName,
            telephone: phone,
            adresse: address,
            ville: city,
            code_postal: postalCode,
            pays: country || 'France',
            age: ageNum,
            date_naissance: birthDate || null,
            genre: gender.toLowerCase(),
            vehicule: hasVehicle || 'non',
            source_connaissance: sourceKnowledge || null,
            source_connaissance_autre: sourceKnowledgeOther || null,
            metiers_competences: skills || '',
            statut: 'restreint', // Définir le statut à "restreint"
            completion_token: null,
            completion_token_expiry: null,
            updated_at: new Date()
        }, 'id = ?', [volunteerData.id]);

        console.log(`✅ [BENEVOLAT COMPLETE] Profil complété pour: ${email}`);

        // Récupérer le logo de l'association
        let logoUrl = '';
        let nomAsso = '';
        if (volunteerData.association_nom) {
            try {
                const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                const assoResults = await db.select(assoQuery, [volunteerData.association_nom], 'remote');
                if (assoResults && assoResults.length > 0 && assoResults[0].logoUrl) {
                    logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                    nomAsso = assoResults[0].nom;
                }
            } catch (assoErr) {
                console.warn(`[BENEVOLAT COMPLETE] Impossible de récupérer le logo de l'association:`, assoErr);
            }
        }

        // Envoyer l'email de bienvenue
        try {
            const templateId = 7368057; // Template de bienvenue
            const variables = {
                logo_url: logoUrl
            };

            await sendTemplateEmail(
                email,
                templateId,
                variables,
                `${nomAsso} : Bienvenue dans l'équipe bénévole !`
            );

            console.log(`📧 [BENEVOLAT COMPLETE] Email de bienvenue envoyé à: ${email}`);
        } catch (emailErr) {
            console.error(`[BENEVOLAT COMPLETE] Erreur envoi email:`, emailErr);
            // Ne pas bloquer l'inscription si l'email échoue
        }

        return res.status(201).json({
            message: 'Inscription complétée avec succès !',
            trackingId: volunteerData.tracking_uuid
        });

    } catch (err) {
        console.error(`[Benevolat Complete Signup Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

// Signin Bénévolat
router.post('/signin', async(req, res) => {
    const { email, password } = req.body;
    console.log("Demande de signin bénévolat reçue de " + email);

    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }
    if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Format d\'email invalide.' });
    }

    try {
        const results = await db.select('SELECT * FROM benevoles WHERE email = ?', [email]);
        if (results.length === 0) {
            return res.status(401).json({ message: 'Identifiants invalides.' });
        }

        const volunteer = results[0];
        const isPasswordValid = await bcrypt.compare(password, volunteer.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Identifiants invalides.' });
        }

        if (!volunteer.is_verified) {
            return res.status(403).json({ message: 'Votre compte n\' est pas encore actif, vous devez vous connecter sur votre boite mail et cliquer sur le bouton de confirmation avant.' });
        }

        // Générer un token JWT avec les informations du bénévole
        const token = jwt.sign({
                id: volunteer.id,
                email: volunteer.email,
                firstName: volunteer.prenom,
                lastName: volunteer.nom,
                role: 'volunteer',
                associationName: volunteer.association_nom
            },
            JWT_SECRET, { expiresIn: '1h' }
        );

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.URL_ORIGIN === 'https://acdlp.com/',
            sameSite: 'strict',
            maxAge: 3600000,
        });

        console.log(`✅ [BENEVOLAT SIGNIN] Connexion réussie pour: ${volunteer.email}`);
        return res.status(200).json({ message: 'Connexion réussie' });
    } catch (err) {
        console.error(`[Benevolat Signin Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur de base de données.' });
    }
});


// Réinitialisation de mot de passe pour les bénévoles
router.post('/request-password-reset', async (req, res) => {
    const { email } = req.body;
    console.log(`🔑 [BENEVOLAT PASSWORD RESET] Demande de réinitialisation pour: ${email}`);

    if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Format d\'email invalide.' });
    }

    try {
        const results = await db.select('SELECT * FROM benevoles WHERE email = ?', [email]);

        if (results.length === 0) {
            // 🔒 PROTECTION CONTRE L'ENUMERATION D'UTILISATEURS
            // Si l'email n'existe pas, envoyer un email personnalisé pour inviter à créer un compte
            // au lieu de retourner une erreur 404

            const signupUrl = `${urlOrigin}/app/signup`;

            await sendTemplateEmail(email, 7614867, {
                lien_creation_compte: signupUrl
            }, 'Espace Bénévole : Création de compte');

            // Toujours retourner un message générique pour éviter l'énumération
            return res.status(200).json({
                message: 'Si cette adresse email est valide, un email a été envoyé.'
            });
        }

        const volunteer = results[0];
        const resetToken = generateResetToken();
        const tokenExpiry = Date.now() + 3600000; // 1 heure

        await db.update('benevoles', { reset_token: resetToken, reset_token_expiry: tokenExpiry }, 'email = ?', [email]);

        // Récupérer les informations de contact bénévolat de l'association
        let replyToConfig = null;
        if (volunteer.association_nom) {
            try {
                const assoQuery = 'SELECT nom, benevoles_resp_email FROM Assos WHERE uri = ?';
                const assoResults = await db.select(assoQuery, [volunteer.association_nom], 'remote');
                if (assoResults && assoResults.length > 0 && assoResults[0].benevoles_resp_email) {
                    replyToConfig = {
                        email: assoResults[0].benevoles_resp_email,
                        name: assoResults[0].nom
                    };
                    console.log(`[BENEVOLAT PASSWORD RESET] Reply-to configuré : ${assoResults[0].nom} <${assoResults[0].benevoles_resp_email}>`);
                }
            } catch (assoErr) {
                console.warn(`[BENEVOLAT PASSWORD RESET] Impossible de récupérer l'email de contact:`, assoErr);
            }
        }

        const resetUrl = `${urlOrigin}/app/new-password/token/${resetToken}`;

        // LOG POUR LE DÉVELOPPEMENT
        console.log(`🔗 [BENEVOLAT PASSWORD RESET] Lien de réinitialisation pour ${email}:`);
        console.log(`   ${resetUrl}`);
        console.log(`   Token: ${resetToken}`);
        console.log(`   Expire le: ${new Date(tokenExpiry)}`);

        const templateId = 5536948; // Template Mailjet pour réinitialisation
        const variables = { 
            prenom: volunteer.prenom, 
            lien_reinit_password: resetUrl 
        };

        await sendTemplateEmail(
            email, 
            templateId, 
            variables, 
            'Espace Bénévole : Réinitialisez votre mot de passe',
            replyToConfig
        );

        console.log(`✅ [BENEVOLAT PASSWORD RESET] Email de réinitialisation envoyé à: ${email}`);
        return res.status(200).json({ message: 'Lien de réinitialisation envoyé par email.' });
    } catch (err) {
        console.error(`[Benevolat Request Password Reset Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

/**
 * Réinitialisation de mot de passe pour les bénévoles connectés
 * Cette route nécessite une authentification et utilise l'email de l'utilisateur connecté
 */
router.post('/request-password-reset-current-user', authMiddleware, async (req, res) => {
    console.log(`🔑 [BENEVOLAT PASSWORD RESET] Demande de réinitialisation pour l'utilisateur connecté`);

    try {
        // Récupérer l'email de l'utilisateur connecté depuis le JWT
        const userEmail = req.user.email;
        console.log(`👤 [BENEVOLAT PASSWORD RESET] Email de l'utilisateur connecté: ${userEmail}`);

        const results = await db.select('SELECT * FROM benevoles WHERE email = ?', [userEmail]);
        if (results.length === 0) {
            console.log(`❌ [BENEVOLAT PASSWORD RESET] Email non trouvé: ${userEmail}`);
            return res.status(404).json({ message: 'Email non trouvé.' });
        }

        const volunteer = results[0];
        const resetToken = generateResetToken();
        const tokenExpiry = Date.now() + 3600000; // 1 heure

        await db.update('benevoles', { reset_token: resetToken, reset_token_expiry: tokenExpiry }, 'email = ?', [userEmail]);

        // Récupérer les informations de contact bénévolat de l'association
        let replyToConfig = null;
        if (volunteer.association_nom) {
            try {
                const assoQuery = 'SELECT nom, benevoles_resp_email FROM Assos WHERE uri = ?';
                const assoResults = await db.select(assoQuery, [volunteer.association_nom], 'remote');
                if (assoResults && assoResults.length > 0 && assoResults[0].benevoles_resp_email) {
                    replyToConfig = {
                        email: assoResults[0].benevoles_resp_email,
                        name: assoResults[0].nom
                    };
                    console.log(`[BENEVOLAT PASSWORD RESET] Reply-to configuré : ${assoResults[0].nom} <${assoResults[0].benevoles_resp_email}>`);
                }
            } catch (assoErr) {
                console.warn(`[BENEVOLAT PASSWORD RESET] Impossible de récupérer l'email de contact:`, assoErr);
            }
        }

        const resetUrl = `${urlOrigin}/app/new-password/token/${resetToken}`;

        // LOG POUR LE DÉVELOPPEMENT
        console.log(`🔗 [BENEVOLAT PASSWORD RESET] Lien de réinitialisation pour ${userEmail}:`);
        console.log(`   ${resetUrl}`);
        console.log(`   Token: ${resetToken}`);
        console.log(`   Expire le: ${new Date(tokenExpiry)}`);

        const templateId = 5536948; // Template Mailjet pour réinitialisation
        const variables = { 
            prenom: volunteer.prenom, 
            lien_reinit_password: resetUrl 
        };

        await sendTemplateEmail(
            userEmail, 
            templateId, 
            variables, 
            'Espace Bénévole : Réinitialisez votre mot de passe',
            replyToConfig
        );

        console.log(`✅ [BENEVOLAT PASSWORD RESET] Email de réinitialisation envoyé à: ${userEmail}`);
        return res.status(200).json({ message: 'Lien de réinitialisation envoyé par email.' });
    } catch (err) {
        console.error(`[Benevolat Request Password Reset Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

/**
 * Réinitialisation du mot de passe pour les bénévoles (avec le reset_token)
 */
router.post('/reset-password', async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;
    console.log(`🔑 [BENEVOLAT PASSWORD RESET] Tentative de réinitialisation avec token`);

    if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: 'Tous les champs sont requis.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Les mots de passe ne correspondent pas.' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
    }

    try {
        const volunteer = await db.select(
            'SELECT * FROM benevoles WHERE reset_token = ? AND reset_token_expiry > ?', 
            [token, Date.now()]
        );

        if (volunteer.length === 0) {
            console.log(`❌ [BENEVOLAT PASSWORD RESET] Token invalide ou expiré`);
            return res.status(400).json({ message: 'Token invalide ou expiré.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.update(
            'benevoles', 
            { password: hashedPassword, reset_token: null, reset_token_expiry: null },
            'id = ?', 
            [volunteer[0].id]
        );

        console.log(`✅ [BENEVOLAT PASSWORD RESET] Mot de passe réinitialisé avec succès pour: ${volunteer[0].email}`);
        return res.status(200).json({ message: 'Mot de passe réinitialisé avec succès.' });
    } catch (err) {
        console.error(`[Benevolat Reset Password Error]: ${err.message}`, err);
        return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});
// Vérification d'email pour les bénévoles
router.get('/verify-email/:token', async(req, res) => {
    const { token } = req.params;
    console.log(`🔍 [BENEVOLAT VERIFICATION] Tentative de vérification avec token: ${token}`);

    try {
        const volunteer = await db.select(
            'SELECT * FROM benevoles WHERE verification_token = ? AND verification_token_expiry > ?', [token, Date.now()]
        );

        if (volunteer.length === 0) {
            console.log(`❌ [BENEVOLAT VERIFICATION] Token invalide ou expiré: ${token}`);
            return res.status(400).json({
                message: 'Token de vérification invalide ou expiré.',
                error: 'INVALID_TOKEN'
            });
        }

        const volunteerData = volunteer[0];

        // Vérifier si déjà vérifié
        if (volunteerData.is_verified) {
            console.log(`✅ [BENEVOLAT VERIFICATION] Email déjà vérifié pour: ${volunteerData.email}`);
            return res.status(200).json({
                message: 'Email déjà vérifié.',
                volunteer: {
                    prenom: volunteerData.prenom,
                    nom: volunteerData.nom,
                    email: volunteerData.email
                }
            });
        }

        // Marquer comme vérifié
        await db.update(
            'benevoles', {
                is_verified: 1,
                verified_at: new Date(),
                verification_token: null,
                verification_token_expiry: null
            },
            'id = ?', [volunteerData.id]
        );

        console.log(`✅ [BENEVOLAT VERIFICATION] Email vérifié avec succès pour: ${volunteerData.email}`);

        // Récupérer le nom réel de l'association depuis la table Assos
        let associationDisplayName = volunteerData.association_nom;
        let logoUrl = '';

        if (volunteerData.association_nom) {
            try {
                const assoQuery = 'SELECT nom, logoUrl FROM Assos WHERE uri = ?';
                const assoResults = await db.select(assoQuery, [volunteerData.association_nom], 'remote');
                if (assoResults && assoResults.length > 0) {
                    // Utiliser le nom de l'association depuis la table Assos
                    associationDisplayName = assoResults[0].nom || volunteerData.association_nom;

                    // Récupérer le logo
                    if (assoResults[0].logoUrl) {
                        logoUrl = `https://acdlp.com/${assoResults[0].logoUrl}`;
                    }
                }
            } catch (assoErr) {
                console.warn(`[BENEVOLAT WELCOME] Impossible de récupérer le logo de l'association:`, assoErr);
            }
        }

        // Envoyer un email de bienvenue avec les instructions de connexion
        try {

            // Envoyer l'email de bienvenue
            const templateId = 7368057; // Template de bienvenue
            const variables = {
                logo_url: logoUrl
            };

            await sendTemplateEmail(
                volunteerData.email,
                templateId,
                variables,
                'ACDLP : Bienvenue dans l\'équipe bénévole'
            );

            console.log(`📧 [BENEVOLAT WELCOME] Email de bienvenue envoyé à: ${volunteerData.email}`);
        } catch (emailErr) {
            console.error(`[Benevolat Welcome Email Error]: ${emailErr.message}`);
            // Ne pas bloquer la vérification si l'email échoue
        }

        return res.status(200).json({
            message: 'Email vérifié avec succès ! Merci pour votre inscription bénévole.',
            volunteer: {
                prenom: volunteerData.prenom,
                nom: volunteerData.nom,
                email: volunteerData.email,
                association_nom: associationDisplayName
            }
        });
    } catch (err) {
        console.error(`[Benevolat Verify Email Error]: ${err.message}`, err);
        return res.status(500).json({
            message: 'Erreur interne du serveur.',
            error: 'SERVER_ERROR'
        });
    }
});

// Export
module.exports = {
    router,
    authMiddleware,
};
