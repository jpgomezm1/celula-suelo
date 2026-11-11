-- Célula de suelo · esquema v2 (multi-municipio)
-- Cada fila apunta a un source_snapshot: de dónde salió y cuándo.
-- Idempotente: se puede aplicar varias veces.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS municipio (
  dane       text PRIMARY KEY,          -- código DANE de 5 dígitos, p. ej. 05001
  nombre     text NOT NULL,
  region     text NOT NULL,             -- Valle de Aburrá | Oriente
  grupo      text NOT NULL,             -- A completo | B numérico | C solo código | D Oriente
  cobertura  jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS source_snapshot (
  id          serial PRIMARY KEY,
  fuente      text NOT NULL,
  nombre      text NOT NULL,
  url         text NOT NULL,
  filtro      text,
  tipo_dato   text NOT NULL,           -- oficial | anunciado | digitalizado | inferencia
  licencia    text,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  esperado    int,
  registros   int,
  notas       text
);
CREATE INDEX IF NOT EXISTS source_snapshot_fuente_idx ON source_snapshot (fuente, fetched_at DESC);

CREATE TABLE IF NOT EXISTS parcel (
  id                 text PRIMARY KEY,  -- dane:clave_local
  municipio_dane     text NOT NULL REFERENCES municipio(dane),
  clave_local        text NOT NULL,     -- CBML | PK_PREDIOS | NPN | TERRENO_CODIGO
  clase              text,              -- U | R
  geom               geometry(MultiPolygon, 4326) NOT NULL,
  area_lote          numeric,
  tipo_lote          text,
  fuente             text NOT NULL,
  snapshot_id        int NOT NULL REFERENCES source_snapshot(id)
);
CREATE INDEX IF NOT EXISTS parcel_geom_idx ON parcel USING gist (geom);
CREATE INDEX IF NOT EXISTS parcel_mun_idx ON parcel (municipio_dane);
CREATE INDEX IF NOT EXISTS parcel_clave_idx ON parcel (clave_local);
CREATE INDEX IF NOT EXISTS parcel_fuente_idx ON parcel (fuente);

-- Sin geometría: la huella se calcula al ingerir (son ~1,7 M de filas).
CREATE TABLE IF NOT EXISTS building (
  id               text PRIMARY KEY,    -- fuente:objectid
  parcel_id        text,
  municipio_dane   text NOT NULL,
  pisos            numeric,
  area_construida  numeric,
  huella_m2        numeric,
  uso              text,
  fuente           text NOT NULL,
  snapshot_id      int NOT NULL REFERENCES source_snapshot(id)
);
CREATE INDEX IF NOT EXISTS building_parcel_idx ON building (parcel_id);
CREATE INDEX IF NOT EXISTS building_fuente_idx ON building (fuente);

-- Capas normativas y temáticas. attrs = claves canónicas + originales (_src).
CREATE TABLE IF NOT EXISTS zoning_layer (
  id              serial PRIMARY KEY,
  fuente          text NOT NULL,
  municipio_dane  text,
  capa            text NOT NULL,        -- tratamiento | uso | valor_suelo | amenaza | proteccion | barrio | clasificacion
  subtipo         text,
  attrs           jsonb NOT NULL,
  geom            geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id     int NOT NULL REFERENCES source_snapshot(id)
);
CREATE INDEX IF NOT EXISTS zoning_geom_idx ON zoning_layer USING gist (geom);
CREATE INDEX IF NOT EXISTS zoning_capa_idx ON zoning_layer (capa, municipio_dane);
CREATE INDEX IF NOT EXISTS zoning_fuente_idx ON zoning_layer (fuente);

CREATE TABLE IF NOT EXISTS norma_tratamiento (
  municipio_dane  text NOT NULL REFERENCES municipio(dane),
  codigo          text NOT NULL,        -- código o nombre normalizado del tratamiento en el servicio
  nombre          text,
  altura_max      numeric,              -- pisos
  ic_base         numeric,
  ic_max          numeric,
  densidad_max    numeric,              -- viviendas / ha
  io_max          numeric,              -- índice de ocupación (0-1)
  acuerdo         text,
  articulo        text,
  url             text,
  estado          text NOT NULL,        -- servicio | digitalizada_pendiente | validada
  notas           text,
  PRIMARY KEY (municipio_dane, codigo)
);

CREATE TABLE IF NOT EXISTS licence (
  id               text PRIMARY KEY,
  parcel_id        text,
  municipio_dane   text NOT NULL,
  curaduria        text,
  anio             int,
  objeto           text,
  nombre_proyecto  text,
  radicado         text,
  resolucion       text,
  direccion        text,
  geom             geometry(Point, 4326),
  fuente           text NOT NULL,
  snapshot_id      int NOT NULL REFERENCES source_snapshot(id)
);
CREATE INDEX IF NOT EXISTS licence_parcel_idx ON licence (parcel_id);

CREATE TABLE IF NOT EXISTS ingest_checkpoint (
  fuente       text PRIMARY KEY,
  snapshot_id  int NOT NULL,
  ultimo_oid   bigint,
  offset_n     int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- v2.1: punto interior de cada construcción para enlazarla a su predio.
ALTER TABLE building ADD COLUMN IF NOT EXISTS pt geometry(Point, 4326);
CREATE INDEX IF NOT EXISTS building_pt_idx ON building USING gist (pt);

CREATE OR REPLACE FUNCTION norm_txt(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;
