-- Stocke le stade d'un match (champ `venue` de football-data.org).
-- NULL si la source ne le fournit pas. Rempli à la prochaine synchro.
ALTER TABLE matches ADD COLUMN venue TEXT;
