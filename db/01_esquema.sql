-- =====================================================================
-- 01_esquema.sql — Tablas de la plataforma de rankings de crédito.
-- Se puede ejecutar muchas veces: todo usa IF NOT EXISTS (idempotente).
-- Corre igual en Supabase (Postgres 15+) y en PGlite (Postgres embebido).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogos de referencia (se cargan desde datos/*.csv).
-- Los códigos son TEXTO: así se conservan los ceros a la izquierda ('07').
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bancos (
  codigo_banco     TEXT PRIMARY KEY,
  nombre_ficticio  TEXT NOT NULL,
  tipo_licencia    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogo_cinu (
  codigo_cinu             TEXT PRIMARY KEY,   -- llave de cruce con AT03.Tipo_Actividad
  descripcion             TEXT NOT NULL,
  macroactividad_reto     TEXT NOT NULL,      -- nombre del ranking (HIPOTECARIO, ...)
  subactividad_reto       TEXT NOT NULL,
  codigo_sb08_referencia  TEXT NOT NULL       -- solo referencial: NO es llave (2103 se repite)
);

CREATE TABLE IF NOT EXISTS tabla_sb21 (
  codigo       TEXT PRIMARY KEY,              -- facilidad crediticia ('01'..'07')
  descripcion  TEXT NOT NULL,
  uso_en_reto  TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Cortes cargados: un registro por archivo AT03 subido.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cortes (
  id          SERIAL PRIMARY KEY,
  archivo     TEXT NOT NULL,
  sha256      TEXT NOT NULL,                  -- huella del archivo, para trazabilidad
  filas       INTEGER NOT NULL,
  periodos    TEXT NOT NULL,                  -- valores de Fecha del archivo (normalmente uno)
  cargado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  perfil      TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Filas AT03 tal cual llegan (61 columnas como TEXTO) + trazabilidad.
-- El período de cada fila es la columna fecha, no el nombre del archivo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS at03_filas (
  id            BIGSERIAL PRIMARY KEY,
  corte_id      INTEGER NOT NULL REFERENCES cortes(id) ON DELETE CASCADE,
  archivo       TEXT NOT NULL,
  -- Número de línea física dentro del archivo, igual que control_exclusiones.csv:
  -- el encabezado es la línea 1, así que la primera fila de datos es la 2.
  fila_archivo  INTEGER NOT NULL,
  fecha                                TEXT NOT NULL,
  codigo_banco                         TEXT NOT NULL,
  codigo_subsidiaria                   TEXT NOT NULL,
  preferencial_no_preferencial         TEXT NOT NULL,
  aplica_feci                          TEXT NOT NULL,
  tipo_credito                         TEXT NOT NULL,
  facilidad_crediticia                 TEXT NOT NULL,
  clasificacion_prestamo               TEXT NOT NULL,
  destino                              TEXT NOT NULL,
  codigo_region                        TEXT NOT NULL,
  id_cliente                           TEXT NOT NULL,
  tamano_empresa                       TEXT NOT NULL,
  genero                               TEXT NOT NULL,
  numero_prestamo                      TEXT NOT NULL,
  nombre_cliente                       TEXT NOT NULL,
  id_grupo_economico                   TEXT NOT NULL,
  tipo_relacion                        TEXT NOT NULL,
  tipo_actividad                       TEXT NOT NULL,
  tasa_interes                         TEXT NOT NULL,
  valor_inicial                        TEXT NOT NULL,
  intereses_por_cobrar                 TEXT NOT NULL,
  fecha_inicial_prestamo               TEXT NOT NULL,
  fecha_vencimiento                    TEXT NOT NULL,
  fecha_refinanciamiento               TEXT NOT NULL,
  fecha_restructuracion                TEXT NOT NULL,
  numero_facilidad_anterior            TEXT NOT NULL,
  primera_garantia                     TEXT NOT NULL,
  valor_primera_garantia               TEXT NOT NULL,
  segunda_garantia                     TEXT NOT NULL,
  valor_segunda_garantia               TEXT NOT NULL,
  provision                            TEXT NOT NULL,
  provision_niif                       TEXT NOT NULL,
  provision_complementaria_no_niif     TEXT NOT NULL,
  saldo_texto                          TEXT NOT NULL,   -- columna "Saldo" del archivo, sin tocar
  cantidad_cuotas_por_vencer           TEXT NOT NULL,
  monto_por_vencer_30_dias             TEXT NOT NULL,
  monto_por_vencer_60_dias             TEXT NOT NULL,
  monto_por_vencer_90_dias             TEXT NOT NULL,
  monto_por_vencer_120_dias            TEXT NOT NULL,
  monto_por_vencer_180_dias            TEXT NOT NULL,
  monto_por_vencer_1_ano               TEXT NOT NULL,
  monto_por_vencer_1_a_5_anos          TEXT NOT NULL,
  monto_por_vencer_5_a_10_anos         TEXT NOT NULL,
  monto_por_vencer_mas_10_anos         TEXT NOT NULL,
  cantidad_cuotas_vencidas             TEXT NOT NULL,
  monto_vencido_30_dias                TEXT NOT NULL,
  monto_vencido_60_dias                TEXT NOT NULL,
  monto_vencido_90_dias                TEXT NOT NULL,
  monto_vencido_120_dias               TEXT NOT NULL,
  monto_vencido_180_dias               TEXT NOT NULL,
  monto_vencido_1_ano                  TEXT NOT NULL,
  monto_vencido_mas_1_ano              TEXT NOT NULL,
  fecha_proximo_pago_capital           TEXT NOT NULL,
  periodicidad_pago_capital            TEXT NOT NULL,
  fecha_proximo_pago_interes           TEXT NOT NULL,
  periodicidad_pago_intereses          TEXT NOT NULL,
  dias_mora                            TEXT NOT NULL,
  perfil_vencimiento                   TEXT NOT NULL,
  monto_cuota_pagar                    TEXT NOT NULL,
  metodologia_calculo_intereses        TEXT NOT NULL,
  categoria_cambio                     TEXT NOT NULL,
  -- Saldo como número decimal EXACTO (NUMERIC, nunca punto flotante).
  -- Se deriva del texto automáticamente: nadie lo escribe a mano.
  saldo NUMERIC(20,2) GENERATED ALWAYS AS (saldo_texto::NUMERIC(20,2)) STORED
);

CREATE INDEX IF NOT EXISTS at03_fecha_idx        ON at03_filas (fecha);
CREATE INDEX IF NOT EXISTS at03_prestamo_idx     ON at03_filas (fecha, numero_prestamo);
CREATE INDEX IF NOT EXISTS at03_banco_idx        ON at03_filas (codigo_banco);
CREATE INDEX IF NOT EXISTS at03_actividad_idx    ON at03_filas (tipo_actividad);
CREATE INDEX IF NOT EXISTS at03_corte_idx        ON at03_filas (corte_id);

-- ---------------------------------------------------------------------
-- Parámetros configurables (la regla de "movimiento significativo" NO
-- está fija en el código: el administrador la cambia desde la aplicación).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros (
  clave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  descripcion     TEXT NOT NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por TEXT NOT NULL DEFAULT 'sistema'
);

INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('min_cambio_posicion', '2',
   'Un banco tiene movimiento significativo si sube o baja al menos esta cantidad de posiciones (|Cambio_Posicion| >= valor).'),
  ('marcar_cambio_lider', 'si',
   'Si vale "si", todo cambio de líder (posición 1) se marca como significativo.'),
  ('min_var_saldo_pct', '10',
   'Un banco tiene movimiento significativo si su saldo varía al menos este porcentaje (|Var_Saldo_Pct| >= valor).')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- Bitácora: registro básico de operaciones (qué se cargó, quién y cuándo).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bitacora (
  id           BIGSERIAL PRIMARY KEY,
  momento      TIMESTAMPTZ NOT NULL DEFAULT now(),
  perfil       TEXT NOT NULL,
  operacion    TEXT NOT NULL,
  detalle      TEXT NOT NULL,
  resultado    TEXT NOT NULL,                 -- 'ok' o 'error'
  duracion_ms  INTEGER
);
CREATE INDEX IF NOT EXISTS bitacora_momento_idx ON bitacora (momento DESC);

-- Versión aplicada del motor (para no recrearlo en cada arranque).
CREATE TABLE IF NOT EXISTS meta (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Seguridad para Supabase: RLS activo y SIN políticas. La aplicación se
-- conecta como el rol dueño (que no está sujeto a RLS), mientras que la
-- API pública de Supabase (roles anon/authenticated) no ve ninguna fila.
-- ---------------------------------------------------------------------
ALTER TABLE bancos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_cinu  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabla_sb21     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE at03_filas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta           ENABLE ROW LEVEL SECURITY;
