-- Stocke la poule (GROUP_A, GROUP_B, ...) d'un match de phase de groupe.
-- NULL pour les matchs à élimination directe. Rempli à la prochaine synchro.
ALTER TABLE matches ADD COLUMN match_group TEXT;
