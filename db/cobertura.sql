-- Estado de la norma por municipio (verificado 2026-11-10 contra los acuerdos; ver data/normas/*.csv).
-- pot_servicio: vigente | derogado | por_verificar — si la capa de tratamientos publicada corresponde al POT en vigor.
UPDATE municipio SET cobertura = cobertura || v.c FROM (VALUES
  ('05001', '{"pot_servicio":"vigente","acuerdo_vigente":"Acuerdo 48 de 2014 (revisión de mediano plazo en curso)","norma_numerica":"servicio"}'::jsonb),
  ('05266', '{"pot_servicio":"por_verificar","acuerdo_vigente":"POT Envigado (capa con atributos 2018)","norma_numerica":"servicio"}'),
  ('05631', '{"pot_servicio":"por_verificar","acuerdo_vigente":"POT Sabaneta (capa IDEM)","norma_numerica":"servicio"}'),
  ('05079', '{"pot_servicio":"por_verificar","acuerdo_vigente":"POT Barbosa (capa IDEM)","norma_numerica":"servicio"}'),
  ('05308', '{"pot_servicio":"vigente","acuerdo_vigente":"Acuerdo 092 de 2007, Art. 169, Tabla 16 (vigencia 2026 por confirmar)","norma_numerica":"digitalizada"}'),
  ('05088', '{"pot_servicio":"vigente","acuerdo_vigente":"Acuerdo 033 de 2009 + Decreto 193 de 2011 (norma por franjas de intensidad, no por polígono)","norma_numerica":"no_aplica_por_poligono"}'),
  ('05360', '{"pot_servicio":"derogado","acuerdo_vigente":"Acuerdo 09 de 2023","nota":"La capa IDEM es del Acuerdo 020 de 2007; los polígonos 2023 no están publicados"}'),
  ('05380', '{"pot_servicio":"derogado","acuerdo_vigente":"Acuerdo 003 de 2023","nota":"La capa IDEM es del Acuerdo 042 de 2008"}'),
  ('05129', '{"pot_servicio":"derogado","acuerdo_vigente":"Acuerdo 002 de 2025","nota":"La capa IDEM es del Acuerdo 014 de 2010"}'),
  ('05212', '{"pot_servicio":"derogado","acuerdo_vigente":"Acuerdo 008 de 2023","nota":"La capa IDEM es del Acuerdo 025 de 2000"}'),
  ('05615', '{"pot_servicio":"sin_capa","nota":"Sin polígonos de tratamiento públicos"}'),
  ('05607', '{"pot_servicio":"sin_capa"}'), ('05376', '{"pot_servicio":"sin_capa"}'), ('05318', '{"pot_servicio":"sin_capa"}'),
  ('05440', '{"pot_servicio":"sin_capa"}'), ('05148', '{"pot_servicio":"sin_capa"}'), ('05400', '{"pot_servicio":"sin_capa"}')
) AS v(dane, c) WHERE municipio.dane = v.dane;
