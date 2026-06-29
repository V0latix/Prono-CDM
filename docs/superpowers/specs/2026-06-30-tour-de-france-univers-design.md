# Design — Univers Tour de France dans Prono CDM

Date : 2026-06-30
Statut : validé en brainstorming, prêt pour plan d'implémentation

## Objectif

Ajouter un second univers de pronostics **Tour de France** dans l'app existante (Prono CDM),
dans le même repo et la même app, séparé de la Coupe du monde par un sélecteur d'univers.
On réutilise tout le socle (auth, sessions, profils, groupes, email) et on ne duplique que la
mécanique de prono propre au cyclisme.

Un univers = `cdm` (existant) ou `tdf` (nouveau).

## Constat sur la donnée (contrainte structurante)

Aucune API gratuite propre n'existe pour le cyclisme (sportbex, Enetpulse, DataSportsGroup,
Sportradar sont toutes payantes). La source gratuite de référence est **ProCyclingStats (PCS)**,
sans API JSON : c'est du scraping HTML. PCS renvoie des 403/429 aux clients génériques, et la
lib mature (`procyclingstats`, Python) ne peut pas tourner dans un Cloudflare Worker.

Conséquence : **le Worker ne scrape jamais**. Le scraping vit dans un job séparé
(GitHub Action + Python) qui POST les résultats vers une route admin du Worker. La saisie
manuelle est le filet de secours, via le même chemin de code.

## Section 1 — Architecture & séparation des univers

- **Sélecteur d'univers** en haut de l'app (`⚽ Coupe du monde` / `🚴 Tour de France`),
  mémorisé en `localStorage`. Rejoue la même navigation (Dashboard, Mes pronos, Classement,
  Résultats, Règlement, Profil) branchée sur l'univers actif.
- **Routes Worker** : nouveau préfixe `/api/tdf/*` reflétant l'existant
  (`/api/tdf/dashboard`, `/api/tdf/predictions/:stage`, `/api/tdf/leaderboard`,
  `/api/tdf/results`, `/api/tdf/riders`, `/api/tdf/stages`). Les routes `/api/*`
  actuelles ne changent pas.
- **Groupes partagés, classements séparés** : un même groupe a deux classements (un CDM, un TDF).
  On réutilise `group_members` ; on calcule les points TDF à part. Le filtre par groupe marche
  pareil dans les deux univers.
- **Profil commun** : pseudo / photo / PIN partagés. Badges TDF reportés (pas en V1).
- **Front** : la mécanique TDF part dans un module dédié `src/tdf/` monté quand l'univers actif
  est `tdf`. `App.tsx` ne gère que le switch d'univers + le socle commun (il est déjà gros, on
  ne l'empile pas davantage).

## Section 2 — Modèle de données (migration `0012_tdf.sql`)

Tables préfixées `tdf_`, reste du schéma intact.

- **`tdf_riders`** — peloton. `id` (slug PCS stable), `name`, `team`, `nationality`,
  `is_young` (éligible maillot blanc), `status` (`active`/`abandoned`). Rempli par l'Action
  depuis la startlist PCS. Liste où le joueur pioche ses coureurs.
- **`tdf_stages`** — `stage_no`, `date`, `lock_at` (défaut `date` à 13h00, éditable),
  `type` (`flat`/`mountain`/`itt`/`ttt`), `label` (Ville → Ville), `status`
  (`upcoming`/`finished`), `combative_rider_id` (résultat). Rempli par l'Action depuis le
  parcours PCS.
- **`tdf_stage_results`** — `stage_no`, `rider_id`, `rank` (1..10 suffit pour le scoring).
  Le combatif est porté par la ligne `tdf_stages`.
- **`tdf_stage_predictions`** — `user_id`, `stage_no`, `rider_ids` (les 10 picks en **JSON
  texte**, taille fixe, pas de table de jointure), `combative_rider_id`, `points`.
- **`tdf_grand_depart_predictions`** — `user_id` + `yellow1/2/3`, `white1/2/3`, `green`,
  `polka`, `points`. Une ligne par joueur.
- **`tdf_grand_depart_results`** — résultats finaux (podiums jaune & blanc, vainqueurs vert &
  pois), ligne unique remplie en fin de Tour.

**Classement TDF** = somme des `points` d'étape + `points` grand départ par joueur, recalculé à
chaque arrivée de résultat (pattern `recalculateAllPoints` du foot).

## Section 3 — Pipeline auto (GitHub Action + route admin)

Le Worker ne scrape jamais.

- **`.github/workflows/tdf-sync.yml`** — cron planifié (~toutes les 30 min en juillet). Lance un
  script Python utilisant `procyclingstats`.
- **Le script** récupère sur PCS : startlist (une fois), parcours/étapes (une fois), puis après
  chaque étape le **top 10 + combatif + classements** (général, jeunes, vert, pois). Il POST
  vers les routes admin.
- **Routes admin Worker** (protégées par un secret `TDF_SYNC_SECRET` en header, pas le PIN) :
  - `POST /api/admin/tdf/roster` — upsert peloton + étapes.
  - `POST /api/admin/tdf/stage-result` — top 10 + combatif d'une étape → déclenche le recalcul.
  - `POST /api/admin/tdf/final` — résultats grand départ en fin de Tour.
- **Filet manuel = mêmes routes**, exposées dans un petit écran admin front (réservé à l'admin).
  PCS casse ou se trompe → saisie/correction à la main, même chemin de code.
- **Idempotent** : ré-envoyer un résultat écrase proprement et recalcule. Protection
  anti-effacement façon foot : un résultat réel n'est jamais remplacé par du vide.

## Section 4 — Scoring

Module pur `src/shared/tdf-scoring.ts`, testable isolément, à côté de `src/shared/scoring.ts`.

### Prono d'étape

- Le joueur soumet **10 coureurs non ordonnés** + **1 coureur pour la combativité**.
- `scoreStage(picks, combativePick, result)` :
  - pour chaque coureur des 10 picks présent dans le top 10 réel : `+ (11 − rang_réel)`
    (finit 10ᵉ → 10 pts, 9ᵉ → 9 … 1ᵉʳ → 1) ;
  - combatif juste : `+10`.
  - Max théorique : 10+9+…+1 + 10 = **65**.

### Prono grand départ (figé au départ de l'étape 1)

`scoreGrandDepart(prediction, results)` :

| Prix | Pronostic | Place exacte | Bon coureur, mauvaise place |
|---|---|---|---|
| 🟡 Jaune | Podium (top 3 général) | 80 / 40 / 20 | 40 / 20 / 10 |
| ⚪ Blanc (jeune) | Podium (top 3 jeunes) | 40 / 20 / 10 | 20 / 10 / 5 |
| 🟢 Vert | Vainqueur | 40 | — |
| 🔴 Pois | Vainqueur | 40 | — |

Les points du podium dépendent de la **place réelle** du coureur :
- place exacte (coureur à la place qu'il finit) → plein tarif de cette place ;
- bon coureur, mauvaise place (sur le podium mais ailleurs que prévu) → moitié du tarif de sa
  place réelle.

Exemples : Pogačar pronostiqué 1ᵉʳ finit 2ᵉ → moitié de la 2ᵉ place = **20**. Seixas pronostiqué
3ᵉ finit 1ᵉʳ → moitié de la 1ᵉʳ place = **40**.

### Réutilisation & validation

- Front et Worker (`worker/src/tdf-scoring-db.ts`) partagent `tdf-scoring.ts`. Le front affiche
  le détail des points, le Worker recalcule et stocke après chaque résultat.
- **Validation serveur** (jamais que côté UI) :
  - prono d'étape : exactement 10 coureurs distincts du peloton actif, combatif = 1 coureur,
    refusé après `lock_at` ;
  - grand départ : 3 coureurs distincts par podium, refusé après le départ de l'étape 1 ;
  - coureurs inconnus / doublons rejetés.

## Section 5 — Tests & ordre de construction

### Tests

- `src/shared/tdf-scoring.test.ts` — barème étape (inverse + combatif) et grand départ
  (4 prix, place exacte vs moitié, cas Pogačar/Seixas).
- `worker/src/tdf-routes.test.ts` — validation pronos (10 distincts, verrou `lock_at`, coureur
  inconnu), routes admin (secret requis).
- `worker/src/tdf-scoring-db.test.ts` — recalcul, idempotence, anti-effacement.
- `src/tdf/` — un test de parcours UI (sélecteur d'univers, saisie d'un prono d'étape).

### Ordre de construction (testé + buildé à chaque étape)

1. Migration `0012_tdf.sql` + types.
2. `tdf-scoring.ts` + tests (cœur pur, zéro dépendance).
3. Routes Worker `/api/tdf/*` + admin + validation + recalcul.
4. Front : sélecteur d'univers + module `src/tdf/` (dashboard, mes pronos, classement,
   résultats, règlement).
5. Écran admin manuel (saisie/correction résultat d'étape).
6. GitHub Action + script Python `procyclingstats`.
7. Migration distante + déploiement API + preview.

### V1 volontairement sans (YAGNI)

Badges TDF, notifications email TDF, courbe de progression TDF, visus d'arbre. On réutilise le
socle, on n'enrichit pas tout de suite.

## Décisions figées

- Comptes/profils/groupes partagés ; pronos, classements, résultats, règlement séparés par univers.
- Auto (GitHub Action + PCS) en primaire dès la V1, saisie manuelle comme filet de secours
  (même chemin de code).
- Verrou prono d'étape : 13h00 par défaut, éditable par étape. Grand départ : départ de l'étape 1.
- Barème figé (section 4).
