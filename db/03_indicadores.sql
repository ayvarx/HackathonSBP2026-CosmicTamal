-- =====================================================================
-- 03_indicadores.sql — Indicadores complementarios (NO sustituyen los rankings).
-- Saldo con mora, vencimientos, tasa promedio ponderada y concentración.
--
-- Todo se calcula sobre el UNIVERSO LOCAL VÁLIDO de cada período (filas con
-- filtro IS NULL en res_filas) y con NUMERIC exacto. Se puede ejecutar muchas
-- veces (CREATE OR REPLACE): lib/consultas-indicadores.js lo aplica solo
-- cuando el archivo cambió o cuando el motor (02) recreó sus vistas.
-- =====================================================================

-- Convierte texto a número de forma segura: lo que no sea un decimal válido cuenta 0.
-- (el archivo se guarda como texto tal cual llega; este paso evita que un valor sucio
-- rompa todo el cálculo).
CREATE OR REPLACE FUNCTION ind_num(t TEXT) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN t ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t::NUMERIC ELSE 0 END
$$;

-- ---------------------------------------------------------------------
-- 1) Una fila por préstamo válido, con sus tramos ya como número.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ind_filas WITH (security_invoker = true) AS
SELECT r.fecha, r.codigo_banco, r.macroactividad, r.saldo,
       ind_num(f.tasa_interes)                AS tasa,
       ind_num(f.dias_mora)                   AS dias_mora,
       ind_num(f.monto_por_vencer_30_dias)    AS pv_30,
       ind_num(f.monto_por_vencer_60_dias)    AS pv_60,
       ind_num(f.monto_por_vencer_90_dias)    AS pv_90,
       ind_num(f.monto_por_vencer_120_dias)   AS pv_120,
       ind_num(f.monto_por_vencer_180_dias)   AS pv_180,
       ind_num(f.monto_por_vencer_1_ano)      AS pv_1a,
       ind_num(f.monto_por_vencer_1_a_5_anos) AS pv_1_5a,
       ind_num(f.monto_por_vencer_5_a_10_anos) AS pv_5_10a,
       ind_num(f.monto_por_vencer_mas_10_anos) AS pv_10a,
       ind_num(f.monto_vencido_30_dias)       AS v_30,
       ind_num(f.monto_vencido_60_dias)       AS v_60,
       ind_num(f.monto_vencido_90_dias)       AS v_90,
       ind_num(f.monto_vencido_120_dias)      AS v_120,
       ind_num(f.monto_vencido_180_dias)      AS v_180,
       ind_num(f.monto_vencido_1_ano)         AS v_1a,
       ind_num(f.monto_vencido_mas_1_ano)     AS v_mas_1a
FROM res_filas r
JOIN at03_filas f ON f.id = r.id
WHERE r.filtro IS NULL;

-- ---------------------------------------------------------------------
-- 2) Cartera agregada en cuatro niveles (GROUPING SETS):
--    nivel 'banco_macro' (banco y actividad), 'banco' (total del banco),
--    'macro' (total del sistema por actividad) y 'sistema' (todo el período).
--    En cada nivel las columnas que no aplican quedan en NULL.
-- ---------------------------------------------------------------------
-- Se borra antes de recrearla porque sus columnas cambiaron (CREATE OR REPLACE
-- no puede quitar ni renombrar columnas de una vista).
DROP VIEW IF EXISTS v_ind_cartera CASCADE;
CREATE VIEW v_ind_cartera WITH (security_invoker = true) AS
WITH a AS (
  SELECT fecha, codigo_banco, macroactividad,
         CASE WHEN GROUPING(codigo_banco) = 0 AND GROUPING(macroactividad) = 0 THEN 'banco_macro'
              WHEN GROUPING(codigo_banco) = 0 THEN 'banco'
              WHEN GROUPING(macroactividad) = 0 THEN 'macro'
              ELSE 'sistema' END AS nivel,
         SUM(saldo)                                             AS saldo,
         COUNT(*)                                               AS operaciones,
         SUM(pv_30 + pv_60 + pv_90 + pv_120 + pv_180 + pv_1a + pv_1_5a + pv_5_10a + pv_10a) AS por_vencer,
         SUM(v_30 + v_60 + v_90 + v_120 + v_180 + v_1a + v_mas_1a)                         AS vencido,
         -- Misma base para los dos indicadores de mora: el SALDO de los préstamos
         -- con días de mora (> 0) y con mora grave (> 90), sobre el saldo total.
         SUM(CASE WHEN dias_mora > 0 THEN saldo ELSE 0 END)     AS saldo_mora,
         SUM(CASE WHEN dias_mora > 90 THEN saldo ELSE 0 END)    AS saldo_mora_90,
         COUNT(*) FILTER (WHERE dias_mora > 0)                  AS operaciones_morosas,
         SUM(tasa * saldo)                                      AS tasa_por_saldo,
         -- Comprobación del diccionario: Saldo = suma de los 16 tramos. Cuenta las filas que no cuadran.
         COUNT(*) FILTER (WHERE saldo <> pv_30 + pv_60 + pv_90 + pv_120 + pv_180 + pv_1a + pv_1_5a + pv_5_10a + pv_10a
                                         + v_30 + v_60 + v_90 + v_120 + v_180 + v_1a + v_mas_1a) AS filas_descuadradas,
         SUM(pv_30) AS pv_30, SUM(pv_60) AS pv_60, SUM(pv_90) AS pv_90, SUM(pv_120) AS pv_120,
         SUM(pv_180) AS pv_180, SUM(pv_1a) AS pv_1a, SUM(pv_1_5a) AS pv_1_5a,
         SUM(pv_5_10a) AS pv_5_10a, SUM(pv_10a) AS pv_10a,
         SUM(v_30) AS v_30, SUM(v_60) AS v_60, SUM(v_90) AS v_90, SUM(v_120) AS v_120,
         SUM(v_180) AS v_180, SUM(v_1a) AS v_1a, SUM(v_mas_1a) AS v_mas_1a
  FROM v_ind_filas
  GROUP BY GROUPING SETS ((fecha, codigo_banco, macroactividad), (fecha, codigo_banco),
                          (fecha, macroactividad), (fecha))
)
SELECT a.fecha, a.nivel, a.codigo_banco, b.nombre_ficticio AS banco, a.macroactividad,
       a.saldo::NUMERIC(24,2)               AS saldo,
       a.operaciones::INTEGER               AS operaciones,
       a.por_vencer::NUMERIC(24,2)          AS por_vencer,
       a.vencido::NUMERIC(24,2)             AS vencido,
       -- Saldo con mora (> 0 días) / saldo, en %, 4 decimales.
       a.saldo_mora::NUMERIC(24,2)          AS saldo_mora,
       CASE WHEN a.saldo > 0 THEN ROUND(a.saldo_mora * 100 / a.saldo, 4) ELSE 0 END::NUMERIC(12,4)     AS mora_pct,
       -- Saldo con mora mayor a 90 días / saldo (misma base).
       a.saldo_mora_90::NUMERIC(24,2)       AS saldo_mora_90,
       CASE WHEN a.saldo > 0 THEN ROUND(a.saldo_mora_90 * 100 / a.saldo, 4) ELSE 0 END::NUMERIC(12,4)  AS mora_90_pct,
       a.operaciones_morosas::INTEGER       AS operaciones_morosas,
       -- Tasa promedio ponderada por saldo = Σ(tasa × saldo) / Σ saldo.
       CASE WHEN a.saldo > 0 THEN ROUND(a.tasa_por_saldo / a.saldo, 4) ELSE 0 END::NUMERIC(12,4)       AS tasa_ponderada,
       a.filas_descuadradas::INTEGER        AS filas_descuadradas,
       a.pv_30::NUMERIC(24,2) AS pv_30, a.pv_60::NUMERIC(24,2) AS pv_60, a.pv_90::NUMERIC(24,2) AS pv_90,
       a.pv_120::NUMERIC(24,2) AS pv_120, a.pv_180::NUMERIC(24,2) AS pv_180, a.pv_1a::NUMERIC(24,2) AS pv_1a,
       a.pv_1_5a::NUMERIC(24,2) AS pv_1_5a, a.pv_5_10a::NUMERIC(24,2) AS pv_5_10a, a.pv_10a::NUMERIC(24,2) AS pv_10a,
       a.v_30::NUMERIC(24,2) AS v_30, a.v_60::NUMERIC(24,2) AS v_60, a.v_90::NUMERIC(24,2) AS v_90,
       a.v_120::NUMERIC(24,2) AS v_120, a.v_180::NUMERIC(24,2) AS v_180, a.v_1a::NUMERIC(24,2) AS v_1a,
       a.v_mas_1a::NUMERIC(24,2) AS v_mas_1a
FROM a
LEFT JOIN bancos b ON b.codigo_banco = a.codigo_banco;

-- Resultado materializado de la cartera (como res_* del motor): recorrer los
-- 86 mil préstamos en cada consulta tardaría segundos. ind_recalcular() la llena
-- y lib/consultas-indicadores.js la llama cuando cambian los cortes cargados.
DROP TABLE IF EXISTS res_ind_cartera CASCADE;
CREATE TABLE res_ind_cartera AS SELECT * FROM v_ind_cartera WITH NO DATA;
CREATE INDEX res_ind_cartera_idx ON res_ind_cartera (fecha, nivel, codigo_banco, macroactividad);
ALTER TABLE res_ind_cartera ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION ind_recalcular() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE res_ind_cartera;
  INSERT INTO res_ind_cartera SELECT * FROM v_ind_cartera;
  ANALYZE res_ind_cartera;
END;
$$;

-- ---------------------------------------------------------------------
-- 3) Participación de mercado por ranking (a partir de res_rankings).
--    participación = saldo del banco en la actividad / saldo de todos los
--    bancos en esa actividad. (No es la "ponderación" del reto, que divide
--    entre la cartera total del propio banco.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ind_participacion WITH (security_invoker = true) AS
SELECT fecha, ranking, posicion, codigo_banco, banco, saldo_actividad AS saldo,
       CASE WHEN SUM(saldo_actividad) OVER w > 0
            THEN ROUND(saldo_actividad * 100 / SUM(saldo_actividad) OVER w, 4) ELSE 0 END::NUMERIC(12,4) AS participacion_pct
FROM res_rankings
WINDOW w AS (PARTITION BY fecha, ranking);

-- ---------------------------------------------------------------------
-- 4) Concentración del mercado por ranking.
--    HHI = Σ (participación en %)²  (0 a 10 000). Se calcula con la
--    participación SIN redondear. Top 3 = participación de los 3 mayores.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ind_concentracion WITH (security_invoker = true) AS
WITH t AS (
  SELECT fecha, ranking, SUM(saldo_actividad) AS total FROM res_rankings GROUP BY fecha, ranking
)
SELECT r.fecha, r.ranking, t.total::NUMERIC(24,2) AS saldo_total,
       CASE WHEN t.total > 0
            THEN ROUND(SUM((r.saldo_actividad * 100 / t.total) ^ 2), 2) ELSE 0 END::NUMERIC(12,2) AS hhi,
       CASE WHEN t.total > 0
            THEN ROUND(SUM(r.saldo_actividad) FILTER (WHERE r.posicion <= 3) * 100 / t.total, 4) ELSE 0 END::NUMERIC(12,4) AS top3_pct,
       -- Umbrales usuales del HHI (escala 0-10 000): < 1 500 baja, 1 500-2 500 moderada, > 2 500 alta.
       CASE WHEN t.total <= 0 THEN 'Sin saldo'
            WHEN SUM((r.saldo_actividad * 100 / t.total) ^ 2) < 1500 THEN 'Baja'
            WHEN SUM((r.saldo_actividad * 100 / t.total) ^ 2) <= 2500 THEN 'Moderada'
            ELSE 'Alta' END AS nivel_concentracion,
       MAX(r.banco) FILTER (WHERE r.posicion = 1) AS lider
FROM res_rankings r
JOIN t ON t.fecha = r.fecha AND t.ranking = r.ranking
GROUP BY r.fecha, r.ranking, t.total;

-- ---------------------------------------------------------------------
-- 5) Concentración de la cartera de cada banco por macroactividad.
--    HHI propio = Σ (peso de cada macroactividad en la cartera del banco, %)².
--    Un valor cercano a 10 000 = todo el crédito en una sola actividad.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ind_concentracion_banco WITH (security_invoker = true) AS
WITH bm AS (
  SELECT fecha, codigo_banco, banco, macroactividad, saldo FROM res_ind_cartera WHERE nivel = 'banco_macro'
),
tb AS (
  SELECT fecha, codigo_banco, SUM(saldo) AS total FROM bm GROUP BY fecha, codigo_banco
)
SELECT bm.fecha, bm.codigo_banco, MAX(bm.banco) AS banco, tb.total::NUMERIC(24,2) AS saldo_total,
       CASE WHEN tb.total > 0 THEN ROUND(SUM((bm.saldo * 100 / tb.total) ^ 2), 2) ELSE 0 END::NUMERIC(12,2) AS hhi_cartera,
       (ARRAY_AGG(bm.macroactividad ORDER BY bm.saldo DESC, bm.macroactividad))[1] AS macro_principal,
       CASE WHEN tb.total > 0 THEN ROUND(MAX(bm.saldo) * 100 / tb.total, 4) ELSE 0 END::NUMERIC(12,4) AS peso_macro_principal_pct
FROM bm JOIN tb ON tb.fecha = bm.fecha AND tb.codigo_banco = bm.codigo_banco
GROUP BY bm.fecha, bm.codigo_banco, tb.total;

-- Acceso: igual que el motor, sin permisos para la API pública de Supabase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON v_ind_filas, v_ind_cartera, res_ind_cartera, v_ind_participacion, v_ind_concentracion, v_ind_concentracion_banco FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ind_num(TEXT) FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ind_recalcular() FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
