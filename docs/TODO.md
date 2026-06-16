# TODO - Améliorations Prono CDM

Ce fichier regroupe des pistes d'amélioration pour faire évoluer l'app après le MVP. Les priorités sont indicatives.

## Priorité haute

- [x] Ajouté des indications sur tous les matchs de la phase de groupe relatif au groupe dans lequel se joue le match. Et par la suite indiqué 1/8 de final, 1/4 final, etc

### Pronostics


### Dashboard

- [x] Ajouter une carte "dernier résultat calculé" avec points gagnés.
- [x] Ajouter un cron automatique pour mettre a jour les résultats des matchs. (cron toutes les 10 min : sync + recalcul des points)

### Classement

- [x] Ajouter un classement hebdomadaire.

### Résultat

- [x] Ajouter et integrer les classement des différents groupes directement dans l'appli (onglet Résultats > Poules : classement par poule, calculé depuis les matchs terminés)

### Terminé - Classement

- [x] Ajouter des colonnes de tie-break : exacts, bons résultats, bonus écart, moyenne.
- [x] Ajouter une progression de rang : +2, -1, stable.
- [x] Ajouter une vue "forme récente" sur les 5 derniers matchs terminés.
- [x] Retirer les vues groupes et élimination directe du classement général.

### Terminé - Profil et compte

- [x] Persister toutes les préférences de profil côté D1 avec une migration de nettoyage des anciens champs inutilisés.
- [x] Ajouter une compression automatique des photos avant upload pour limiter la taille stockée en base.
- [x] Ajouter un bouton "Supprimer ma photo" dans le profil.
- [x] Ajouter une page profil publique par joueur depuis le classement.
- [x] Afficher les stats profil dans le classement dans une fiche compacte.
- [x] Ajouter une section badges sur les profils privé et public.
- [x] Rendre l'accès aux profils joueurs visible depuis chaque ligne du classement.

### Social et fun

- Ajouter une remontée au classement dans le mini feed d'activité.
- Ajouter des badges :
  - Roi du nul
- Ajouter des réactions simples sur les activités : bravo, rageant, chanceux.
- Ajouter un petit message de chambre quand un joueur passe premier.
- Ajouter une fiche "rival du moment" basée sur le joueur le plus proche au classement.

### Terminé - Social et fun

- [x] Rendre le mini feed d'activité plus riche : score exact trouvé, nouveau leader, série de bons résultats.
- [x] Ajouter les badges : Premier score exact, Série de 3 bons résultats, Dernière minute, Sans faute sur une journée.

### Stats avancées

- [x] Ajouter une courbe des points cumulés par joueur. (Classement : courbe moi / leader / moyenne, via `/api/stats/progression` + recharts)
- [x] Ajouter une comparaison avec la moyenne de la ligue. (ligne "moyenne ligue" sur la même courbe)
- [x] Ajouter les scores les plus pronostiqués par l'ensemble de la ligue dans la partie résultat. (sous chaque match terminé, via `/api/results`)

### Résultats

## Priorité basse

### Administration

- Ajouter une page admin protégée pour lancer la synchronisation.
- Ajouter un statut détaillé de la dernière synchro :
  - début
  - fin
  - nombre de matchs mis à jour
  - erreur éventuelle
- Ajouter une commande admin pour recalculer tous les points.
- Ajouter un export CSV du classement et des pronostics.

### Notifications

### Terminé - Notifications

- [x] Ajouter un email optionnel pour rappeler les matchs à pronostiquer (~24h avant le coup d'envoi, opt-in + confirmation, via Brevo).

### Terminé - Qualité et robustesse

- [x] Ajouter des tests Worker sur les routes profil. (`worker/src/profile-routes.test.ts` : GET/PUT `/api/profile`, garde d'auth de la route profil publique)
- [x] Ajouter des tests sur les cas de photo invalide ou trop lourde. (formats refusés, data URL non image, plafond serveur 1 Mo, valeur non texte)
- [x] Ajouter des tests d'intégration sur le parcours complet inscription -> prono -> score -> classement. (`worker/src/flow.integration.test.ts` sur un faux D1 à état partagé `worker/src/test-db.ts` + vrais handlers)
- [x] Ajouter une stratégie de pagination si le calendrier complet devient lourd. (`?limit`/`?offset` optionnels sur `/api/matches`, `parseMatchPagination`, sans rien casser par défaut)
- [x] Ajouter une politique de cache API interne pour les endpoints publics. (`Cache-Control: public, max-age=60` sur `/api/health`, seul endpoint sans credentials)
- [x] Ajouter une surveillance simple des erreurs Worker. (`worker/src/monitoring.ts` : compteur + dernière erreur 500 en `settings`, exposés via `/api/sync/status`)

## Idées de design

- Ajouter un mode compact mobile pour saisir plusieurs pronos rapidement.
- Ajouter un sticky footer mobile avec les onglets principaux.
- Ajouter une meilleure hiérarchie visuelle entre matchs ouverts, verrouillés et terminés.
- Ajouter des micro-animations sobres sur les changements de points ou de rang.
- Ajouter une carte profil plus visuelle avec avatar, favori, rang et forme récente.

## Dette technique

- Éviter de stocker durablement de grosses images en D1 si l'app grandit ; prévoir R2 ou une compression plus agressive.
- Centraliser les types partagés entre Worker et frontend pour éviter les divergences.
- Factoriser les requêtes SQL répétées qui construisent les matchs avec pronostic.
- Ajouter une couche de validation partagée pour les payloads API.
