-- Galería Inmobiliaria (licencia de Conaltura): proyectos de vivienda nueva con ventas, ritmo y oferta, por fecha de corte.
-- Uso interno del cliente que paga la suscripción; no se redistribuye.
CREATE TABLE IF NOT EXISTS galeria_proyecto (
  codigo                   text NOT NULL,
  fecha_corte              date NOT NULL,
  ciudad                   text,
  proyecto                 text,
  vende                    text,
  construye                text,
  direccion                text,
  zona                     text,
  sub_zona                 text,
  estrato                  int,
  precio_m2_oferta         numeric,
  meses_activo             numeric,
  fecha_inicio_ventas      date,
  ventas_prom_semestre_un  numeric,
  ventas_prom_semestre_mm  numeric,
  puesto_zona              numeric,
  calificacion_zona        numeric,
  unidades_total           numeric,
  ventas_total_un          numeric,
  unidades_disponibles     numeric,
  unidades_por_lanzar      numeric,
  pct_vendido              numeric,
  ventas_prom_total_un     numeric,
  capacidad_ventas_mm      numeric,
  capacidad_oferta_mm      numeric,
  capacidad_actual_futura_mm numeric,
  meses_en_venta           numeric,
  meses_faltantes          numeric,
  fecha_entrega            date,
  precio_prom_oferta_mm    numeric,
  area_prom_ventas         numeric,
  ventas_mes_un            numeric,
  ventas_mes_mm            numeric,
  area_prom_oferta         numeric,
  tipo                     text,
  tipo_vivienda            text,      -- VIS | NO VIS | VIS /NO VIS
  financiera               text,
  fiduciaria               text,
  lote_futuro              text,
  estado_obra              text,
  certificacion            text,
  entrega                  text,      -- obra gris | acabados | semi acabados
  smlv                     text,
  rentas_cortas            boolean,   -- inferido del nombre: (VT), renta corta
  municipio_dane           text,
  geom                     geometry(Point, 4326),
  ubicacion_metodo         text,      -- zonario | nomenclatura | barrio | sin_ubicar
  archivo                  text,
  importado_en             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo, fecha_corte)
);
CREATE INDEX IF NOT EXISTS galeria_geom_idx ON galeria_proyecto USING gist (geom);
CREATE INDEX IF NOT EXISTS galeria_corte_idx ON galeria_proyecto (fecha_corte);

-- Estudios de competencia generados (entrada, resultado y textos redactados).
CREATE TABLE IF NOT EXISTS estudio (
  id          text PRIMARY KEY,
  nombre      text,
  entrada     jsonb NOT NULL,
  resultado   jsonb NOT NULL,
  textos      jsonb NOT NULL DEFAULT '{}',
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now()
);
