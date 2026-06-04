# TODO - Améliorations Prono CDM

Ce fichier regroupe des pistes d'amélioration pour faire évoluer l'app après le MVP. Les priorités sont indicatives.

## Priorité haute

### Pronostics

- Ajouter un filtre "À faire" dans Mes pronos pour voir uniquement les matchs ouverts sans prono.
- Ajouter un filtre par phase : groupes, 16es, 8es, quarts, demies, finale.
- Ajouter une sauvegarde rapide inline sans devoir cliquer sur chaque bouton si les scores changent.
- Ajouter un état visuel plus fort pour les matchs bientôt verrouillés.
- Afficher un compte à rebours avant verrouillage pour les matchs du jour.

### Dashboard

- Mettre en avant les pronos urgents dans une section dédiée "À verrouiller bientôt".
- Ajouter un résumé de progression : pronos faits, restants, verrouillés.
- Ajouter une carte "dernier résultat calculé" avec points gagnés.
- Ajouter une alerte si la synchro football-data.org est en erreur ou trop ancienne.

### Classement

- Ajouter un classement par journée ou date de match.
- Ajouter un classement hebdomadaire.
- Ajouter des colonnes de tie-break : exacts, bons résultats, bonus écart, moyenne.
- Ajouter une progression de rang : +2, -1, stable.
- Ajouter une vue "forme récente" sur les 5 derniers matchs terminés.

## Priorité moyenne

### Terminé - Profil et compte

- [x] Persister toutes les préférences de profil côté D1 avec une migration de nettoyage des anciens champs inutilisés.
- [x] Ajouter une compression automatique des photos avant upload pour limiter la taille stockée en base.
- [x] Ajouter un bouton "Supprimer ma photo" dans le profil.
- [x] Ajouter une page profil publique par joueur depuis le classement.
- [x] Afficher les stats profil dans le classement dans une fiche compacte.

### Social et fun

- Rendre le mini feed d'activité plus riche :
  - score exact trouvé
  - nouveau leader
  - série de bons résultats
  - remontée au classement
- Ajouter des badges :
  - Premier score exact
  - Roi du nul
  - Série de 3 bons résultats
  - Dernière minute
  - Sans faute sur une journée
- Ajouter des réactions simples sur les activités : bravo, rageant, chanceux.
- Ajouter un petit message de chambre quand un joueur passe premier.
- Ajouter une fiche "rival du moment" basée sur le joueur le plus proche au classement.

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
- Ajouter un email ou webhook optionnel pour rappeler les matchs du lendemain.
- Ajouter une notification après recalcul des points.
- Ajouter une notification quand un joueur devient premier.

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
