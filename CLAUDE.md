# Guide Claude Code - Prono CDM

Ce fichier explique l'architecture de l'application et les regles a respecter quand un agent modifie le projet.

## Vue d'ensemble

Prono CDM est une app web de pronostics entre amis pour la Coupe du monde 2026.

Stack :

- Frontend : React + Vite, dans `src/`
- API : Cloudflare Worker, dans `worker/src/`
- Base : Cloudflare D1, migrations dans `migrations/`
- Scores/matchs : football-data.org, appele uniquement par le Worker
- Production frontend actuelle : Vercel
- API production : `https://prono-cdm-api.volatix-prono-cdm.workers.dev`

Le frontend ne doit jamais appeler football-data.org directement. Il lit uniquement notre API interne `/api/*`.

## Dossiers importants

- `src/App.tsx` : application React principale, vues, profils, groupes, pronos, dashboard.
- `src/api.ts` : client API frontend, base URL, fallback de session preview.
- `src/shared/scoring.ts` : calcul pur des points, partageable frontend/Worker.
- `src/shared/week.ts` : bornes de la semaine pour le classement hebdomadaire.
- `src/shared/standings.ts` : calcul pur du classement des poules (onglet Resultats), a partir des matchs termines.
- `src/shared/bracket.ts` : regroupement pur des matchs de phase finale par tour (vue Resultats > phase finale), utilise par `src/App.tsx`. La source ne fournit pas la filiation : l'arbre dessine par `BracketView` deduit les appariements positionnellement (indicatif). Voir la note plus bas.
- `src/shared/league-predictions.ts` : agregation pure des scores les plus pronostiques par la ligue ("Pronos ligue" dans Resultats / profil).
- `src/shared/progression.ts` : serie pure de la courbe de progression du classement (vue stats).
- `src/shared/tv-broadcast.ts` : diffuseur(s) TV francais d'un match, mapping cure en code par id football-data (defaut beIN SPORTS, M6 pour le clair). Consomme cote Worker (`routes.ts`).
- `src/shared/venues.ts` : stade de chaque match, mapping cure en code par id football-data. Consomme cote Worker (`routes.ts`).
- `src/styles.css` : design system global, themes, responsive.
- `worker/src/index.ts` : entree Worker, CORS, session, cron.
- `worker/src/routes.ts` : routes API, auth, profils, groupes, pronos, classements.
- `worker/src/auth.ts` : PIN, sessions, cookies, protection brute force.
- `worker/src/football-data.ts` : synchronisation football-data.org vers D1.
- `worker/src/scoring-db.ts` : recalcul des points et feed d'activite apres synchro.
- `worker/src/badges.ts` : calcul des badges de profil.
- `worker/src/invites.ts` : codes d'invitation de groupe et throttle de synchro.
- `worker/src/leaderboard-window.ts` : normalisation de la fenetre de dates du classement hebdo.
- `worker/src/monitoring.ts` : compteur best-effort des erreurs Worker (`recordWorkerError` / `getWorkerErrorStatus`), expose via `/api/sync/status`.
- `worker/src/prediction-session.ts` : selection de la "session" de matchs a pronostiquer (regroupe soiree + nuit).
- `worker/src/email.ts` : envoi email transactionnel via Brevo.
- `worker/src/notifications.ts` : rappels "fais tes pronos" 24h avant kickoff.
- `worker/src/types.ts` : type `Env` (bindings, secrets).
- `migrations/*.sql` : schema D1 versionne.
- `vercel.json` : rewrites historiques `/api`, mais les previews Vercel utilisent aussi l'API Worker directe.

## Flux frontend

`src/App.tsx` garde l'etat principal :

- charge `/api/me` au demarrage ;
- affiche `AuthScreen` si aucun user ;
- affiche `ProfileSetup` juste apres une inscription ;
- affiche ensuite le shell principal avec navigation :
  - Dashboard
  - Mes pronos
  - Classement
  - Resultats
  - Reglement
  - Profil
  - Profil public joueur

Les donnees sont chargees avec `useResource`, qui appelle `api()` depuis `src/api.ts`.

Points d'attention :

- Le bouton pseudo ouvre le profil utilisateur.
- La bulle `Nouveautes` lit la constante `releaseNotes` dans `src/App.tsx`.
- Les release notes doivent rester orientees utilisateur. Ne pas y mettre de details techniques de deploy, Worker, preview, migration ou API.
- Les themes disponibles sont `classic`, `dark`, `minuit`, `ardoise`, `grass`, `neon`, `france`.
- Les themes `ardoise`, `grass`, `neon` et `france` utilisent `Inter` pour une meilleure lisibilite.
- La carte "Predictions a faire maintenant" du dashboard n'affiche PAS un jour
  calendaire : elle regroupe une "session" de matchs consecutifs (coups d'envoi
  espaces de moins de 9h, voir `worker/src/prediction-session.ts`). Sinon les
  matchs de nuit (apres minuit UTC) d'une meme soiree CDM seraient exclus.

## Client API et sessions

Le client API est dans `src/api.ts`.

Comportement :

- En local, `/api` est proxifie par Vite vers Wrangler (`http://127.0.0.1:8787`).
- En production/preview Vercel (`*.vercel.app`), le client appelle directement le Worker public si `VITE_API_BASE_URL` n'est pas configure.
- Les requetes envoient toujours `credentials: "include"`.
- Pour les previews cross-domain, un fallback de session `Authorization: Bearer <token>` existe car certains navigateurs ne renvoient pas toujours le cookie cross-site au Worker.

Important :

- `setApiSessionToken()` ne doit etre appele qu'apres login/register/logout (et est purge automatiquement sur un 401 hors routes `/api/auth/*`).
- Le cookie HTTP-only reste le mecanisme principal quand le navigateur l'accepte.
- Le bearer token est un fallback cross-domain (prod incluse), stocke en `localStorage` pour survivre a la fermeture du navigateur. Indispensable sur les navigateurs qui bloquent les cookies tiers (Safari/iOS, Firefox, Chrome recent), ou le cookie cross-site n'arrive jamais au Worker.
- Sur un 401 d'une route authentifiee, `api()` purge le token et emet l'event `SESSION_EXPIRED_EVENT` ; `App` y reagit en renvoyant vers l'ecran de connexion (evite un "Reessayer" sans issue).
- Si l'auth preview casse, verifier d'abord :
  - `src/api.ts`
  - `worker/src/auth.ts`
  - les headers CORS dans `worker/src/http.ts`
  - que le Worker deploye accepte `authorization`

CORS : `worker/src/http.ts` ne reflete jamais une origine arbitraire. `isAllowedOrigin()` autorise uniquement les origines de `FRONTEND_ORIGIN` (liste separee par virgules), le dev local et les sous-domaines `*.vercel.app` en https. Si tu ajoutes un domaine de prod custom, ajoute-le a `FRONTEND_ORIGIN`.

## API Worker

L'entree est `worker/src/index.ts` :

- gere les preflight `OPTIONS` avec `corsHeaders()`;
- ignore les routes hors `/api/`;
- charge `ctx.user` via `getUserFromSession()`;
- route via `route(ctx)`;
- cron `scheduled()` lance `syncFootballData(env)`.

Routes principales dans `worker/src/routes.ts` :

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/profile`
- `PUT /api/profile`
- `POST /api/profile/pin` (changement de PIN, exige le PIN actuel)
- `GET /api/notifications`
- `PUT /api/notifications`
- `POST /api/notifications/verify`
- `POST /api/notifications/unsubscribe`
- `GET /api/users/:id/profile`
- `GET /api/groups`
- `POST /api/groups`
- `POST /api/groups/join-by-code`
- `POST /api/groups/:id/join`
- `POST /api/groups/:id/leave`
- `DELETE /api/groups/:id/members/:userId`
- `DELETE /api/groups/:id`
- `GET /api/dashboard`
- `GET /api/matches`
- `PUT /api/predictions/:matchId`
- `GET /api/leaderboard` (accepte `from`/`to` pour le classement hebdomadaire)
- `GET /api/results`
- `GET /api/stats/progression` (courbe de progression du classement)
- `GET /api/bracket` (matchs de phase finale, tri par tour cote client)
- `POST /api/admin/sync`
- `GET /api/sync/status`

Validation serveur obligatoire :

- jamais de prono apres `kickoff_at` ;
- scores entiers entre 0 et 30 ;
- PIN numerique de 4 a 8 chiffres ;
- photo profil : URL http(s) ou data image valide, taille limite serveur 1 MB ;
- groupe : nom texte, 2 a 36 caracteres ;
- seul le createur gere les membres et peut supprimer un groupe.

## Authentification et securite

Fichier : `worker/src/auth.ts`.

Principes :

- PIN jamais stocke en clair.
- Hash actuel : `sha256$salt$hash`.
- Compatibilite ancienne : verification PBKDF2 encore supportee.
- Pseudo unique case-insensitive via `COLLATE NOCASE`.
- Brute force PIN :
  - fenetre : 10 minutes ;
  - max echecs : 5 ;
  - lock : 15 minutes ;
  - table `login_attempts`.
- Sessions :
  - table `sessions`;
  - cookie `pcdm_session`, HTTP-only ;
  - fallback bearer possible dans `Authorization`.

Quand tu changes l'auth, ajoute ou ajuste `worker/src/auth.test.ts` et `src/api.test.ts`.

## Matchs et synchronisation football-data.org

Fichier : `worker/src/football-data.ts`.

Flux :

1. Worker appelle `GET /v4/competitions/WC/matches?season=2026`.
2. `normalizeFootballDataMatch()` transforme les donnees externes.
3. Les matchs sont upsert en D1.
4. `recalculateAllPoints(env)` recalcule les pronos.
5. Les statuts de synchro sont stockes dans `settings`.

Le plan gratuit football-data.org peut avoir des scores differes. Ne jamais promettre du live score instantane.

Important (budget d'execution / batch D1) : la synchro ecrit ~100 matchs puis
recalcule ~200 pronos. Ces ecritures DOIVENT etre batchees via `runD1Batch`
(`worker/src/d1-batch.ts`, `env.DB.batch()` par lots de 50) et jamais awaitees une
par une dans une boucle : sinon l'invocation cron depasse son budget d'execution et
meurt en cours de boucle d'upsert AVANT `recalculateAllPoints` (symptome :
`last_synced_at` decale entre matchs, statut de synchro bloque sur `running`, points
jamais recalcules). Toute nouvelle ecriture en masse cote synchro/recalcul doit
passer par `runD1Batch`.

Important (protection anti-effacement) : football-data peut renvoyer un match deja
`FINISHED` avec un score `null` (statut publie avant le score, ou source qui "flappe").
L'upsert NE DOIT JAMAIS ecraser un score reel par un null, sinon le resultat final est
perdu et `recalculateAllPoints` remet tout le monde a 0 point. `buildMatchUpsertSql`
protege donc `home_score`, `away_score`, `winner_team`, `winner_code` via
`COALESCE(excluded.col, col)` (une correction non-null passe toujours). Couvert par
`worker/src/football-data.upsert.test.ts`.

Variables :

- `FOOTBALL_DATA_TOKEN` : secret requis pour la synchro.
- `FOOTBALL_DATA_COMPETITION=WC`
- `FOOTBALL_DATA_SEASON=2026`
- `FOOTBALL_DATA_BASE_URL` optionnelle pour les tests.

Cron :

```toml
[triggers]
crons = ["*/10 * * * *"]
```

Le `scheduled()` du Worker lance `syncFootballData(env)` puis `sendPredictionReminders(env)` (rappels email).

## Notifications email

Fichiers : `worker/src/email.ts`, `worker/src/notifications.ts`.

- Email via Brevo (300 mails/jour gratuits, expediteur verifie sans domaine requis).
- Sans `BREVO_API_KEY` ou `EMAIL_FROM`, l'envoi est no-op (`return false`) : ne casse jamais le flux applicatif (local/tests).
- L'email n'est jamais expose publiquement (table dediee, hors `user_profiles`).
- Rappel envoye une seule fois par match et par joueur (table `notification_log`), pour les pronos manquants d'un match qui debute dans moins de 24h.
- Seuls les joueurs ayant active ET confirme leurs notifications recoivent un rappel.

Variables :

- `BREVO_API_KEY` : secret requis pour l'envoi.
- `EMAIL_FROM` : email expediteur verifie.
- `EMAIL_FROM_NAME` : nom expediteur (optionnel).

## Scoring

Fichier source : `src/shared/scoring.ts`.

Regles :

- Groupes :
  - score exact : 5
  - bon resultat : 3
  - bon resultat + bon ecart : 4
  - mauvais resultat : 0
- Phase finale :
  - score exact : 10
  - bon resultat : 6
  - bon resultat + bon ecart : 8
  - mauvais resultat : 0

Important phase finale :

- Si football-data fournit `score.winner`, le bon resultat est base sur l'equipe qualifiee/gagnante.
- Si cette donnee manque, l'app retombe sur le score final disponible.
- Pour un nul pronostique en phase finale, l'UI demande l'equipe qualifiee.

Feed et matchs en cours : `recalculateAllPoints` calcule les points sur le score
disponible (y compris live), mais ne journalise un evenement de feed (ex: "score
exact") QUE sur un match `FINISHED`/`AWARDED` (`isMatchFinished` dans
`worker/src/scoring-db.ts`). Sinon un score live momentanement exact (ex: 1-0 a la
mi-temps) ecrivait un "score exact" definitif devenu faux au coup de sifflet final.
L'unicite `(type, user_id, match_id)` du feed + `INSERT OR IGNORE` rendent l'insertion
idempotente.

Tout changement de scoring doit mettre a jour :

- `src/shared/scoring.ts`
- `src/shared/scoring.test.ts`
- eventuellement `worker/src/routes.ts` pour la validation/sauvegarde des pronos
- `worker/src/scoring-db.ts` si les colonnes de breakdown changent

## Profils, groupes et badges

Profils :

- Table `user_profiles`.
- Champs : photo, phrase d'accroche, equipe favorite.
- Photo importee cote frontend : compressee en data URL.
- Validation serveur : `asProfilePhoto()`.

Groupes :

- Tables `prediction_groups`, `group_members`.
- N'importe quel user peut creer un groupe.
- Le createur est membre owner.
- Le createur peut retirer des membres et supprimer le groupe.
- Le classement peut etre global ou filtre par groupe.

Badges :

- Fichier : `worker/src/badges.ts`.
- Badges actuels :
  - Premier score exact
  - Serie de 3 bons resultats
  - Derniere minute
  - Sans faute sur une journee
  - Bon eleve
  - Madame Irma
  - Le chat noir
  - VAR emotionnelle
  - Le sans-pitie
  - L'optimiste fou
  - Rivalite lancee
  - Ambiance vestiaire

`Rivalite lancee` utilise la table `profile_views`, alimentee quand un user consulte un profil public. Si tu changes ce comportement, mets a jour la migration ou ajoute une nouvelle migration.

## Base D1 et migrations

Ne modifie jamais une migration deja appliquee. Ajoute toujours une nouvelle migration numerotee.

Migrations existantes :

- `0001_initial.sql` : users, sessions, matches, predictions, activity_feed, settings.
- `0002_user_profiles.sql` : profils.
- `0003_cleanup_user_profiles.sql` : nettoyage schema profils.
- `0004_case_insensitive_pseudo_lookup.sql` : lookup pseudo.
- `0005_groups.sql` : groupes.
- `0006_login_attempts.sql` : brute force PIN.
- `0007_profile_views.sql` : vues de profils pour badge rivalite.
- `0008_group_invite_codes.sql` : code d'invitation par groupe (colonne `invite_code` + index unique). Les groupes existants recoivent un code en lazy backfill.
- `0009_email_notifications.sql` : preferences email par utilisateur + journal d'envoi (`notification_log`).
- `0010_match_group.sql` : colonne `match_group` (poule `GROUP_A`..., `NULL` en phase finale, remplie a la prochaine synchro).
- `0011_match_venue.sql` : colonne `venue` (stade du match, `NULL` si la source ne le fournit pas, remplie a la prochaine synchro).

Commandes :

```bash
npm run d1:migrate:local
npm run d1:migrate:remote
```

Appliquer une migration distante peut impacter la vraie base. Ne le fais que quand le changement backend est valide.

## Tests

Commande principale :

```bash
npm test
npm run build
```

Suites importantes :

- `src/App.test.tsx` : parcours UI, auth, navigation, profils, groupes, pronos.
- `src/api.test.ts` : client API, erreurs, base Worker preview, bearer fallback.
- `src/responsive-css.test.ts` : contraintes CSS responsive/themes.
- `src/shared/scoring.test.ts` : calcul des points.
- `src/shared/standings.test.ts` : classement des poules (points 3/1/0, tie-break diff/buts).
- `src/shared/league-predictions.test.ts` : agregation des scores les plus pronostiques.
- `src/shared/progression.test.ts` : serie de la courbe de progression.
- `src/shared/bracket.test.ts` : regroupement des matchs de phase finale par tour.
- `src/shared/tv-broadcast.test.ts` : resolution des diffuseurs TV (defaut beIN, overrides M6).
- `src/shared/venues.test.ts` : resolution du stade d'un match (override cure vs venue API).
- `worker/src/auth.test.ts` : PIN, hashing, locks, cookies, bearer, purge sessions, hash factice.
- `worker/src/routes.test.ts` : routage API, validation des entrees, codes d'erreur.
- `worker/src/profile-routes.test.ts` : routes profil (GET/PUT `/api/profile`), validation photo invalide/trop lourde, gardes d'auth.
- `worker/src/flow.integration.test.ts` : parcours complet inscription -> prono -> score -> classement (faux D1 a etat partage `worker/src/test-db.ts`).
- `worker/src/infra.test.ts` : pagination `/api/matches` (`parseMatchPagination`), cache `/api/health`, surveillance des erreurs Worker (`worker/src/monitoring.ts`).
- `worker/src/scoring-db.test.ts` : recalcul des points et breakdown apres synchro.
- `worker/src/football-data.test.ts` : normalisation API externe.
- `worker/src/football-data.upsert.test.ts` : protection anti-effacement des scores (COALESCE a l'upsert).
- `worker/src/stats-routes.test.ts` : routes `/api/stats/progression` et `/api/bracket` (Miniflare D1 reel).
- `worker/src/badges.test.ts` : badges profil.
- `worker/src/email.test.ts` : envoi Brevo, no-op sans cle/expediteur.
- `worker/src/notifications.test.ts` : rappels pronos, fenetre 24h, anti-doublon.
- `worker/src/http.test.ts` : allowlist CORS, requireUser, errorResponse.
- `worker/src/invites.test.ts` : codes d'invitation et throttle de synchro.
- `worker/src/leaderboard-window.test.ts` : normalisation fenetre de dates classement.
- `worker/src/prediction-session.test.ts` : session de matchs a pronostiquer, matchs de nuit.
- `src/shared/week.test.ts` : bornes de la semaine.

Avant commit ou preview :

```bash
npm test
npm run build
git diff --check
```

## Deploiement

Frontend Vercel :

```bash
npm run deploy:web:preview
npm run deploy:web:prod
```

Regle projet :

- Toujours creer/tester un preview avant la prod.
- Ne donner un lien preview que si l'app est connectable.
- Si un changement touche le Worker ou D1, un preview frontend seul ne suffit pas.
- Pour les changements backend :
  1. tests/build ;
  2. migration D1 si necessaire ;
  3. `npm run deploy:api` ;
  4. nouveau preview frontend ;
  5. test connexion/dashboard.

Worker :

```bash
npm run deploy:api
```

Production :

- Ne pas deployer en production sans validation utilisateur explicite.
- Pousser sur `main` peut declencher le workflow de prod selon la config Vercel/GitHub.

## Style UI et contraintes produit

L'app est un produit, pas une landing page.

Contraintes :

- Interface responsive mobile/desktop.
- Ne pas ajouter de marketing hero.
- Garder une interface dense, lisible, orientee usage.
- Les cartes sont reservees aux items/outils/modales.
- Pas de texte technique visible pour l'utilisateur.
- La page Resultats a deux vues (selecteur Matchs / Poules) : les matchs termines avec pronos/points, et le classement des poules calcule cote client via `src/shared/standings.ts`.
- Le reglement ne doit pas parler de Worker ni de details backend.
- Le reglement parle de "phase finale", pas de "matchs a enjeu".

## Univers Tour de France

L'app a deux univers de prono : `cdm` (Coupe du monde, historique) et `tdf` (Tour de France). Comptes, profils, groupes et badges sont PARTAGES ; pronos, classements, resultats et reglement sont SEPARES par univers. Un selecteur en haut (`src/App.tsx`, etat `universe`, persiste en `localStorage` cle `pcdm_universe`) bascule entre les deux et monte `src/tdf/TdfApp.tsx` quand `tdf` est actif. Le chemin CDM est inchange quand `universe === "cdm"`.

Fichiers TDF :

- `src/shared/tdf-scoring.ts` : scoring pur (etape + grand depart), couvert par `tdf-scoring.test.ts`.
- `src/tdf/` : module front (shell `TdfApp`, `StagePrediction`, `GrandDepart`, `TdfLeaderboard`, `TdfResults`, `TdfRules`, `TdfAdmin`, client `api.ts`).
- `worker/src/tdf-routes.ts` : routes joueur `/api/tdf/*` (riders, stages, dashboard, predictions, grand-depart, leaderboard, results).
- `worker/src/tdf-admin-routes.ts` : routes admin `/api/admin/tdf/*` (roster, stage-result, final), protegees par `assertTdfSyncSecret` (header `x-tdf-sync-secret` == `TDF_SYNC_SECRET`, OU user `is_admin`).
- `worker/src/tdf-scoring-db.ts` : recalcul des points (etape + grand depart), batche via `runD1Batch`.
- `tools/tdf_sync.py` + `.github/workflows/tdf-sync.yml` : synchro ProCyclingStats (Python, GitHub Action).
- `migrations/0012_tdf.sql` : tables `tdf_*` + colonne `users.is_admin`.

Scoring TDF (fige) :

- Etape : top 10 non ordonne, chaque coureur present dans le top 10 reel rapporte `11 - place reelle` (1er = 10 ... 10e = 1). Combatif correct : +10. Max 65.
- Grand depart : podium jaune place exacte 80/40/20, bon coureur mauvaise place = moitie de la place REELLE (40/20/10) ; podium blanc 40/20/10 ou 20/10/5 ; vert +40 ; pois +40.
- Tout changement met a jour `src/shared/tdf-scoring.ts`, son test, ET le texte de `src/tdf/TdfRules.tsx` (le reglement affiche doit toujours refleter le code).

Donnee cyclisme : aucune API gratuite propre (PCS bloque les clients generiques, lib Python). Le Worker NE SCRAPE JAMAIS : la GitHub Action lance `procyclingstats` et POST vers les routes admin. La saisie manuelle (`TdfAdmin`, visible du seul compte `is_admin`) est le filet de secours et passe par le meme chemin de code. Anti-effacement : un top 10 vide n'ecrase jamais un resultat existant.

Validation serveur TDF (jamais que cote UI) : prono d'etape = 10 coureurs distincts du peloton actif, refuse apres `lock_at` (defaut 13h00) ; grand depart refuse apres le depart de l'etape 1.

Deploiement TDF (owner-gated, voir `docs/superpowers/plans/2026-06-30-tour-de-france-univers.md` Task 10) : migration distante `0012`, `wrangler secret put TDF_SYNC_SECRET`, `is_admin=1` sur le compte proprietaire, deploy API, secrets GitHub `TDF_API_BASE`/`TDF_SYNC_SECRET`.

## Pieges connus

- Les previews Vercel peuvent proteger `/api/*` avec Vercel Authentication. Le client evite cela en appelant directement le Worker sur `.vercel.app`.
- Les cookies cross-domain peuvent ne pas etre renvoyes par certains navigateurs. Le fallback bearer est necessaire pour les previews.
- Si un user semble connecte mais le dashboard affiche "Connexion requise", verifier le token/session et le Worker deploye.
- `VITE_API_BASE_URL` vide est normal en local et possible en prod same-origin, mais en preview Vercel le fallback Worker direct est volontaire.
- Ne jamais appeler football-data.org depuis le frontend.
- Ne jamais stocker le PIN en clair.
- Ne jamais autoriser un prono apres coup d'envoi uniquement cote UI : la validation serveur est obligatoire.
- La chaine TV et le stade ne viennent PAS de l'API (plan gratuit football-data muet sur ces champs) : ils sont cures en code par id football-data dans `src/shared/tv-broadcast.ts` et `src/shared/venues.ts`. Ajouter un match = ajouter une entree dans ces mappings, par id stable (fiable meme quand les equipes sont "a definir").
- La vue phase finale dessine un arbre (BracketView + CSS `.bracket`), mais la source ne fournit PAS la filiation reelle (quel match alimente quel match suivant). Les appariements sont DEDUITS positionnellement (matchs adjacents d'un tour -> meme match du tour suivant) : choix produit assume, le tableau est indicatif et ne reflete pas forcement le tableau officiel. La petite finale (3e place) est sortie de l'entonnoir. Si la filiation reelle devient disponible un jour, c'est ici qu'il faudra brancher le vrai appariement.

## Workflow conseille pour Claude Code

1. Lire les fichiers concernes avant de modifier.
2. Garder les changements scopes.
3. Ajouter un test pour chaque bug corrige ou regle metier ajoutee.
4. Lancer `npm test` et `npm run build`.
5. Si changement D1/Worker, prevoir migration et deploy API avant de donner un preview.
6. Donner un lien preview uniquement si auth + dashboard fonctionnent avec le backend cible.
7. Ne pousser sur `main` ou deployer prod qu'apres validation explicite.
