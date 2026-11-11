-- Los 17 municipios del alcance. grupo: A completo, B numérico, C solo código (norma digitalizada), D Oriente.
INSERT INTO municipio (dane, nombre, region, grupo) VALUES
  ('05001', 'Medellín',             'Valle de Aburrá', 'A'),
  ('05266', 'Envigado',             'Valle de Aburrá', 'B'),
  ('05631', 'Sabaneta',             'Valle de Aburrá', 'B'),
  ('05079', 'Barbosa',              'Valle de Aburrá', 'B'),
  ('05360', 'Itagüí',               'Valle de Aburrá', 'C'),
  ('05088', 'Bello',                'Valle de Aburrá', 'C'),
  ('05380', 'La Estrella',          'Valle de Aburrá', 'C'),
  ('05129', 'Caldas',               'Valle de Aburrá', 'C'),
  ('05212', 'Copacabana',           'Valle de Aburrá', 'C'),
  ('05308', 'Girardota',            'Valle de Aburrá', 'C'),
  ('05615', 'Rionegro',             'Oriente',         'D'),
  ('05607', 'El Retiro',            'Oriente',         'D'),
  ('05376', 'La Ceja',              'Oriente',         'D'),
  ('05318', 'Guarne',               'Oriente',         'D'),
  ('05440', 'Marinilla',            'Oriente',         'D'),
  ('05148', 'El Carmen de Viboral', 'Oriente',         'D'),
  ('05400', 'La Unión',             'Oriente',         'D')
ON CONFLICT (dane) DO UPDATE SET nombre = EXCLUDED.nombre, region = EXCLUDED.region, grupo = EXCLUDED.grupo;
