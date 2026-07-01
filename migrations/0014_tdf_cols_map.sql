-- Carte des cols / points chauds de l'étape (image letour "cartepot"), affichée
-- à côté du profil d'étape. Additif, non destructif.

ALTER TABLE tdf_stages ADD COLUMN cols_map_url TEXT;
