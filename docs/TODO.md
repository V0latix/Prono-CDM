# TODO - Améliorations Prono CDM

Ce fichier regroupe des pistes d'amélioration pour faire évoluer l'app après le MVP. Les priorités sont indicatives.

## Priorité haute

- [x] Ajouté des indications sur tous les matchs de la phase de groupe relatif au groupe dans lequel se joue le match. Et par la suite indiqué 1/8 de final, 1/4 final, etc

### Pronostics

- Ajouter un état visuel plus fort pour les matchs bientôt verrouillés.

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

- Ajouter une courbe des points cumulés par joueur.
- Ajouter une comparaison avec la moyenne de la ligue.
- Ajouter les scores les plus pronostiqués par l'ensemble de la ligue.
- Ajouter le taux de risque :
  - pronos avec gros écarts
  - pronos de nuls
  - pronos contre les favoris
- Ajouter une stat "points laissés" après chaque match.
- Ajouter les meilleurs pronostiqueurs par phase.

### Résultats

- Ajouter un détail de calcul des points par match.
- Afficher pourquoi un prono a marqué 0, 3, 4, 5, 6, 8 ou 10 points.
- Ajouter une comparaison "mon prono vs prono moyen de la ligue".
- Ajouter un filtre résultats par joueur.
- Ajouter une vue calendrier compacte des matchs terminés.

## Priorité basse

### Administration

- Ajouter une page admin protégée pour lancer la synchronisation.
- Ajouter un statut détaillé de la dernière synchro :
  - début
  - fin
  - nombre de matchs mis à jour
  - erreur éventuelle
- Ajouter une commande admin pour recalculer tous les points.
- Ajouter une commande admin pour régénérer le feed d'activité.
- Ajouter un export CSV du classement et des pronostics.

### Notifications

- Ajouter des rappels navigateur pour les pronos non faits.
- Ajouter une notification après recalcul des points.
- Ajouter une notification quand un joueur devient premier.

### Terminé - Notifications

- [x] Ajouter un email optionnel pour rappeler les matchs à pronostiquer (~24h avant le coup d'envoi, opt-in + confirmation, via Brevo).

### Qualité et robustesse

- Ajouter des tests Worker sur les routes profil.
- Ajouter des tests sur les cas de photo invalide ou trop lourde.
- Ajouter des tests d'intégration sur le parcours complet inscription -> prono -> score -> classement.
- Ajouter une stratégie de pagination si le calendrier complet devient lourd.
- Ajouter une politique de cache API interne pour les endpoints publics.
- Ajouter une surveillance simple des erreurs Worker.

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

## Questions produit à trancher

- Est-ce que les profils doivent être visibles par tous les membres de la ligue ?
- Est-ce qu'on veut autoriser plusieurs ligues plus tard ou garder une seule ligue privée ?
- Est-ce que les pronos doivent devenir visibles aux autres après le coup d'envoi ?
- Est-ce qu'on veut afficher les scores différés comme une contrainte explicite sur chaque résultat ?
- Est-ce qu'on veut un mode "fun" avec badges et commentaires, ou garder l'app très simple ?
