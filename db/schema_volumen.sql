-- Huella del edificio posible: retira el polígono del lote hacia adentro (en metros, MAGNA-SIRGAS Bogotá)
-- hasta que su área quede por debajo de la huella permitida (área útil × índice de ocupación).
CREATE OR REPLACE FUNCTION huella_cabida(g geometry, objetivo double precision) RETURNS geometry AS $$
DECLARE
  gm geometry := ST_Transform(ST_CollectionExtract(ST_MakeValid(g), 3), 3116);
  r double precision := 0;
  h geometry;
BEGIN
  IF objetivo IS NULL OR objetivo <= 0 OR gm IS NULL OR ST_IsEmpty(gm) THEN RETURN NULL; END IF;
  IF ST_Area(gm) <= objetivo THEN RETURN ST_Transform(gm, 4326); END IF;
  WHILE r < 80 LOOP
    r := r + 0.75;
    h := ST_Buffer(gm, -r, 'join=mitre');
    EXIT WHEN h IS NULL OR ST_IsEmpty(h);
    IF ST_Area(h) <= objetivo THEN
      SELECT d.geom INTO h FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(h), 3)) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      RETURN ST_Transform(h, 4326);
    END IF;
  END LOOP;
  RETURN ST_Transform(ST_Expand(ST_Centroid(gm), sqrt(objetivo) / 2), 4326);
END $$ LANGUAGE plpgsql IMMUTABLE;
