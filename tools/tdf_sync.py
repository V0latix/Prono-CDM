"""Synchro Tour de France : scrape ProCyclingStats et POST vers les routes admin du Worker.

Le Worker ne scrape JAMAIS lui-meme (PCS bloque les clients generiques en 403/429, et
la lib `procyclingstats` est en Python, impossible a executer dans un Cloudflare Worker).
Ce script tourne dans une GitHub Action et pousse les resultats vers :
  - POST /api/admin/tdf/roster        (peloton + parcours, une fois)
  - POST /api/admin/tdf/stage-result  (top 10 + combatif, apres chaque etape)
authentifie par le header `x-tdf-sync-secret`.

Idempotent : le serveur upsert et protege contre l'effacement (un top10 vide n'ecrase pas
un resultat existant). Rejouer le script est sans effet de bord.

Robustesse : les cles renvoyees par `procyclingstats` varient selon la version de la lib.
Le parsing est defensif (cle manquante -> on logge et on saute l'element au lieu de planter
toute la synchro). Si une cle est durablement fausse, l'ecran admin manuel (saisie/correction)
reste le filet de secours.

Usage :
  python tools/tdf_sync.py --roster      # peloton + parcours
  python tools/tdf_sync.py               # synchronise les etapes 1..21
  python tools/tdf_sync.py --selfcheck   # verifie la logique pure (sans reseau ni lib)
"""

import os
import sys

RACE = "race/tour-de-france/2026"
STAGE_COUNT = 21


def slug(url):
    """Extrait le slug stable d'une URL PCS.

    "rider/tadej-pogacar" -> "tadej-pogacar"
    "rider/tadej-pogacar/" -> "tadej-pogacar"
    """
    if not url:
        return ""
    return url.rstrip("/").split("/")[-1]


def _selfcheck():
    """Verifie la seule logique pure du script. Aucun reseau, aucune dependance."""
    assert slug("rider/tadej-pogacar") == "tadej-pogacar"
    assert slug("rider/tadej-pogacar/") == "tadej-pogacar"
    assert slug("https://www.procyclingstats.com/rider/remco-evenepoel") == "remco-evenepoel"
    assert slug("") == ""
    assert slug(None) == ""
    print("selfcheck OK")


# --- A partir d'ici : code reseau, importe seulement quand on en a besoin -------------

def _client():
    """Retourne (requests, headers, api_base). Importe `requests` paresseusement."""
    import requests  # noqa: PLC0415

    api_base = os.environ["TDF_API_BASE"].rstrip("/")
    secret = os.environ["TDF_SYNC_SECRET"]
    headers = {"x-tdf-sync-secret": secret, "content-type": "application/json"}
    return requests, headers, api_base


def _post(path, payload):
    requests, headers, api_base = _client()
    res = requests.post(f"{api_base}{path}", json=payload, headers=headers, timeout=30)
    res.raise_for_status()
    print(path, res.status_code, res.text[:200])


def _get(row, *keys):
    """Premiere cle presente et non vide parmi `keys` (tolerance aux noms de la lib)."""
    for key in keys:
        value = row.get(key)
        if value:
            return value
    return None


def sync_roster():
    from procyclingstats import Race, RaceStartlist  # noqa: PLC0415

    start = RaceStartlist(f"{RACE}/startlist").parse()
    riders = []
    for r in start.get("startlist", []):
        rider_url = _get(r, "rider_url")
        name = _get(r, "rider_name")
        if not rider_url or not name:
            print("rider ignore (cle manquante):", r)
            continue
        riders.append({
            "id": slug(rider_url),
            "name": name,
            "team": _get(r, "team_name", "team"),
            "nationality": _get(r, "nationality"),
        })

    race = Race(RACE).parse()
    stages = []
    for i, s in enumerate(race.get("stages", [])):
        date = _get(s, "date")
        if not date:
            print("etape ignoree (date manquante):", s)
            continue
        departure = _get(s, "departure") or ""
        arrival = _get(s, "arrival") or ""
        stages.append({
            "stageNo": i + 1,
            "date": date,
            "lockAt": f"{date}T11:00:00Z",  # 13h00 Europe/Paris
            "label": f"{departure} -> {arrival}".strip(" ->"),
        })

    _post("/api/admin/tdf/roster", {"riders": riders, "stages": stages})


def sync_stage(stage_no):
    from procyclingstats import Stage  # noqa: PLC0415

    stage = Stage(f"{RACE}/stage-{stage_no}").parse()
    top10 = []
    for r in stage.get("results", [])[:10]:
        rank = _get(r, "rank")
        rider_url = _get(r, "rider_url")
        if not rank or not rider_url:
            continue
        try:
            top10.append({"rank": int(rank), "riderId": slug(rider_url)})
        except (TypeError, ValueError):
            print(f"rang invalide etape {stage_no}:", r)

    if not top10:
        print(f"etape {stage_no} : pas de resultat exploitable")
        return

    # Le combatif n'est pas toujours expose par Stage.parse() selon la version de la lib.
    # On le laisse a None ici : la saisie manuelle (ecran admin) le complete si besoin.
    combative_id = _get(stage, "most_combative_rider_url")
    _post("/api/admin/tdf/stage-result", {
        "stageNo": stage_no,
        "top10": top10,
        "combativeId": slug(combative_id) if combative_id else None,
    })


def main(argv):
    if "--selfcheck" in argv:
        _selfcheck()
        return
    if "--roster" in argv:
        sync_roster()
        return
    # Le serveur ignore les etapes sans resultat (anti-effacement), donc on peut
    # balayer toutes les etapes a chaque run sans risque.
    for n in range(1, STAGE_COUNT + 1):
        try:
            sync_stage(n)
        except Exception as exc:  # noqa: BLE001 - une etape qui echoue ne doit pas tout stopper
            print(f"etape {n} echec: {exc}")


if __name__ == "__main__":
    main(sys.argv[1:])
