-- Mercado (Fynder) y proyectos sobre planos. Idempotente.

-- ───── Fynder (copia sin datos personales, vía celula_export) ─────
CREATE TABLE IF NOT EXISTS fynder_barrio (
  id               int PRIMARY KEY,
  municipio_texto  text,
  municipio_dane   text,
  comuna           text,
  nombre           text,
  tipo             text,
  pt               geometry(Point, 4326),
  synced_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fynder_barrio_pt_idx ON fynder_barrio USING gist (pt);

CREATE TABLE IF NOT EXISTS listing (
  id                   int PRIMARY KEY,           -- id de Fynder
  municipio_dane       text,
  municipio_texto      text,
  barrio               text,
  barrio_id            int,
  comuna               text,
  tipo                 text,
  negocio              text,
  estado_inmueble      text,                      -- sobre_planos | nuevo | usado | remodelado | para_remodelar
  precio               bigint,
  area                 numeric,
  area_lote            numeric,
  precio_m2            numeric,
  habitaciones         int,
  banos                int,
  parqueaderos         int,
  estrato              int,
  ano_construccion     int,
  titulo               text,
  geom                 geometry(Point, 4326),
  ubicacion_aproximada boolean,
  activa               boolean,
  portal               text,
  constructora_id      int,
  grupo_duplicado      int,
  publicado_en         timestamptz,
  actualizado_en       timestamptz,
  salio_en             timestamptz,
  parcel_id            text,                      -- solo si la coordenada no es aproximada
  synced_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_geom_idx ON listing USING gist (geom);
CREATE INDEX IF NOT EXISTS listing_mun_idx ON listing (municipio_dane, negocio, activa);
CREATE INDEX IF NOT EXISTS listing_estado_idx ON listing (estado_inmueble);

CREATE TABLE IF NOT EXISTS listing_price_change (
  id             bigint PRIMARY KEY,
  listing_id     int NOT NULL,
  precio_antes   bigint,
  precio_nuevo   bigint,
  aplicado       boolean,
  origen         text,
  fecha          timestamptz
);
CREATE INDEX IF NOT EXISTS lpc_listing_idx ON listing_price_change (listing_id);

CREATE TABLE IF NOT EXISTS demand_request (
  id                int PRIMARY KEY,
  fecha             timestamptz,
  presupuesto       bigint,
  presupuesto_min   bigint,
  presupuesto_max   bigint,
  negocio           text,
  tipos             text[],
  habitaciones_min  int,
  area_min          numeric,
  zonas_texto       text[],
  municipios_dane   text[],
  barrio_ids        int[],
  estado            text,
  canal             text,
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demand_fecha_idx ON demand_request (fecha);
CREATE INDEX IF NOT EXISTS demand_barrios_idx ON demand_request USING gin (barrio_ids);
CREATE INDEX IF NOT EXISTS demand_mun_idx ON demand_request USING gin (municipios_dane);

CREATE TABLE IF NOT EXISTS market_index (
  mes          date,
  zona         text,
  nivel        text,
  municipio    text,
  activos      int,
  aptos        int,
  m2_p25       numeric,
  m2_mediana   numeric,
  m2_p75       numeric,
  var_m2_pct   numeric,
  nuevos       int,
  salieron     int,
  pedidos      int,
  suficiente   boolean,
  PRIMARY KEY (mes, zona, nivel)
);

CREATE TABLE IF NOT EXISTS fynder_sync (
  tabla        text PRIMARY KEY,
  ultimo       timestamptz,
  filas        int,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

-- ───── Proyectos sobre planos ─────
CREATE TABLE IF NOT EXISTS constructora (
  id                       serial PRIMARY KEY,
  nombre                   text NOT NULL,
  clave                    text NOT NULL UNIQUE,   -- nombre normalizado
  alias                    text[] NOT NULL DEFAULT '{}',
  nit                      text,
  fynder_constructora_id   int,
  sitio_web                text
);

CREATE TABLE IF NOT EXISTS project (
  id               serial PRIMARY KEY,
  nombre           text NOT NULL,
  clave            text NOT NULL,                  -- nombre normalizado
  constructora_id  int REFERENCES constructora(id),
  municipio_dane   text,
  barrio           text,
  geom             geometry(Point, 4326),
  parcel_id        text,
  etapa            text,                           -- prelanzamiento | lanzamiento | construccion | entrega | terminado
  entrega          text,                           -- año o mes estimado, como lo dice la fuente
  precio_desde     bigint,
  precio_hasta     bigint,
  precio_m2_desde  numeric,
  area_min         numeric,
  area_max         numeric,
  habitaciones     text,
  unidades         int,
  tipologias       jsonb,
  tipo             text,                           -- apartamentos | casas | lotes | oficinas ...
  estado           text NOT NULL DEFAULT 'activo', -- activo | desaparecido
  primera_vez      timestamptz NOT NULL DEFAULT now(),
  ultima_vez       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_geom_idx ON project USING gist (geom);
CREATE INDEX IF NOT EXISTS project_mun_idx ON project (municipio_dane);

CREATE TABLE IF NOT EXISTS project_source (
  id           serial PRIMARY KEY,
  project_id   int REFERENCES project(id) ON DELETE SET NULL,
  fuente       text NOT NULL,                     -- zonario | fincaraiz | lahaus | constructora:<x> | fynder
  fuente_id    text NOT NULL,                     -- url o id en la fuente
  url          text,
  nombre       text,
  constructora text,
  municipio_dane text,
  barrio       text,
  geom         geometry(Point, 4326),
  datos        jsonb NOT NULL,                    -- campos normalizados de esa fuente
  raw          jsonb,                             -- lo que se leyó (JSON-LD, etc.)
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  activo       boolean NOT NULL DEFAULT true,
  UNIQUE (fuente, fuente_id)
);
CREATE INDEX IF NOT EXISTS project_source_geom_idx ON project_source USING gist (geom);

CREATE TABLE IF NOT EXISTS project_snapshot (
  project_id    int NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  precio_desde  bigint,
  precio_hasta  bigint,
  precio_m2_desde numeric,
  etapa         text,
  fuentes       text[],
  PRIMARY KEY (project_id, fecha)
);
