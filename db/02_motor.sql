-- =====================================================================
-- 02_motor.sql — EL MOTOR DE RANKINGS, escrito en SQL.
--
-- Todo el cálculo sale de la tabla at03_filas (las filas tal cual se
-- cargaron) y de los catálogos. No hay ningún saldo, porcentaje ni
-- posición escritos a mano (regla R2): si se carga un período nuevo,
-- basta con llamar a recalcular() y todo se vuelve a calcular.
--
-- Organización:
--   v_*    = vistas con la lógica, regla por regla (lo que hay que leer).
--   res_*  = tablas con el resultado de esas vistas ya calculado
--            (materialización). Se llenan con recalcular() después de cada
--            carga, para que la aplicación responda en milisegundos.
--
-- Dinero: siempre NUMERIC (decimal exacto), nunca punto flotante.
-- Las vistas usan security_invoker (Postgres 15+): se ejecutan con los
-- permisos de quien consulta, así la API pública de Supabase no ve nada.
-- Este archivo se puede volver a ejecutar: primero borra el motor anterior.
-- =====================================================================

DROP FUNCTION IF EXISTS recalcular();
DROP VIEW  IF EXISTS v_descomposicion, v_alertas, v_reconciliaciones, v_movimientos,
                     v_rankings, v_subactividades, v_calidad, v_universo,
                     v_exclusiones, v_periodos, v_cascada CASCADE;
DROP TABLE IF EXISTS res_descomposicion, res_calidad, res_rankings,
                     res_subactividades, res_filas CASCADE;

-- ---------------------------------------------------------------------
-- 1) CASCADA E1 → E4 y CLASIFICACIÓN, fila por fila.
-- Cada fila recibe el PRIMER filtro que incumple (o NULL si es válida),
-- así ninguna fila excluida se cuenta dos veces.
-- ---------------------------------------------------------------------
CREATE VIEW v_cascada WITH (security_invoker = true) AS
WITH numeradas AS (
  SELECT f.*,
         -- E1: se numeran las apariciones de cada préstamo DENTRO DE CADA
         -- PERÍODO (Fecha), en el orden de filas del archivo. La primera
         -- aparición (1) se conserva; las siguientes son duplicados.
         -- Un préstamo que aparece en julio y en agosto NO es duplicado.
         ROW_NUMBER() OVER (PARTITION BY f.fecha, f.numero_prestamo
                            ORDER BY f.corte_id, f.fila_archivo) AS ocurrencia
  FROM at03_filas f
)
SELECT n.id,
       n.fecha,
       n.archivo,
       n.fila_archivo,
       n.numero_prestamo,
       n.codigo_banco,
       n.destino,
       n.saldo,
       n.tipo_actividad,
       n.facilidad_crediticia,
       n.ocurrencia::INTEGER                 AS ocurrencia,
       (c.codigo_cinu IS NOT NULL)           AS en_catalogo,
       CASE
         WHEN n.ocurrencia > 1          THEN 'E1'  -- duplicado dentro del período
         WHEN n.destino <> 'L'          THEN 'E2'  -- destino extranjero (comparación exacta)
         WHEN n.saldo <= 0              THEN 'E3'  -- saldo cero o negativo
         WHEN c.codigo_cinu IS NULL     THEN 'E4'  -- actividad que no está en el catálogo CINU
         ELSE NULL                                 -- fila del universo local válido
       END                                   AS filtro,
       -- Clasificación: Tipo_Actividad = Codigo_CINU (nunca Codigo_SB08).
       c.macroactividad_reto                 AS macroactividad,
       -- Regla especial SB21 (Sección 6): un CINU de "Credito personal" con
       -- Facilidad '07' (tarjeta de crédito) es en realidad una tarjeta, así
       -- que pasa a la subactividad "Tarjeta". Solo mueve saldo DENTRO de
       -- CONSUMO; la macroactividad no cambia.
       CASE
         WHEN c.macroactividad_reto = 'CONSUMO'
          AND c.subactividad_reto   = 'Credito personal'
          AND n.facilidad_crediticia = '07'
         THEN 'Tarjeta'
         ELSE c.subactividad_reto
       END                                   AS subactividad
FROM numeradas n
LEFT JOIN catalogo_cinu c ON c.codigo_cinu = n.tipo_actividad;

-- Resultado materializado de la cascada (lo llena recalcular()).
CREATE TABLE res_filas (
  id                    BIGINT PRIMARY KEY,
  fecha                 TEXT NOT NULL,
  archivo               TEXT NOT NULL,
  fila_archivo          INTEGER NOT NULL,
  numero_prestamo       TEXT NOT NULL,
  codigo_banco          TEXT NOT NULL,
  destino               TEXT NOT NULL,
  saldo                 NUMERIC(20,2) NOT NULL,
  tipo_actividad        TEXT NOT NULL,
  facilidad_crediticia  TEXT NOT NULL,
  ocurrencia            INTEGER NOT NULL,
  en_catalogo           BOOLEAN NOT NULL,
  filtro                TEXT,
  macroactividad        TEXT,
  subactividad          TEXT
);
CREATE INDEX res_filas_fecha_filtro_idx ON res_filas (fecha, filtro);
CREATE INDEX res_filas_ranking_idx      ON res_filas (fecha, macroactividad, codigo_banco);

-- Períodos cargados (valores distintos de Fecha).
CREATE VIEW v_periodos WITH (security_invoker = true) AS
SELECT DISTINCT fecha FROM res_filas;

-- ---------------------------------------------------------------------
-- 2) EXCLUSIONES: lista trazable de cada fila excluida y su motivo.
-- ---------------------------------------------------------------------
CREATE VIEW v_exclusiones WITH (security_invoker = true) AS
SELECT r.fecha,
       r.archivo,
       r.fila_archivo,
       r.numero_prestamo,
       r.filtro,
       CASE r.filtro
         WHEN 'E1' THEN 'Duplicado: el préstamo ya apareció antes en este período'
         WHEN 'E2' THEN 'Destino extranjero (Destino distinto de L)'
         WHEN 'E3' THEN 'Saldo cero o negativo'
         WHEN 'E4' THEN 'Actividad no catalogada en CINU/SB109'
       END AS motivo,
       r.codigo_banco,
       r.destino,
       r.saldo,
       r.tipo_actividad
FROM res_filas r
WHERE r.filtro IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) UNIVERSO LOCAL VÁLIDO: lo que queda después de E4, ya clasificado.
-- ---------------------------------------------------------------------
CREATE VIEW v_universo WITH (security_invoker = true) AS
SELECT r.id, r.fecha, r.archivo, r.fila_archivo, r.numero_prestamo,
       r.codigo_banco, r.saldo, r.tipo_actividad, r.facilidad_crediticia,
       r.macroactividad, r.subactividad
FROM res_filas r
WHERE r.filtro IS NULL;

-- ---------------------------------------------------------------------
-- 4) CALIDAD por período (mismas columnas que control_calidad.csv).
-- Los conteos E1–E4 son EN CASCADA. Los "indep_*" son conteos
-- independientes de cada regla sobre TODAS las filas leídas (una fila
-- puede contar en varios); se muestran aparte y rotulados como tales.
-- ---------------------------------------------------------------------
CREATE VIEW v_calidad WITH (security_invoker = true) AS
SELECT r.fecha,
       COUNT(*)::INTEGER                                        AS filas_leidas,
       COUNT(*) FILTER (WHERE r.filtro = 'E1')::INTEGER          AS e1_duplicados,
       COUNT(*) FILTER (WHERE r.filtro = 'E2')::INTEGER          AS e2_destino_extranjero,
       COUNT(*) FILTER (WHERE r.filtro = 'E3')::INTEGER          AS e3_saldo_no_positivo,
       COUNT(*) FILTER (WHERE r.filtro = 'E4')::INTEGER          AS e4_actividad_no_catalogada,
       COUNT(*) FILTER (WHERE r.filtro IS NULL)::INTEGER         AS universo_local_valido,
       COALESCE(SUM(r.saldo) FILTER (WHERE r.filtro IS NULL), 0)::NUMERIC(20,2)
                                                                 AS saldo_universo_local_valido,
       -- Control: filas leídas = E1 + E2 + E3 + E4 + universo local válido.
       CASE WHEN COUNT(*) = COUNT(*) FILTER (WHERE r.filtro IN ('E1','E2','E3','E4'))
                          + COUNT(*) FILTER (WHERE r.filtro IS NULL)
            THEN 'SI' ELSE 'NO' END                              AS cuadre_cascada,
       COUNT(*) FILTER (WHERE r.ocurrencia > 1)::INTEGER         AS indep_duplicados,
       COUNT(*) FILTER (WHERE r.destino <> 'L')::INTEGER         AS indep_destino_extranjero,
       COUNT(*) FILTER (WHERE r.saldo <= 0)::INTEGER             AS indep_saldo_no_positivo,
       COUNT(*) FILTER (WHERE NOT r.en_catalogo)::INTEGER        AS indep_actividad_no_catalogada,
       -- Alertas de integridad referencial: filas con banco o facilidad que
       -- no existen en su catálogo. Se reportan, pero NO excluyen la fila.
       COUNT(*) FILTER (
         WHERE NOT EXISTS (SELECT 1 FROM bancos b WHERE b.codigo_banco = r.codigo_banco)
            OR NOT EXISTS (SELECT 1 FROM tabla_sb21 s WHERE s.codigo = r.facilidad_crediticia)
       )::INTEGER                                                AS alertas_integridad
FROM res_filas r
GROUP BY r.fecha;

-- ---------------------------------------------------------------------
-- 5) SUBACTIVIDADES: 22 subactividades × 12 bancos por período.
-- Paso 5 de la Sección 4: Saldo_Subactividad = SUM(Saldo). La rejilla
-- completa (CROSS JOIN) garantiza que un banco sin saldo aparezca con 0.00.
-- ---------------------------------------------------------------------
CREATE VIEW v_subactividades WITH (security_invoker = true) AS
WITH sumas AS (
  SELECT fecha, macroactividad, subactividad, codigo_banco,
         SUM(saldo) AS saldo, COUNT(*) AS operaciones
  FROM v_universo
  GROUP BY fecha, macroactividad, subactividad, codigo_banco
),
subactividades AS (
  SELECT DISTINCT macroactividad_reto AS ranking, subactividad_reto AS subactividad
  FROM catalogo_cinu
)
SELECT p.fecha,
       s.ranking,
       s.subactividad,
       b.codigo_banco,
       b.nombre_ficticio                               AS banco,
       COALESCE(x.saldo, 0)::NUMERIC(20,2)             AS saldo,
       COALESCE(x.operaciones, 0)::INTEGER             AS operaciones
FROM v_periodos p
CROSS JOIN subactividades s
CROSS JOIN bancos b
LEFT JOIN sumas x
       ON x.fecha = p.fecha AND x.macroactividad = s.ranking
      AND x.subactividad = s.subactividad AND x.codigo_banco = b.codigo_banco;

CREATE TABLE res_subactividades AS SELECT * FROM v_subactividades WITH NO DATA;
CREATE INDEX res_sub_idx ON res_subactividades (fecha, ranking, codigo_banco);

-- ---------------------------------------------------------------------
-- 6) RANKINGS: 6 rankings × 12 bancos por período.
-- ---------------------------------------------------------------------
CREATE VIEW v_rankings WITH (security_invoker = true) AS
WITH por_actividad AS (
  -- Paso 6: Saldo_Actividad_Banco por Fecha + Macroactividad + Banco.
  SELECT fecha, macroactividad, codigo_banco,
         SUM(saldo) AS saldo, COUNT(*) AS operaciones
  FROM v_universo
  GROUP BY fecha, macroactividad, codigo_banco
),
cartera AS (
  -- Paso 7: el denominador es TODO el universo local válido del banco en
  -- el período (las 6 macroactividades). Nunca se calcula después de
  -- filtrar por ranking.
  SELECT fecha, codigo_banco, SUM(saldo) AS total
  FROM v_universo
  GROUP BY fecha, codigo_banco
),
rejilla AS (
  -- Cada ranking incluye siempre los 12 bancos (0.00 si no tienen saldo).
  SELECT p.fecha, m.ranking, b.codigo_banco, b.nombre_ficticio AS banco,
         COALESCE(a.saldo, 0)::NUMERIC(20,2)  AS saldo_actividad,
         COALESCE(c.total, 0)::NUMERIC(20,2)  AS total_cartera_local_valida,
         COALESCE(a.operaciones, 0)::INTEGER  AS operaciones_validas
  FROM v_periodos p
  CROSS JOIN (SELECT DISTINCT macroactividad_reto AS ranking FROM catalogo_cinu) m
  CROSS JOIN bancos b
  LEFT JOIN por_actividad a
         ON a.fecha = p.fecha AND a.macroactividad = m.ranking AND a.codigo_banco = b.codigo_banco
  LEFT JOIN cartera c
         ON c.fecha = p.fecha AND c.codigo_banco = b.codigo_banco
)
SELECT fecha,
       ranking,
       -- Paso 9: mayor saldo = posición 1; empate exacto -> Codigo_Banco ascendente.
       ROW_NUMBER() OVER (PARTITION BY fecha, ranking
                          ORDER BY saldo_actividad DESC, codigo_banco ASC)::INTEGER AS posicion,
       codigo_banco,
       banco,
       saldo_actividad,
       total_cartera_local_valida,
       -- Paso 8: ponderación en %, redondeo aritmético a 4 decimales
       -- (ROUND de NUMERIC redondea la mitad alejándose de cero).
       CASE WHEN total_cartera_local_valida > 0
            THEN ROUND(saldo_actividad * 100 / total_cartera_local_valida, 4)
            ELSE 0 END::NUMERIC(9,4)                                         AS ponderacion_pct,
       operaciones_validas
FROM rejilla;

CREATE TABLE res_rankings AS SELECT * FROM v_rankings WITH NO DATA;
CREATE INDEX res_rankings_idx ON res_rankings (fecha, ranking, posicion);

-- ---------------------------------------------------------------------
-- 7) MOVIMIENTOS entre TODOS los pares de períodos (anterior < actual),
-- consecutivos y no consecutivos (mismas columnas que control_movimientos.csv).
-- ---------------------------------------------------------------------
CREATE VIEW v_movimientos WITH (security_invoker = true) AS
SELECT a.fecha                                   AS fecha_anterior,
       b.fecha                                   AS fecha_actual,
       b.ranking,
       b.codigo_banco,
       b.banco,
       a.posicion                                AS posicion_anterior,
       b.posicion                                AS posicion_actual,
       -- Positivo = el banco SUBE; negativo = BAJA; 0 = se mantiene.
       (a.posicion - b.posicion)::INTEGER        AS cambio_posicion,
       a.saldo_actividad                         AS saldo_anterior,
       b.saldo_actividad                         AS saldo_actual,
       (b.saldo_actividad - a.saldo_actividad)::NUMERIC(20,2) AS var_saldo,
       -- Sin saldo anterior no hay porcentaje (división entre cero): NULL.
       CASE WHEN a.saldo_actividad <> 0
            THEN ROUND((b.saldo_actividad - a.saldo_actividad) * 100 / a.saldo_actividad, 4)
       END::NUMERIC(14,4)                        AS var_saldo_pct,
       -- Cambio de líder: se marca en el banco que gana el primer lugar y en
       -- el que lo pierde.
       CASE WHEN (a.posicion = 1 OR b.posicion = 1) AND a.posicion <> b.posicion
            THEN 'SI' ELSE 'NO' END              AS cambio_de_lider,
       -- Consecutivos = no hay ningún período cargado entre los dos.
       NOT EXISTS (SELECT 1 FROM v_periodos p
                   WHERE p.fecha > a.fecha AND p.fecha < b.fecha) AS consecutivos
FROM res_rankings a
JOIN res_rankings b
  ON b.ranking = a.ranking AND b.codigo_banco = a.codigo_banco AND b.fecha > a.fecha;

-- ---------------------------------------------------------------------
-- 8) RECONCILIACIONES (Sección 7). Diferencia = esperado − obtenido.
--   1: por banco, ranking y período, Σ Saldo_Subactividad = Saldo_Actividad_Banco.
--   2: por banco y período, Σ de las 6 actividades = Total_Cartera_Local_Valida.
--   3: por período, Σ Total_Cartera de los 12 bancos = Σ Saldo del universo.
-- ---------------------------------------------------------------------
CREATE VIEW v_reconciliaciones WITH (security_invoker = true) AS
SELECT r.fecha, 1 AS reconciliacion, r.ranking, r.codigo_banco,
       r.saldo_actividad AS esperado,
       s.suma           AS obtenido,
       (r.saldo_actividad - s.suma)::NUMERIC(20,2) AS diferencia,
       CASE WHEN r.saldo_actividad = s.suma THEN 'SI' ELSE 'NO' END AS cuadra
FROM res_rankings r
JOIN (SELECT fecha, ranking, codigo_banco, SUM(saldo)::NUMERIC(20,2) AS suma
      FROM res_subactividades GROUP BY fecha, ranking, codigo_banco) s
  ON s.fecha = r.fecha AND s.ranking = r.ranking AND s.codigo_banco = r.codigo_banco
UNION ALL
SELECT fecha, 2, NULL, codigo_banco,
       MAX(total_cartera_local_valida),
       SUM(saldo_actividad)::NUMERIC(20,2),
       (MAX(total_cartera_local_valida) - SUM(saldo_actividad))::NUMERIC(20,2),
       CASE WHEN MAX(total_cartera_local_valida) = SUM(saldo_actividad)
             AND MIN(total_cartera_local_valida) = MAX(total_cartera_local_valida)
            THEN 'SI' ELSE 'NO' END
FROM res_rankings
GROUP BY fecha, codigo_banco
UNION ALL
SELECT t.fecha, 3, NULL, NULL,
       u.suma,
       t.suma,
       (u.suma - t.suma)::NUMERIC(20,2),
       CASE WHEN u.suma = t.suma THEN 'SI' ELSE 'NO' END
FROM (SELECT fecha, SUM(total)::NUMERIC(20,2) AS suma
      FROM (SELECT DISTINCT fecha, codigo_banco, total_cartera_local_valida AS total
            FROM res_rankings) x
      GROUP BY fecha) t
JOIN (SELECT fecha, SUM(saldo)::NUMERIC(20,2) AS suma
      FROM res_filas WHERE filtro IS NULL GROUP BY fecha) u
  ON u.fecha = t.fecha;

-- ---------------------------------------------------------------------
-- 9) ALERTAS de calidad (no excluyen filas; solo se reportan).
--   * Integridad referencial: banco o facilidad que no existen en su catálogo.
--   * Coherencia SB21 sobre el universo válido: CINU Tarjeta debe venir con
--     facilidad '07' y CINU Automóvil con '03'. Si no, se alerta y se
--     mantiene la subactividad del catálogo CINU.
-- ---------------------------------------------------------------------
CREATE VIEW v_alertas WITH (security_invoker = true) AS
SELECT r.fecha, 'BANCO_NO_CATALOGADO' AS tipo, r.archivo, r.fila_archivo,
       r.numero_prestamo, r.codigo_banco, r.codigo_banco AS valor,
       'El Codigo_Banco no existe en Bancos_ficticios.csv' AS detalle
FROM res_filas r
WHERE NOT EXISTS (SELECT 1 FROM bancos b WHERE b.codigo_banco = r.codigo_banco)
UNION ALL
SELECT r.fecha, 'FACILIDAD_NO_CATALOGADA', r.archivo, r.fila_archivo,
       r.numero_prestamo, r.codigo_banco, r.facilidad_crediticia,
       'La Facilidad_Crediticia no existe en Tabla_SB21_simplificada.csv'
FROM res_filas r
WHERE NOT EXISTS (SELECT 1 FROM tabla_sb21 s WHERE s.codigo = r.facilidad_crediticia)
UNION ALL
SELECT r.fecha, 'TARJETA_SIN_FACILIDAD_07', r.archivo, r.fila_archivo,
       r.numero_prestamo, r.codigo_banco, r.facilidad_crediticia,
       'CINU de Tarjeta con facilidad distinta de 07 (se mantiene como Tarjeta)'
FROM res_filas r
JOIN catalogo_cinu c ON c.codigo_cinu = r.tipo_actividad
WHERE r.filtro IS NULL AND c.macroactividad_reto = 'CONSUMO'
  AND c.subactividad_reto = 'Tarjeta' AND r.facilidad_crediticia <> '07'
UNION ALL
SELECT r.fecha, 'AUTOMOVIL_SIN_FACILIDAD_03', r.archivo, r.fila_archivo,
       r.numero_prestamo, r.codigo_banco, r.facilidad_crediticia,
       'CINU de Automovil con facilidad distinta de 03 (se mantiene como Automovil)'
FROM res_filas r
JOIN catalogo_cinu c ON c.codigo_cinu = r.tipo_actividad
WHERE r.filtro IS NULL AND c.macroactividad_reto = 'CONSUMO'
  AND c.subactividad_reto = 'Automovil' AND r.facilidad_crediticia <> '03';

-- ---------------------------------------------------------------------
-- 10) DESCOMPOSICIÓN de la variación de saldo entre dos períodos, por
-- ranking y banco. Se sigue cada préstamo por su Numero_Prestamo:
--   saldo_nuevos       = saldo actual de préstamos que no estaban antes (+)
--   saldo_salidos      = − saldo anterior de préstamos que ya no están (−)
--   variacion_continuan= Σ (saldo actual − saldo anterior) de los que siguen
--                        (amortización o crecimiento)
-- Las tres partes suman exactamente var_saldo.
-- ---------------------------------------------------------------------
CREATE VIEW v_descomposicion WITH (security_invoker = true) AS
WITH pares AS (
  SELECT a.fecha AS fecha_anterior, b.fecha AS fecha_actual
  FROM v_periodos a JOIN v_periodos b ON b.fecha > a.fecha
),
partes AS (
  SELECT p.fecha_anterior, p.fecha_actual, d.ranking, d.codigo_banco,
         d.saldo_nuevos, d.saldo_salidos, d.variacion_continuan,
         d.prestamos_nuevos, d.prestamos_salidos, d.prestamos_continuan
  FROM pares p
  CROSS JOIN LATERAL (
    SELECT COALESCE(x.macroactividad, y.macroactividad)                 AS ranking,
           COALESCE(x.codigo_banco, y.codigo_banco)                     AS codigo_banco,
           COALESCE(SUM(y.saldo) FILTER (WHERE x.id IS NULL), 0)        AS saldo_nuevos,
           -COALESCE(SUM(x.saldo) FILTER (WHERE y.id IS NULL), 0)       AS saldo_salidos,
           COALESCE(SUM(y.saldo - x.saldo)
                    FILTER (WHERE x.id IS NOT NULL AND y.id IS NOT NULL), 0) AS variacion_continuan,
           COUNT(*) FILTER (WHERE x.id IS NULL)                         AS prestamos_nuevos,
           COUNT(*) FILTER (WHERE y.id IS NULL)                         AS prestamos_salidos,
           COUNT(*) FILTER (WHERE x.id IS NOT NULL AND y.id IS NOT NULL) AS prestamos_continuan
    FROM (SELECT id, numero_prestamo, macroactividad, codigo_banco, saldo
          FROM res_filas WHERE filtro IS NULL AND fecha = p.fecha_anterior) x
    FULL JOIN
         (SELECT id, numero_prestamo, macroactividad, codigo_banco, saldo
          FROM res_filas WHERE filtro IS NULL AND fecha = p.fecha_actual) y
      ON y.numero_prestamo = x.numero_prestamo
     AND y.macroactividad  = x.macroactividad
     AND y.codigo_banco    = x.codigo_banco
    GROUP BY 1, 2
  ) d
)
SELECT m.fecha_anterior, m.fecha_actual, m.ranking, m.codigo_banco, m.banco,
       m.var_saldo,
       COALESCE(pt.saldo_nuevos, 0)::NUMERIC(20,2)        AS saldo_nuevos,
       COALESCE(pt.saldo_salidos, 0)::NUMERIC(20,2)       AS saldo_salidos,
       COALESCE(pt.variacion_continuan, 0)::NUMERIC(20,2) AS variacion_continuan,
       COALESCE(pt.prestamos_nuevos, 0)::INTEGER          AS prestamos_nuevos,
       COALESCE(pt.prestamos_salidos, 0)::INTEGER         AS prestamos_salidos,
       COALESCE(pt.prestamos_continuan, 0)::INTEGER       AS prestamos_continuan
FROM v_movimientos m
LEFT JOIN partes pt
       ON pt.fecha_anterior = m.fecha_anterior AND pt.fecha_actual = m.fecha_actual
      AND pt.ranking = m.ranking AND pt.codigo_banco = m.codigo_banco;

CREATE TABLE res_descomposicion AS SELECT * FROM v_descomposicion WITH NO DATA;
CREATE TABLE res_calidad        AS SELECT * FROM v_calidad        WITH NO DATA;

-- ---------------------------------------------------------------------
-- recalcular(): vuelve a calcular TODO desde at03_filas. La ingesta la
-- llama después de cada carga; por eso un período nuevo se procesa sin
-- tocar el código. El orden importa: cada paso usa el resultado anterior.
-- ---------------------------------------------------------------------
CREATE FUNCTION recalcular() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE res_filas, res_subactividades, res_rankings, res_descomposicion, res_calidad;
  INSERT INTO res_filas          SELECT * FROM v_cascada;
  ANALYZE res_filas;
  INSERT INTO res_subactividades SELECT * FROM v_subactividades;
  INSERT INTO res_rankings       SELECT * FROM v_rankings;
  INSERT INTO res_calidad        SELECT * FROM v_calidad;
  INSERT INTO res_descomposicion SELECT * FROM v_descomposicion;
END;
$$;

-- RLS también en las tablas de resultados (sin políticas).
ALTER TABLE res_filas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE res_subactividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE res_rankings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE res_descomposicion ENABLE ROW LEVEL SECURITY;
ALTER TABLE res_calidad        ENABLE ROW LEVEL SECURITY;

-- En Supabase existen los roles de la API pública (anon, authenticated):
-- se les quita todo permiso sobre tablas, vistas y la función. En PGlite
-- esos roles no existen y este bloque no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION recalcular() FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
