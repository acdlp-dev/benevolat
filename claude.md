# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vue d'ensemble

**ACDLP Bénévolat** est l'espace bénévole de l'association *Au Coeur de la Précarité* : inscription par OTP email, calendrier d'actions, inscription/désinscription, profil. Un seul type d'utilisateur applicatif : le **bénévole**.

Le backoffice admin a été externalisé vers le projet **boAcdlp** (séparé). Les modules historiques *cantine*, *QR code* et *suivi véhicule* ont été supprimés — le `README.md` à la racine est obsolète et décrit encore ces modules : ne pas s'y fier pour ce repo.

## Stack

- **Frontend** : Angular 18.1 (standalone components + NgModules dans `modules/`), TypeScript 5.4, Tailwind 3.1, ngx-sonner, Lucide, FontAwesome, ApexCharts
- **Backend** : Node.js 20, Express 4.18, mysql2 (connection pooling), JWT cookies HttpOnly, bcryptjs, Mailjet, googleapis, Winston (rotation quotidienne)
- **Infra** : Docker Compose (8 services), Nginx reverse proxy, MySQL 8.0, Grafana 10 + Loki 2.9 + Promtail

## Commandes

### Docker (toute la stack)

```bash
# Dev (Node 22, Angular en mode `ng serve`)
docker-compose -f docker-compose.dev.yml up --build

# Staging
docker-compose -f docker-compose.staging.yml up --build

# Production (Node 20, Angular build prod servi par Nginx)
docker-compose up --build

# Logs ciblés
docker-compose logs -f node
docker-compose logs -f nginx
```

### Frontend Angular (`src/www/acdlp/client/acdlp-angular/`)

```bash
npm start                 # ng serve --open (dev, port 4200)
npm run build             # build dev
npm run prod              # build production
npm run staging           # build staging
npm run watch             # build dev en watch
npm test                  # Karma + Jasmine
npm run test:e2e          # Playwright (mode UI)
npm run lint              # ng lint
npm run prettier          # formate src/{app,environments}
npm run prettier:verify   # check formatting
```

Tests unitaires ciblés : `npx ng test --include='**/mon-fichier.spec.ts'`.

### Backend Node (`src/www/acdlp/server/node/`)

```bash
npm start                 # node server.js (port 4242)
```

Pas de framework de tests configuré côté backend (script `test` est un placeholder). Le `.env` est monté sur `/usr/src/app/.env` dans le conteneur — c'est ce chemin que `server.js` charge via `dotenv` (line 3, hardcodé).

## Architecture

### Layout général

```
src/www/acdlp/
├── client/acdlp-angular/   # Frontend Angular 18
└── server/node/            # Backend Express
nginx/                      # 3 confs : nginx.conf (prod), nginx.staging.conf, nginx.dev.conf
mysql/init-db.sql           # Init DB locale
docs/                       # Docs détaillées (NODE-BACKEND.md, ANGULAR.md, ESPACE-BENEVOLE.md, etc.)
```

### Backend — point d'entrée et routes

`server.js` charge 4 fichiers de routes, tous montés sur `/api` :

| Fichier | Préfixe effectif | Auth | Contenu |
|---|---|---|---|
| `routes/auth.js` | `/api/*` | mixte | OTP, signin, logout, password reset, verify-email, exporte aussi `authMiddleware` |
| `routes/benevoles.js` | `/api/*` | JWT (sauf crons) | actions, inscription, désinscription, participants, stats, profile, crons |
| `routes/assos.js` | `/api/assos/*` | aucune | lookup association par URI / config |
| `routes/database.js` | `/api/*` | aucune | `/check`, `/add-user` (utilitaires dev) |

**Important** : les routes ne sont **pas** sous-préfixées par `/benevolat/`. Exemples réels : `POST /api/signin`, `POST /api/request-otp`, `GET /api/actions`, `POST /api/inscription`, `GET /api/cron/send-reminders`, `GET /health`.

`authMiddleware` lit le JWT depuis le cookie `auth_token` et expose `req.user` (au moins `id`, `email`). Défini dans `routes/auth.js:52`.

### Backend — services

| Service | Rôle |
|---|---|
| `services/bdd.js` | Abstraction MySQL avec **dual pool** : `local` et `remote`. Tous les helpers (`select`, `insert`, `update`, `remove`, `query`) prennent un `dbType` qui défaut à `'remote'`. Variables d'env : `LOCAL_DB_*` et `REMOTE_DB_*`. Masque automatiquement `password`, `*secret*`, clés Stripe. |
| `services/mailService.js` | `sendTemplateEmail(email, templateId, vars, subject)` via Mailjet. |
| `services/googleSheetsService.js` | Sync roster bénévoles (Service Account, déclenché par cron). |
| `services/icsService.js` | Génère fichiers iCalendar joints aux confirmations d'inscription. |

### Frontend — routing

`app-routing.module.ts` charge **directement** le module `benevolat` à la racine (lazy) :

```
''                              → BenevolatModule
'errors'                        → ErrorModule
'components'                    → UikitModule (showroom)
'**'                            → redirige vers errors/404
```

Routes du `BenevolatModule` (`benevolat-routing.module.ts`) :

```
''                              BenevolatComponent (landing)
'signup'                        VolunteerEmailStepComponent (étape email OTP)
'otp-verification'              VolunteerOtpVerificationComponent
'complete-signup'               VolunteerCompleteSignupComponent
'verify-email/token/:token'     VolunteerVerifyComponent
'signin'                        VolunteerSigninComponent
'forgot-password'               VolunteerForgotPasswordComponent
'new-password/token/:token'     VolunteerNewPasswordComponent
'dashboard/actions'             VolunteerActionsComponent (calendrier)
'dashboard/profile'             VolunteerProfileComponent
```

Servi par Nginx sous `/app/` (build avec `--base-href=/app/`). Nginx redirige `/` → `/app/signin`. Les vraies URLs publiques sont donc `https://benevolat.acdlp.com/app/signin`, etc.

### Frontend — organisation de `src/app/`

- `core/` : `services/`, `interceptor/`, `models/`, `constants/`, `utils/`, `guards/` (vide actuellement)
- `shared/` : `components/`, `directives/`, `pipes/`, `services/`, `validators/`, `models/`, `modules/`, `testing/`, `utils/`
- `modules/benevolat/` : `pages/volunteer-*/`, `services/{action,volunteer}.service.ts`, `models/`
- `modules/{error,layout,uikit}/` : pages d'erreur, layout (navbar/footer), showroom UI

`environments/environment.ts` (dev) pointe `apiUrl: http://localhost:4242/api`. Variantes `.staging.ts` et `.prod.ts`.

### Authentification — flux et états

1. `request-otp` → email + code 6 chiffres (expire 10 min). Si compte déjà vérifié, renvoie un email "compte existant" avec lien reset au lieu d'un OTP — protection contre l'énumération.
2. `verify-otp` → marque `is_verified`.
3. `complete-signup` → mot de passe + profil → JWT (1h) en cookie HttpOnly `auth_token` (`secure`, `sameSite: strict`).
4. `signin`, `request-password-reset`, `reset-password` (token 32 octets hex, expire 1h).

**Statuts bénévole** (`benevoles_users.statut`) :
- `restreint` : par défaut à l'inscription
- `confirmé` : auto-promu à la première présence validée par un responsable
- `responsable` : promu manuellement par le backoffice externe (boAcdlp)

### Base de données

Tables utilisées par ce projet :

| Table | Rôle |
|---|---|
| `benevoles_users` | Comptes bénévoles. Colonnes clés : `email`, `password`, `nom`, `prenom`, `telephone`, `genre`, `age`, `statut`, `association_nom`, `tracking_uuid`, `metiers_competences`, `is_verified`, `otp_code`, `otp_expiry`, `reset_token`, `reset_token_expiry` |
| `actions` | Actions de bénévolat. Filtrage par `genre` (`mixte`/`homme`/`femme`) et `age` (`tous`/`majeure`/`mineur`). `recurrence` permet des actions récurrentes (instances calculées côté frontend). `statut = 'inactif'` masque l'action. |
| `Benevoles_Actions` | Inscriptions. `(benevole_id, action_id, date_action)` pour gérer les occurrences. Champs `presence`, `statut`, `relance_email`. |
| `Actions_Masquees` | Occurrences masquées (`action_id`, `date_masquee`) — masquage côté frontend. |
| `Assos` | Lecture seule (gérées par boAcdlp). |

Tables gérées par boAcdlp (ne pas modifier ici) : `users`, `onboarding_backoffice`.

Conventions : colonnes en `snake_case`, code JS/TS en `camelCase`, requêtes **toujours paramétrées** (`?` placeholders, jamais d'interpolation).

### Logging

Winston dans `config/logger.js` :
- `defaultMeta.service = 'acdlp-api'` (utilisé pour les requêtes Loki : `{service="acdlp-api"}`)
- Fichiers dans `/var/log/acdlp/` (volume Docker `logs-data`) : `application-YYYY-MM-DD.log`, `error-*.log`, `exceptions-*.log`, `rejections-*.log`
- Rotation : 20 MB max, 30 jours
- Console activée hors production
- Helpers : `logger.logRequest(req, statusCode, ms)` et `logger.logError(err, ctx)`

Promtail ship → Loki → Grafana (dashboards dans `grafana/provisioning/`). Plus de détails dans `docs/LOGGING-MONITORING.md` et `LOGGING-QUICKSTART.md`.

### Crons

Endpoints HTTP (à déclencher par un cron externe) :
- `GET /api/cron/send-reminders` : rappel J-1 par email aux inscrits
- `GET /api/cron/sync-to-sheets` : sync roster bénévoles → Google Sheets

Ces routes ne sont **pas** protégées par `authMiddleware` — vérifier le filtrage IP côté Nginx avant d'ajouter de nouveaux crons.

## Variables d'environnement

`.env` à la racine, monté en `/usr/src/app/.env` dans le conteneur Node (chemin **hardcodé** dans `server.js:3`).

```bash
URL_ORIGIN=https://benevolat.acdlp.com   # utilisé dans les emails (liens reset, verify)

# DB locale (conteneur mysql)
LOCAL_DB_HOST=acdlp-mysql
LOCAL_DB_PORT=3306
LOCAL_DB_USER=...
LOCAL_DB_PASSWORD=...
LOCAL_DB_NAME=acdlp
LOCAL_DB_ROOT_PASSWORD=...

# DB distante (utilisée par défaut par bdd.js — dbType='remote')
REMOTE_DB_HOST=...
REMOTE_DB_USER=...
REMOTE_DB_PASSWORD=...
REMOTE_DB_NAME=...

JWT_SECRET=...
MAILJET_KEY_ACDLP=...
MAILJET_SECRET_ACDLP=...
GOOGLE_SHEET_ID=...
GOOGLE_CREDENTIALS_PATH=./credentials/...   # gitignored
GITHUB_CLIENT_ID=...                        # OAuth Grafana
GITHUB_CLIENT_SECRET=...
```

Gitignored : `.env`, `ssl/`, `src/www/acdlp/server/node/credentials/`.

## Conventions et pièges

- **Toujours** utiliser les helpers de `services/bdd.js` plutôt que `db.execute` direct → garantit le pool correct et le masquage des secrets en log.
- Le pool par défaut est `'remote'`. Préciser `'local'` explicitement quand nécessaire.
- CORS dans `server.js:37` est **hardcodé** sur `http://localhost:4200` — à changer si on sert le front depuis un autre origin en dev.
- Templates Mailjet référencés par ID numérique (ex. `7796174` pour "compte existant") — voir `docs/ESPACE-BENEVOLE.md` pour la liste.
- Récurrence d'actions : les **instances** des actions récurrentes sont calculées **côté frontend** à partir de la date de base + règle de récurrence. `Actions_Masquees` permet de masquer une occurrence individuelle.
- Auto-promotion `restreint` → `confirmé` : déclenchée dans `PATCH /api/actions/participants/:id/statut` quand un responsable valide une présence.
- Le fichier racine `claude.md` (minuscule) est une ancienne note non maintenue — utiliser uniquement `CLAUDE.md`.

## Documentation détaillée

Le dossier `docs/` contient des références approfondies :
- `NODE-BACKEND.md` — détail des routes/services
- `ANGULAR.md` — architecture frontend
- `ESPACE-BENEVOLE.md` — flows métier et templates email
- `LOGGING-MONITORING.md`, `GRAFANA-DASHBOARDS.md`, `GRAFANA-NGINX-SETUP.md`, `GRAFANA-GITHUB-OAUTH.md` — observabilité
- `BACKOFFICE.md` — décrit le backoffice externe (boAcdlp), informatif

Les README de `BACKOFFICE.md`/`README.md` peuvent mentionner cantine/véhicule/QR : ces modules **n'existent plus** dans ce repo.
