-- Señales del lote a partir de los actos registrados en su folio principal (IGAC vía Croma, 2015–2023).
-- Son inferencias para priorizar contacto, no conclusiones jurídicas: lo definitivo es el certificado de tradición.

CREATE OR REPLACE VIEW parcel_senales AS
WITH folio AS (
  SELECT DISTINCT ON (parcel_id) parcel_id, matricula, registro
  FROM parcel_folio WHERE registro IS NOT NULL
  ORDER BY parcel_id, por_derecho DESC NULLS LAST
),
a AS (
  SELECT f.parcel_id, f.registro, fa.*
  FROM folio f JOIN folio_act fa ON fa.registro = f.registro
)
SELECT
  f.parcel_id, f.matricula, f.registro,
  min(a.folio_abierto) AS folio_abierto,
  count(a.id) AS actos_2015_2023,
  max(a.fecha) FILTER (WHERE a.act_code IN (125, 126, 307, 308)) AS ultima_compraventa,
  (array_agg(a.valor ORDER BY a.fecha DESC) FILTER (WHERE a.act_code IN (125, 126, 307, 308) AND a.valor > 0))[1] AS valor_ultima_compraventa,
  max(a.fecha) FILTER (WHERE a.act_code IN (109, 301, 197)) AS sucesion,
  count(*) FILTER (WHERE a.act_code IN (301, 307, 374, 430)) > 0 AS derechos_de_cuota,
  max(a.fecha) FILTER (WHERE a.acto ILIKE 'EMBARGO%') AS ultimo_embargo,
  max(a.fecha) FILTER (WHERE a.act_code IN (841, 842, 843)) AS ultima_cancelacion,
  string_agg(DISTINCT a.acto, '; ') FILTER (WHERE a.acto ILIKE 'EMBARGO%') AS embargos,
  count(*) FILTER (WHERE a.act_code IN (219, 205)) > 0 AS hipoteca,
  count(*) FILTER (WHERE a.act_code IN (118, 374, 907, 139, 143)) > 0 AS señal_empresa,
  count(*) FILTER (WHERE a.act_code IN (128, 189, 164)) > 0 AS fiducia,
  count(*) FILTER (WHERE a.act_code IN (920, 913, 143)) > 0 AS loteo_o_englobe,
  count(*) FILTER (WHERE a.act_code IN (412, 492)) > 0 AS litigio,
  count(*) FILTER (WHERE a.act_code = 455) > 0 AS oferta_compra_publica,
  count(*) FILTER (WHERE a.act_code = 129) > 0 AS dacion_en_pago
FROM folio f LEFT JOIN a ON a.parcel_id = f.parcel_id
GROUP BY f.parcel_id, f.matricula, f.registro;
