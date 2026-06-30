export default function TdfRules() {
  return (
    <section className="content-section rules">
      <h2>Comment marquer des points</h2>
      <p>
        Pour chaque étape, tu choisis 10 coureurs. Tu marques des points pour chacun d'eux
        qui figure dans le top 10 à l'arrivée — plus il finit haut, plus tu marques.
      </p>
      <p>
        Tu désignes aussi un coureur combatif pour l'étape. Si l'UCI lui décerne le prix de la
        combativité, tu gagnes des points bonus.
      </p>

      <h2>Barème par étape</h2>
      <p>
        Chaque coureur de ton top 10 présent dans le top 10 réel rapporte 11 − sa place réelle :
        1er = 10 pts, 2e = 9 pts, 3e = 8 pts, 4e = 7 pts, 5e = 6 pts,
        6e = 5 pts, 7e = 4 pts, 8e = 3 pts, 9e = 2 pts, 10e = 1 pt.
      </p>
      <p>Combatif correct : +10 pts.</p>

      <h2>Grand Départ</h2>
      <p>
        Avant la course, tu pronostiques le podium final au classement général (maillot jaune),
        le podium du meilleur jeune (maillot blanc), le meilleur sprinter (maillot vert) et le
        meilleur grimpeur (maillot à pois). Ces pronos rapportent des points bonus à la fin du
        Tour.
      </p>
      <p>
        Maillot jaune — place exacte : 1er = 80 pts, 2e = 40 pts, 3e = 20 pts.
        Bon coureur, mauvaise place : 40 / 20 / 10 pts.
      </p>
      <p>
        Maillot blanc — place exacte : 1er = 40 pts, 2e = 20 pts, 3e = 10 pts.
        Bon coureur, mauvaise place : 20 / 10 / 5 pts.
      </p>
      <p>Maillot vert correct : +40 pts. Maillot à pois correct : +40 pts.</p>

      <h2>Verrouillage</h2>
      <p>
        Chaque prono d'étape se ferme à l'heure du départ. Après ce verrou, plus de
        modifications possibles — les pronos ne peuvent plus être modifiés après ce verrou.
      </p>

      <h2>Classement</h2>
      <p>
        Le classement général additionne tes points sur toutes les étapes et les pronos du
        Grand Départ. Il se met à jour après chaque étape.
      </p>
    </section>
  );
}
