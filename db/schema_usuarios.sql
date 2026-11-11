-- Usuarios del workspace y del MCP (inicio de sesión con correo y clave). La clave se guarda como hash scrypt.
CREATE TABLE IF NOT EXISTS app_usuario (
  email          text PRIMARY KEY,
  nombre         text,
  clave_hash     text NOT NULL,
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  ultimo_ingreso timestamptz
);
