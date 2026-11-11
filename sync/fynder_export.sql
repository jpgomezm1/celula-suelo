-- Vistas de exportación de Fynder para la célula (se aplican en la base de Fynder, proyecto Neon proyecto-cupido).
-- Reglas: ninguna tabla de Fynder se modifica; las vistas NO exponen datos personales ni enlaces a portales:
--   fuera: telefono, asesor, inmobiliaria, agente_*, contacto_responsable, grupo_origen, mensaje_original_grupo,
--          url, titulo_original, descripcion_original, descripcion, texto_pedido, mensaje_completo, user_id, grupo_id,
--          contactos de constructoras, motivo libre de cambios de precio.
-- El rol celula_reader solo tiene USAGE sobre este esquema y SELECT sobre estas vistas.

CREATE SCHEMA IF NOT EXISTS celula_export;

CREATE OR REPLACE VIEW celula_export.v_listing AS
SELECT
  p.id,
  COALESCE(NULLIF(p.ciudad, ''), f.ciudad, pb.municipio)                AS municipio_texto,
  COALESCE(NULLIF(p.zona, ''), f.barrio, b.nombre)                      AS barrio_texto,
  pb.barrio_id,
  b.comuna,
  COALESCE(NULLIF(f.tipo, ''), NULLIF(p.tipo_propiedad, ''))            AS tipo,
  COALESCE(NULLIF(f.negocio, ''), p.tipo_negocio)                       AS negocio,
  f.estado                                                              AS estado_inmueble,
  p.precio,
  COALESCE(NULLIF(p.area_construida, 0), f.area_m2)                     AS area,
  f.area_lote_m2,
  COALESCE(p.habitaciones, f.habitaciones)                              AS habitaciones,
  COALESCE(p.banos, f.banos)                                            AS banos,
  COALESCE(p.parqueaderos, f.parqueaderos)                              AS parqueaderos,
  COALESCE(p.estrato, f.estrato)                                        AS estrato,
  COALESCE(p.ano_construccion, f.ano_construccion)                      AS ano_construccion,
  p.administracion,
  p.titulo,
  p.latitud,
  p.longitud,
  COALESCE(p.ubicacion_aproximada, true)                                AS ubicacion_aproximada,
  p.activa,
  p.fuente                                                              AS portal,
  p.constructora_id,
  p.fecha_creacion,
  p.fecha_actualizacion,
  p.fecha_ultima_validacion
FROM propiedades p
LEFT JOIN propiedades_ficha f ON f.propiedad_id = p.id
LEFT JOIN propiedad_barrio pb ON pb.propiedad_id = p.id
LEFT JOIN barrios b ON b.id = pb.barrio_id
WHERE COALESCE(p.es_prueba, false) = false;

CREATE OR REPLACE VIEW celula_export.v_price_change AS
SELECT id, propiedad_id, precio_anterior, precio_nuevo, aplicado, origen, created_at
FROM cambios_precio;

CREATE OR REPLACE VIEW celula_export.v_listing_exit AS
SELECT propiedad_id, min(created_at) AS fecha_salida
FROM verificaciones_disponibilidad
WHERE veredicto = 'muerto'
GROUP BY propiedad_id;

CREATE OR REPLACE VIEW celula_export.v_barrio AS
SELECT id, municipio, municipio_clave, comuna, nombre, tipo, lat, lng
FROM barrios;

CREATE OR REPLACE VIEW celula_export.v_indice_mensual AS
SELECT mes, zona, nivel, municipio, activos, aptos, m2_p25, m2_mediana, m2_p75, var_m2_pct, nuevos, salieron, pedidos, suficiente
FROM indice_mensual;

CREATE OR REPLACE VIEW celula_export.v_huella AS
SELECT propiedad_id, grupo FROM propiedades_huella WHERE grupo IS NOT NULL;

CREATE OR REPLACE VIEW celula_export.v_demand AS
SELECT id, fecha_captura, presupuesto_estimado, estado, canal, criterios, criterios_at, barrio_ids
FROM pedidos;

CREATE OR REPLACE VIEW celula_export.v_constructora AS
SELECT id, nombre, nit, activa FROM constructoras;
