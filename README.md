# Prono CDM

MVP web gratuit pour organiser une ligue privée de pronostics entre amis sur la Coupe du monde 2026.

## Stack

- Frontend : React + Vite
- Hosting frontend : Cloudflare Pages
- API : Cloudflare Worker
- Base : Cloudflare D1
- Source matchs/scores : football-data.org, appelée uniquement par le Worker

Le frontend ne contacte jamais football-data.org. Les matchs et scores sont synchronisés en D1 puis exposés via `/api/*`.

## Fonctionnalités

- Inscription/connexion avec pseudo et PIN hashé
- Session via cookie HTTP-only
- Une ligue privée unique
- Pronostics de score exact
- Verrouillage serveur dès l'heure de coup d'envoi
- Synchro football-data.org via Cron Trigger Cloudflare
- Classements général, groupes et élimination directe
- Résultats, points gagnés et feed d'activité

## Barème

Groupes :

- Score exact : 5 points
- Bon résultat : 3 points
- Bon résultat + bon écart de buts : 4 points
- Mauvais résultat : 0 point

Élimination directe :

- Score exact : 10 points
- Bon résultat : 6 points
- Bon résultat + bon écart de buts : 8 points
- Mauvais résultat : 0 point

Pour les matchs à élimination directe, le bon résultat utilise `score.winner` de football-data.org quand cette donnée existe. Si elle manque, l'app retombe sur le résultat déduit du score final disponible. Quand un utilisateur pronostique un nul en élimination directe, l'UI demande aussi l'équipe qualifiée.

Le plan gratuit football-data.org peut avoir des scores différés : l'app affiche les dernières données connues et ne promet pas de live score instantané.

## Installation locale

```bash
npm install
cp .dev.vars.example .dev.vars
```

Renseigner `FOOTBALL_DATA_TOKEN` dans `.dev.vars`.

Créer la base D1 locale et appliquer les migrations :

```bash
npx wrangler d1 create prono-cdm
npm run d1:migrate:local
```

Lancer l'API Worker :

```bash
npm run dev:api
```

Dans un autre terminal, lancer Vite :

```bash
npm run dev
```

Vite proxifie `/api` vers `http://127.0.0.1:8787`.

Déclencher une synchronisation manuelle en local après connexion :

```bash
curl -X POST http://127.0.0.1:8787/api/admin/sync
```

## Configuration Cloudflare

Créer la base D1 :

```bash
npx wrangler d1 create prono-cdm
```

Copier le `database_id` retourné dans `wrangler.toml`, puis appliquer les migrations :

```bash
npm run d1:migrate:remote
```

Configurer les secrets Worker :

```bash
npx wrangler secret put FOOTBALL_DATA_TOKEN
```

Variables Worker utiles :

- `FOOTBALL_DATA_COMPETITION=WC`
- `FOOTBALL_DATA_SEASON=2026`
- `FRONTEND_ORIGIN=https://ton-site.pages.dev`
- `COOKIE_SAMESITE=None` si frontend Pages et API Worker sont sur deux domaines différents

Le Cron est déclaré dans `wrangler.toml` :

```toml
[triggers]
crons = ["*/30 * * * *"]
```

## Déploiement API Worker

```bash
npm run deploy:api
```

## Déploiement Cloudflare Pages

Créer un projet Pages connecté au repo GitHub.

Configuration Pages :

- Build command : `npm run build`
- Build output directory : `dist`
- Variable frontend : `VITE_API_BASE_URL=https://ton-worker.workers.dev`

Si le frontend et l'API sont servis sous le même domaine, `VITE_API_BASE_URL` peut rester vide et les cookies `SameSite=Lax` suffisent.

## Tests

```bash
npm test
npm run build
```

Les tests couvrent le calcul des points, y compris les matchs à élimination directe avec vainqueur qualifié.
