-- Classements généraux par maillot (jaune/vert/pois/blanc), scrapés de letour à
-- chaque synchro pour affichage dans les résultats. Additif, non destructif.

CREATE TABLE tdf_classifications (
  jersey TEXT NOT NULL,   -- 'yellow' | 'green' | 'polka' | 'white'
  rank INTEGER NOT NULL,
  rider_id TEXT NOT NULL, -- dossard letour (clé du peloton)
  PRIMARY KEY (jersey, rank)
);
