-- Parcours d'étape TDF : image de profil officielle + cols traversés.
-- Données scrapées de letour.fr (page /en/stage-N). Additif, non destructif.

ALTER TABLE tdf_stages ADD COLUMN profile_image_url TEXT;

-- Cols et difficultés d'une étape (ordre = position dans le parcours).
-- kind = 'col' (catégorisé, points pois). category = 'HC' / '1' / '2' / '3' / '4'.
CREATE TABLE tdf_stage_cols (
  stage_no INTEGER NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'col',
  name TEXT NOT NULL,
  category TEXT,
  km REAL,
  PRIMARY KEY (stage_no, position)
);
