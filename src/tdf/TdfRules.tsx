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
        1er : 10 pts · 2e : 8 pts · 3e : 6 pts · 4e : 5 pts · 5e : 4 pts ·
        6e : 3 pts · 7e : 2 pts · 8e–10e : 1 pt.
      </p>
      <p>Combatif correct : +5 pts.</p>

      <h2>Grand Départ</h2>
      <p>
        Avant la course, tu pronostiques le podium final au classement général (maillot jaune),
        le podium du meilleur jeune (maillot blanc), le meilleur sprinter (maillot vert) et le
        meilleur grimpeur (maillot à pois). Ces pronos rapportent des points bonus à la fin du
        Tour.
      </p>

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
