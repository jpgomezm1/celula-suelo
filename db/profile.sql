-- Perfil por predio v2 (17 municipios): cruza cada predio con norma, valor del suelo, amenazas, protección,
-- construcciones y licencias. Lo que sale de una regla propia va en columnas *_inferid* o potencial_*.

DROP MATERIALIZED VIEW IF EXISTS parcel_profile;

CREATE OR REPLACE FUNCTION norm_txt(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;

CREATE MATERIALIZED VIEW parcel_profile AS
WITH p AS (
  SELECT p.id, p.municipio_dane, p.clave_local, p.clase, p.geom, ST_PointOnSurface(p.geom) AS pt,
         p.area_lote, p.tipo_lote, m.grupo, m.nombre AS municipio,
         coalesce(m.cobertura->>'pot_servicio', 'por_verificar') AS pot_servicio, m.cobertura->>'acuerdo_vigente' AS acuerdo_vigente
  FROM parcel p JOIN municipio m ON m.dane = p.municipio_dane
),
b AS (
  SELECT parcel_id, count(*) AS construcciones, sum(area_construida) AS area_construida,
         max(pisos) AS pisos_max, sum(huella_m2) AS huella
  FROM building WHERE parcel_id IS NOT NULL GROUP BY parcel_id
),
t AS (
  SELECT DISTINCT ON (p.id) p.id, z.attrs, z.fuente
  FROM p JOIN zoning_layer z ON z.capa = 'tratamiento' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.pt)
  ORDER BY p.id, ST_Area(z.geom)
),
n AS (
  -- Norma digitalizada: por código del polígono o, si no, por nombre del tratamiento.
  SELECT DISTINCT ON (t.id) t.id, nt.*
  FROM t JOIN p ON p.id = t.id
  JOIN norma_tratamiento nt ON nt.municipio_dane = p.municipio_dane
   AND (nt.codigo = t.attrs->>'codigo' OR norm_txt(nt.codigo) = norm_txt(t.attrs->>'tratamiento'))
  ORDER BY t.id, (nt.codigo = t.attrs->>'codigo') DESC
),
u AS (
  SELECT DISTINCT ON (p.id) p.id, z.attrs->>'uso' AS uso
  FROM p JOIN zoning_layer z ON z.capa = 'uso' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.pt)
  ORDER BY p.id, ST_Area(z.geom)
),
v AS (
  SELECT DISTINCT ON (p.id) p.id, (z.attrs->>'valor_m2')::numeric AS valor_suelo_m2,
         (z.attrs->>'vigencia')::numeric::int AS valor_vigencia, z.attrs->>'tipo_valor' AS valor_tipo
  FROM p JOIN zoning_layer z ON z.capa = 'valor_suelo' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.pt)
  ORDER BY p.id, ST_Area(z.geom)
),
a AS (
  SELECT p.id,
         array_agg(DISTINCT coalesce(z.attrs->>'tipo', 'amenaza') || ':' || coalesce(z.attrs->>'grado', 's/d')) AS amenazas,
         bool_or(z.attrs->>'grado' IN ('Alta', 'Muy Alta', 'No mitigable')) AS amenaza_alta
  FROM p JOIN zoning_layer z ON z.capa = 'amenaza' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.geom)
  GROUP BY p.id
),
r AS (
  SELECT p.id, array_agg(DISTINCT coalesce(z.attrs->>'categoria', z.subtipo, 'protección')) AS protecciones
  FROM p JOIN zoning_layer z ON z.capa = 'proteccion' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.geom)
  GROUP BY p.id
),
bc AS (
  SELECT DISTINCT ON (p.id) p.id, z.attrs->>'nombre' AS barrio_catastral
  FROM p JOIN zoning_layer z ON z.capa = 'barrio' AND z.municipio_dane = p.municipio_dane AND ST_Intersects(z.geom, p.pt)
  ORDER BY p.id, ST_Area(z.geom)
),
l AS (
  SELECT parcel_id AS id, count(*) AS licencias, max(anio) AS ultima_licencia FROM licence WHERE parcel_id IS NOT NULL GROUP BY parcel_id
),
base AS (
  SELECT
    p.id, p.municipio_dane, p.municipio, p.grupo, p.pot_servicio, p.acuerdo_vigente, p.clave_local, p.clase, p.geom, ST_Y(p.pt) AS lat, ST_X(p.pt) AS lon,
    p.tipo_lote, round(p.area_lote, 1) AS area_lote,
    COALESCE(b.construcciones, 0) AS construcciones,
    round(COALESCE(b.area_construida, 0), 1) AS area_construida,
    COALESCE(b.pisos_max, 0) AS pisos_max,
    round(COALESCE(b.huella, 0) / NULLIF(p.area_lote, 0), 2) AS ocupacion_actual,
    t.attrs->>'tratamiento' AS tratamiento,
    t.attrs->>'codigo' AS codigo_tratamiento,
    t.attrs->>'altura_texto' AS altura_texto,
    COALESCE((t.attrs->>'altura_max')::numeric, n.altura_max) AS altura_max,
    COALESCE((t.attrs->>'ic_max')::numeric, n.ic_max, n.ic_base) AS ic_max,
    COALESCE((t.attrs->>'ic_total')::numeric, CASE WHEN n.ic_base IS NOT NULL THEN n.ic_max END) AS ic_total,
    COALESCE((t.attrs->>'densidad_max')::numeric, n.densidad_max) AS densidad_max,
    COALESCE((t.attrs->>'io_max')::numeric, n.io_max) AS io_max,
    CASE
      WHEN t.attrs IS NULL THEN 'sin_tratamiento'
      WHEN t.attrs->>'norma_fuente' = 'servicio' THEN 'servicio'
      WHEN n.codigo IS NOT NULL THEN n.estado
      ELSE 'solo_codigo'
    END AS norma_fuente,
    n.acuerdo AS norma_acuerdo, n.articulo AS norma_articulo, n.url AS norma_url,
    u.uso,
    v.valor_suelo_m2, v.valor_vigencia, v.valor_tipo,
    COALESCE(a.amenazas, '{}') AS amenazas, COALESCE(a.amenaza_alta, false) AS amenaza_alta,
    COALESCE(r.protecciones, '{}') AS protecciones,
    bc.barrio_catastral,
    COALESCE(l.licencias, 0) AS licencias, l.ultima_licencia
  FROM p
  LEFT JOIN b ON b.parcel_id = p.id LEFT JOIN t ON t.id = p.id LEFT JOIN n ON n.id = p.id LEFT JOIN u ON u.id = p.id
  LEFT JOIN v ON v.id = p.id LEFT JOIN a ON a.id = p.id LEFT JOIN r ON r.id = p.id LEFT JOIN bc ON bc.id = p.id
  LEFT JOIN l ON l.id = p.id
),
calc AS (
  SELECT base.*,
    -- Área construible: por índice de construcción; si solo hay altura e índice de ocupación, altura × ocupación × lote.
    CASE
      WHEN ic_max > 0 THEN round(ic_max * area_lote, 0)
      WHEN altura_max > 0 AND io_max > 0 THEN round(altura_max * io_max * area_lote, 0)
    END AS area_construible_inferida,
    floor(densidad_max * area_lote / 10000) AS viviendas_max_inferidas,
    CASE WHEN altura_max IS NOT NULL THEN altura_max - pisos_max END AS brecha_pisos_inferida,
    -- Tipos que no se desarrollan: vías, espacio público, PH, condominios, quebradas, restringidos.
    (tipo_lote IS NULL OR (tipo_lote NOT IN ('V','S','Z','EP','C','BA','CQ','LR','CH','UP','E','T','B','CA','CC','CR','LM','PJ')
       AND tipo_lote NOT ILIKE 'PH%')) AS tipo_desarrollable
  FROM base
)
SELECT calc.*,
  GREATEST(area_construible_inferida - area_construida, 0) AS area_construible_restante_inferida,
  CASE WHEN area_construible_inferida > 0 THEN round(area_construida / area_construible_inferida, 2) END AS aprovechamiento_actual_inferido,
  CASE
    WHEN grupo = 'D' THEN 'catastro_y_mercado'
    WHEN pot_servicio = 'derogado' THEN 'tratamiento_de_pot_derogado'
    WHEN tratamiento IS NULL THEN 'sin_norma'
    WHEN norma_fuente = 'servicio' THEN 'norma_oficial'
    WHEN norma_fuente IN ('digitalizada_pendiente', 'validada') THEN 'norma_digitalizada'
    ELSE 'solo_tratamiento'
  END AS nivel_dato,
  (
    area_lote >= 800
    AND clase = 'U'
    AND tipo_desarrollable
    AND COALESCE(uso, '') NOT ILIKE 'Espacio Público%'
    AND NOT amenaza_alta
    AND cardinality(protecciones) = 0
    AND tratamiento IS NOT NULL
    AND pot_servicio <> 'derogado'
    AND norm_txt(tratamiento) NOT LIKE '%preservacion%'
    AND norm_txt(tratamiento) NOT LIKE '%proteccion%'
    AND (
      (area_construible_inferida > 0 AND area_construida < 0.4 * area_construible_inferida)
      OR (area_construible_inferida IS NULL AND altura_max IS NOT NULL AND altura_max - pisos_max >= 3)
      OR (construcciones = 0 AND (area_construible_inferida > 0 OR altura_max IS NOT NULL))
    )
  ) AS potencial_preliminar
FROM calc;

CREATE UNIQUE INDEX parcel_profile_id ON parcel_profile (id);
CREATE INDEX parcel_profile_geom ON parcel_profile USING gist (geom);
CREATE INDEX parcel_profile_mun ON parcel_profile (municipio_dane, potencial_preliminar);
CREATE INDEX parcel_profile_clave ON parcel_profile (clave_local);
