# ACDLP - Context for Claude AI

## Vue d'ensemble du projet

**ACDLP** (Au Coeur de la Précarité) est une plateforme web de gestion du bénévolat associatif. Elle permet aux associations de recruter, coordonner et suivre leurs bénévoles, et aux bénévoles de s'inscrire à des actions de solidarité.

> Les modules cantine (distribution repas), QR code (cartes repas), suivi véhicule et l'ancien backOffice.js ont été supprimés.

---

## Stack Technique

### Frontend
- **Framework**: Angular 18.1.0 (Standalone Components)
- **Langage**: TypeScript 5.4.5
- **Style**: Tailwind CSS 3.1.6
- **UI**: Lucide Icons, FontAwesome, ApexCharts, ngx-sonner (toasts)

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js 4.18.2
- **Base de données**: MySQL 8.0 (mysql2 avec connection pooling)
- **Auth**: JWT (jsonwebtoken) avec cookies HttpOnly
- **Email**: Mailjet (node-mailjet 3.3.6)

### Infrastructure
- **Conteneurisation**: Docker + Docker Compose
- **Serveur Web**: Nginx (reverse proxy)
- **SSL/TLS**: Certificat statique (wildcard *.acdlp.com), TLS 1.2/1.3
- **Monitoring**: Grafana 10.2.0 + Loki 2.9.0 + Promtail 2.9.0
- **DB Admin**: phpMyAdmin

---

## Architecture du Projet

```
acdlp/
├── src/www/acdlp/
│   ├── client/acdlp-angular/            # Frontend Angular 18
│   │   └── src/app/
│   │       ├── core/                    # Guards, interceptors
│   │       ├── modules/
│   │       │   ├── backoffice/          # Panel admin (gestion bénévoles)
│   │       │   ├── backoffice-auth/     # Auth admin
│   │       │   ├── benevolat/           # Espace bénévole
│   │       │   ├── error/               # Pages erreur (404, 500, 403)
│   │       │   ├── layout/              # Layout (navbar, sidebar, footer)
│   │       │   └── uikit/              # Composants UI réutilisables
│   │       └── shared/                  # Composants, services, pipes partagés
│   └── server/node/                     # Backend Node.js/Express
│       ├── server.js                    # Point d'entrée
│       ├── routes/                      # 4 fichiers routes
│       │   ├── auth.js                  # Auth admin + bénévoles (OTP)
│       │   ├── benevoles.js             # Gestion bénévoles + actions
│       │   ├── assos.js                 # Lookup associations
│       │   └── database.js              # Utilitaires DB
│       ├── services/                    # 5 services métier
│       │   ├── bdd.js                   # Abstraction MySQL (dual pool)
│       │   ├── mailService.js           # Envoi emails Mailjet
│       │   ├── googleSheetsService.js   # Sync Google Sheets
│       │   ├── icsService.js            # Génération fichiers iCalendar
│       │   └── inseeService.js          # Validation SIREN/SIRET
│       ├── credentials/                 # Credentials API (gitignored)
│       └── crons/                       # Tâches planifiées
├── nginx/                               # Config Nginx (prod, staging, dev)
├── ssl/                                 # Certificats SSL (gitignored)
├── mysql/                               # Scripts init DB
├── grafana/                             # Dashboards Grafana
├── loki/ + promtail/                    # Config logging
├── docker-compose.yml                   # Production
├── docker-compose.staging.yml           # Staging
├── docker-compose.dev.yml               # Dev
└── .env                                 # Variables environnement (gitignored)
```

---

## Système d'Authentification

L'application gère **2 types d'utilisateurs** avec des flux séparés :

### 1. Associations (Admin)
- **Tables DB**: `users` + `Assos` + `onboarding_backoffice`
- **Flux**: Signup SIREN → Upload justificatif → Vérification email → Login
- **Routes frontend**: `/backoffice-auth/*`, `/backoffice/*`
- **Validation**: API INSEE pour SIREN

### 2. Bénévoles
- **Table DB**: `benevoles`
- **Flux OTP**: Email → Code 6 chiffres → Profil complet → Login
- **Routes frontend**: `/benevolat/*`
- **Statuts**: `restreint` → `confirmé` (auto-promu à la 1ère présence) → `responsable` (promu par admin)

### Sécurité
- JWT dans cookies HttpOnly (`secure: true`, `sameSite: 'strict'`, expiration 1h)
- Passwords hashés bcrypt (10 rounds)
- Requêtes SQL paramétrées
- OTP expire après 10 min

---

## API Endpoints

Toutes les routes sont préfixées par `/api`. 4 fichiers routes montés dans `server.js`.

### Authentification (`auth.js`)

| Méthode | Endpoint | Fonction |
|---------|----------|----------|
| POST | `/api/backoffice/signin` | Login admin |
| POST | `/api/backoffice/signup` | Inscription admin (multer upload) |
| GET | `/api/backoffice/me` | Info admin courant |
| POST | `/api/logout` | Déconnexion |
| GET | `/api/verify-email/:token` | Vérification email admin |
| POST | `/api/set-password` | Définir mot de passe admin |
| POST | `/api/request-password-reset` | Demande reset mdp admin |
| POST | `/api/reset-password` | Reset mdp admin |
| POST | `/api/resend-verification-link` | Renvoyer lien vérification |
| GET | `/api/sirene/:siren` | Lookup SIREN (INSEE) |
| POST | `/api/backoffice/upload-document-justificatif` | Upload justificatif |
| POST | `/api/benevolat/request-otp` | Demande code OTP bénévole |
| POST | `/api/benevolat/verify-otp` | Vérification code OTP |
| POST | `/api/benevolat/complete-signup` | Inscription complète bénévole |
| POST | `/api/benevolat/signin` | Login bénévole |
| POST | `/api/benevolat/request-password-reset` | Reset mdp bénévole |
| POST | `/api/benevolat/request-password-reset-current-user` | Reset mdp bénévole (authentifié) |
| POST | `/api/benevolat/reset-password` | Reset mdp bénévole avec token |
| GET | `/api/benevolat/verify-email/:token` | Vérification email bénévole |

### Bénévoles & Actions (`benevoles.js`)

| Méthode | Endpoint | Auth | Fonction |
|---------|----------|------|----------|
| GET | `/api/benevolat/actions/:associationName` | JWT | Actions pour calendrier (filtrage genre/âge) |
| POST | `/api/benevolat/inscription` | JWT | Inscription à une action (envoi ICS + emails) |
| DELETE | `/api/benevolat/desinscription/:inscriptionId` | JWT | Désinscription d'une action |
| DELETE | `/api/benevolat/desinscription/:id/future-occurrences` | JWT | Désinscription occurrences futures |
| GET | `/api/benevolat/actions/:actionId/participants` | JWT (responsable) | Liste participants |
| PATCH | `/api/benevolat/actions/participants/:id/statut` | JWT (responsable) | MAJ présence (auto-promotion restreint→confirmé) |
| GET | `/api/benevolat/stats` | JWT | Stats bénévole (inscrit/présent/absent) |
| GET | `/api/benevolat/profile` | JWT | Profil bénévole |
| PATCH | `/api/benevolat/profile` | JWT | MAJ profil bénévole |
| GET | `/api/backoffice/benevoles` | JWT | Liste bénévoles (admin) |
| GET | `/api/backoffice/benevoles/responsables` | JWT | Liste responsables |
| PATCH | `/api/backoffice/benevoles/:email/type` | JWT | Changer type bénévole |
| PATCH | `/api/backoffice/benevoles/:email` | JWT | MAJ complète bénévole (admin) |
| GET | `/api/backoffice/benevoles/:email/actions` | JWT | Historique actions d'un bénévole |
| GET | `/api/backoffice/actions/list` | JWT | Liste toutes les actions |
| POST | `/api/backoffice/actions` | JWT | Créer action (auto-inscription responsable) |
| PUT | `/api/backoffice/actions/:id` | JWT | MAJ action |
| GET | `/api/backoffice/actions/:actionId/participants` | JWT | Participants (vue admin) |
| POST | `/api/backoffice/actions/:actionId/mask` | JWT | Masquer une occurrence |
| DELETE | `/api/backoffice/actions/:actionId/mask` | JWT | Démasquer une occurrence |
| GET | `/api/getInfosAsso` | JWT | Infos association |
| POST | `/api/updateInfosAsso` | JWT | MAJ infos association |
| GET | `/api/benevolat/cron/send-reminders` | - | Cron : rappels J-1 |
| GET | `/api/benevolat/cron/sync-to-sheets` | - | Cron : sync Google Sheets |

### Associations (`assos.js`)

| Méthode | Endpoint | Fonction |
|---------|----------|----------|
| GET | `/api/assos/:uri` | Infos association par URI |
| GET | `/api/assos/config/:asso` | Config association |

### Utilitaires (`database.js`)

| Méthode | Endpoint | Fonction |
|---------|----------|----------|
| GET | `/api/check` | Vérif connexion DB |
| POST | `/api/add-user` | Ajout user (dev/test) |

---

## Base de Données

### Tables actives

| Table | Fonction |
|-------|----------|
| `users` | Comptes admin (id, email, password, firstName, lastName, role, siren, is_verified, verification_token) |
| `Assos` | Détails associations (siren, nom, uri, logoUrl, signataire, adresse, tel, benevoles_resp_email) |
| `onboarding_backoffice` | Statut validation admin (user_id, asso_id, doubleChecked, document_justificatif) |
| `benevoles` | Comptes bénévoles (email, password, nom, prenom, telephone, statut, association_nom, tracking_uuid, metiers_competences) |
| `actions` | Activités bénévoles (association_nom, nom, description, ville, date_action, heure_debut/fin, recurrence, responsable_email, nb_participants, genre, age) |
| `Benevoles_Actions` | Inscriptions (benevole_id, action_id, date_action, statut, presence, relance_email) |
| `Actions_Masquees` | Occurrences masquées par l'admin (action_id, date_masquee, masquee_par) |

### Tables obsolètes (plus référencées dans le code)
`Commandes`, `Quotas2`, `Menus`, `qrcode_cards`, `meal_pickups`

---

## Frontend - Pages et Routes

### App Routes (`app-routing.module.ts`)
- `/` → Layout → redirige vers `/backoffice`
- `/benevolat/*` → Module bénévole
- `/backoffice-auth/*` → Auth admin
- `/errors/*` → Pages erreur
- `**` → 404

### Backoffice (`/backoffice/`) - Guard: `BackofficeAuthGuard`
- `/backoffice/benevolat/benevoles` — Liste bénévoles (défaut)
- `/backoffice/benevolat/actions` — Créer une action
- `/backoffice/benevolat/actions-list` — Liste des actions
- `/backoffice/benevolat/calendar` — Calendrier
- `/backoffice/benevolat/attestations` — Attestations de bénévolat
- `/backoffice/infos` — Infos association
- `/backoffice/parametres` — Paramètres

### Espace Bénévole (`/benevolat/`)
- `/benevolat/` — Landing page
- `/benevolat/form/:id`, `/benevolat/signup/:id` — Étape email (OTP)
- `/benevolat/otp-verification` — Vérification code OTP
- `/benevolat/complete-signup` — Inscription complète
- `/benevolat/signin`, `/benevolat/signin/:asso` — Login
- `/benevolat/forgot-password` — Mot de passe oublié
- `/benevolat/new-password/token/:token` — Nouveau mot de passe
- `/benevolat/verify-email/token/:token` — Vérification email
- `/benevolat/dashboard/actions` — Calendrier + inscription actions
- `/benevolat/dashboard/profile` — Profil

### Backoffice Auth (`/backoffice-auth/`)
- `/backoffice-auth/sign-in` — Login admin
- `/backoffice-auth/sign-up` — Inscription admin (SIREN + upload)

---

## Services Backend

| Service | Fichier | Fonction |
|---------|---------|----------|
| Database | `bdd.js` | Abstraction MySQL, dual pool (local + remote), requêtes paramétrées |
| Mail | `mailService.js` | Envoi emails Mailjet avec templates et pièces jointes (ICS) |
| Google Sheets | `googleSheetsService.js` | Sync roster bénévoles avec Google Sheets |
| ICS | `icsService.js` | Génération fichiers iCalendar pour actions |
| INSEE | `inseeService.js` | Validation SIREN/SIRET via API Sirene V3.11 |

---

## Déploiement

### Docker Compose (8 services)

1. **MySQL** : Port 3306
2. **Nginx** : Ports 80/443, reverse proxy, SSL statique
3. **Node.js** : Port 4242, backend API
4. **Angular** : Build-only container
5. **phpMyAdmin** : Port 8080
6. **Loki** : Port 3100, agrégation logs
7. **Promtail** : Shipping logs vers Loki
8. **Grafana** : Port 3001, dashboards

### SSL
- Certificat wildcard `*.acdlp.com` monté en `./ssl:/etc/ssl/acdlp:ro`
- TLS 1.2/1.3, ciphers AEAD modernes
- Plus de Certbot/Let's Encrypt

### Nginx Routes
- `/app/*` → Angular SPA
- `/api/*` → Node.js (port 4242)
- `/assets/*` → Assets statiques
- `/grafana/*` → Grafana
- `/phpmyadmin/*` → phpMyAdmin
- Mode maintenance avec whitelist IP

### Environnements
- **Dev**: `environment.ts` (localhost:4242)
- **Staging**: `environment.staging.ts` (dev.acdlp.com)
- **Production**: `environment.prod.ts` (acdlp.com)

---

## Variables Environnement

```bash
URL_ORIGIN=https://acdlp.fr
LOCAL_DB_HOST=acdlp-mysql
LOCAL_DB_USER=***
LOCAL_DB_PASSWORD=***
LOCAL_DB_NAME=acdlp
JWT_SECRET=***
MAILJET_KEY_ACDLP=***
MAILJET_SECRET_ACDLP=***
GOOGLE_SHEET_ID=***
GOOGLE_CREDENTIALS_PATH=./credentials/***
GITHUB_CLIENT_ID=***
GITHUB_CLIENT_SECRET=***
SIRENE_API_KEY=***
```

---

## Conventions de Code

- **Frontend**: Standalone components Angular 18, TypeScript strict, Reactive Forms
- **Backend**: Express.js avec pattern route/service séparé
- **DB**: Requêtes paramétrées, snake_case pour colonnes
- **JS/TS**: camelCase
- **Auth**: JWT dans cookies HttpOnly
- **État**: Services RxJS avec BehaviorSubjects
- **Logs**: Winston avec rotation quotidienne, JSON format

### Fichiers sensibles (gitignored)
- `.env`, `ssl/`, `credentials/`

---

## Notes pour Claude AI

### Modifications code
1. Toujours lire le fichier avant de modifier
2. Respecter les patterns existants
3. Vérifier la sécurité (XSS, SQL injection)
4. Ne pas over-engineer
5. Pas de breaking changes sans confirmation

### Debug
1. Vérifier les logs (`/var/log/acdlp/` ou Grafana)
2. Tester l'auth (JWT, cookies, rôles)
3. Vérifier la DB (tables, données)

### Ajout features
1. Analyser l'impact (DB, API, Angular)
2. Ajouter validation (frontend + backend)
3. Tester avec les 2 rôles (admin, bénévole)
