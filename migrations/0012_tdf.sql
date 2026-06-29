-- Univers Tour de France : peloton, étapes, résultats, pronos, grand départ.
-- Tables préfixées tdf_. Socle (users/sessions/groupes/profils) réutilisé tel quel.

-- Le peloton : liste où le joueur pioche ses 10 coureurs et son combatif.
CREATE TABLE tdf_riders (
  id TEXT PRIMARY KEY,            -- slug PCS stable (ex: "tadej-pogacar")
  name TEXT NOT NULL,
  team TEXT,
  nationality TEXT,
  is_young INTEGER NOT NULL DEFAULT 0,  -- éligible maillot blanc
  status TEXT NOT NULL DEFAULT 'active' -- 'active' | 'abandoned'
);

-- Les étapes : verrou par défaut à 13h00 (éditable), combatif porté ici.
CREATE TABLE tdf_stages (
  stage_no INTEGER PRIMARY KEY,
  date TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  lock_at TEXT NOT NULL,              -- ISO UTC, défaut date + 13:00 Europe/Paris
  type TEXT NOT NULL DEFAULT 'flat',  -- 'flat' | 'mountain' | 'itt' | 'ttt'
  label TEXT NOT NULL DEFAULT '',     -- "Ville → Ville"
  status TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'finished'
  combative_rider_id TEXT,            -- résultat combatif (NULL tant qu'inconnu)
  last_synced_at TEXT
);

-- Top 10 réel d'une étape (rank 1..10 suffit pour le scoring).
CREATE TABLE tdf_stage_results (
  stage_no INTEGER NOT NULL,
  rider_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (stage_no, rank)
);

-- Prono d'étape : 10 coureurs en JSON texte + combatif. points = calculé.
CREATE TABLE tdf_stage_predictions (
  user_id TEXT NOT NULL,
  stage_no INTEGER NOT NULL,
  rider_ids TEXT NOT NULL,            -- JSON: ["slug1", ..., "slug10"]
  combative_rider_id TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, stage_no)
);

-- Prono grand départ : une ligne par joueur, figé au départ étape 1.
CREATE TABLE tdf_grand_depart_predictions (
  user_id TEXT PRIMARY KEY,
  yellow1 TEXT, yellow2 TEXT, yellow3 TEXT,
  white1 TEXT, white2 TEXT, white3 TEXT,
  green TEXT,
  polka TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Résultats finaux grand départ : ligne unique (id = 1).
CREATE TABLE tdf_grand_depart_results (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  yellow1 TEXT, yellow2 TEXT, yellow3 TEXT,
  white1 TEXT, white2 TEXT, white3 TEXT,
  green TEXT,
  polka TEXT,
  updated_at TEXT
);

-- Écran admin visible uniquement depuis le compte propriétaire.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
