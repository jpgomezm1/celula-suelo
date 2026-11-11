-- Contacto y señales de venta por predio. Sin nombres ni teléfonos de personas naturales.
-- Matrícula, número de propietarios y dirección del predio son datos del inmueble (públicos).

CREATE TABLE IF NOT EXISTS parcel_folio (
  parcel_id         text NOT NULL,          -- 05001:<cbml>
  matricula         text NOT NULL,          -- folio sin círculo (como lo publica la fuente)
  registro          text,                   -- <círculo>-<folio> confirmado contra el IGAC (Croma)
  por_derecho       numeric,                -- % del predio que representa el folio (PH < 100)
  uso_predial       text,
  estrato           int,
  nro_propietarios  int,
  avaluo            numeric,
  fuente            text NOT NULL,
  PRIMARY KEY (parcel_id, matricula)
);
CREATE INDEX IF NOT EXISTS parcel_folio_mat_idx ON parcel_folio (matricula);

CREATE TABLE IF NOT EXISTS parcel_address (
  parcel_id      text NOT NULL,
  direccion      text NOT NULL,
  codigo_postal  text,
  fuente         text NOT NULL,
  PRIMARY KEY (parcel_id, direccion)
);

-- Actos registrados en el folio (IGAC vía Croma): compraventas, hipotecas, embargos, sucesiones…
CREATE TABLE IF NOT EXISTS folio_act (
  id             text PRIMARY KEY,
  registro       text NOT NULL,
  anotacion      int,
  fecha          date,
  act_code       int,
  acto           text,
  instrumento    text,
  valor          bigint,
  partes_de      int,
  partes_a       int,
  folio_abierto  date
);
CREATE INDEX IF NOT EXISTS folio_act_reg_idx ON folio_act (registro);

CREATE TABLE IF NOT EXISTS folio_consulta (
  registro      text PRIMARY KEY,
  encontrado    boolean NOT NULL,
  datos_hasta   timestamptz,
  consultado_en timestamptz NOT NULL DEFAULT now()
);
