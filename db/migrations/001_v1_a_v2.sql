-- Migración v1 (solo El Poblado, clave CBML) → v2 (multi-municipio).
-- Los datos v1 se recargan con la ingesta nueva; aquí solo se retiran las estructuras viejas.
DROP MATERIALIZED VIEW IF EXISTS parcel_profile;
DROP TABLE IF EXISTS listing;
DROP TABLE IF EXISTS licence;
DROP TABLE IF EXISTS zoning_layer;
DROP TABLE IF EXISTS building;
DROP TABLE IF EXISTS parcel;
DELETE FROM source_snapshot;
