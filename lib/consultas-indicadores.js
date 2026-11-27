// lib/consultas-indicadores.js — Consultas de los indicadores complementarios.
// Los cálculos viven en SQL (db/03_indicadores.sql); aquí solo se leen.
// Los montos y porcentajes llegan como TEXTO (NUMERIC exacto); no se suman en JavaScript.
// Solo para el servidor.

import crypto from 'node:crypto';
import { consulta, ejecutarScript, leerArchivoProyecto } from './db.js';

// ---------------------------------------------------------------------
// Preparación de los indicadores (db/03_indicadores.sql).
// db.js solo aplica 01 y 02; el 03 se aplica aquí, y se recalcula la tabla
// res_ind_cartera cuando:
//   * el archivo 03 cambió o el motor (02) borró las vistas (se vuelve a aplicar), o
//   * cambiaron los cortes cargados (nuevo corte, reemplazo, recálculo del motor).
// ---------------------------------------------------------------------
async function preparar() {
  const sql = leerArchivoProyecto('db/03_indicadores.sql');
  const huella = crypto.createHash('sha256').update(sql).digest('hex');
  const [{ existe, estado }] = await consulta(
    `SELECT to_regclass('v_ind_cartera') IS NOT NULL AS existe,
            (SELECT COALESCE(MAX(id), 0) || ':' || COUNT(*) FROM cortes) || ':' ||
            (SELECT COUNT(*) FROM res_filas) AS estado`,
  );
  const meta = Object.fromEntries(
    (await consulta("SELECT clave, valor FROM meta WHERE clave IN ('version_indicadores', 'estado_indicadores')"))
      .map((f) => [f.clave, f.valor]),
  );
  const aplicarSql = !existe || meta.version_indicadores !== huella;
  if (!aplicarSql && meta.estado_indicadores === estado) return;
  if (aplicarSql) await ejecutarScript(sql);
  await consulta('SELECT ind_recalcular()');
  for (const [clave, valor] of [['version_indicadores', huella], ['estado_indicadores', estado]]) {
    await consulta(
      `INSERT INTO meta (clave, valor) VALUES ($1, $2)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [clave, valor],
    );
  }
}

/** Garantiza que las vistas y la tabla de indicadores estén al día (una preparación a la vez). */
async function asegurar() {
  // Si ya hay una preparación en curso (consultas simultáneas), se espera esa misma.
  if (!globalThis.__indicadoresPendiente) {
    globalThis.__indicadoresPendiente = preparar().finally(() => { globalThis.__indicadoresPendiente = undefined; });
  }
  await globalThis.__indicadoresPendiente;
}

/** Períodos cargados (AAAAMMDD), del más antiguo al más reciente. */
export async function periodosDisponibles() {
  await asegurar();
  const filas = await consulta('SELECT DISTINCT fecha FROM res_filas ORDER BY fecha');
  return filas.map((f) => f.fecha);
}

/** Bancos para el filtro: [{codigo_banco, nombre}]. */
export async function bancosDisponibles() {
  await asegurar();
  return consulta('SELECT codigo_banco, nombre_ficticio AS nombre FROM bancos ORDER BY codigo_banco');
}

const COLUMNAS_CARTERA = `fecha, nivel, codigo_banco, banco, macroactividad,
  saldo::text AS saldo, operaciones, por_vencer::text AS por_vencer, vencido::text AS vencido,
  saldo_mora::text AS saldo_mora, mora_pct::text AS mora_pct, saldo_mora_90::text AS saldo_mora_90, mora_90_pct::text AS mora_90_pct,
  operaciones_morosas, tasa_ponderada::text AS tasa_ponderada, filas_descuadradas`;

/**
 * Indicadores de la cartera elegida: sin filtros = todo el sistema; con banco = ese banco;
 * con ranking = esa actividad en todo el sistema; con ambos = el banco en esa actividad.
 * @returns {Promise<null | {fecha, nivel, codigo_banco, banco, macroactividad, saldo, operaciones,
 *   por_vencer, vencido, saldo_mora, mora_pct, saldo_mora_90, mora_90_pct, operaciones_morosas,
 *   tasa_ponderada, filas_descuadradas}>} null si no hay datos (p. ej. banco sin cartera en esa actividad).
 */
export async function indicadorCartera({ fecha, banco, ranking }) {
  await asegurar();
  const nivel = banco && ranking ? 'banco_macro' : banco ? 'banco' : ranking ? 'macro' : 'sistema';
  const filas = await consulta(
    `SELECT ${COLUMNAS_CARTERA} FROM res_ind_cartera
     WHERE fecha = $1 AND nivel = $2
       AND ($3::text IS NULL OR codigo_banco = $3) AND ($4::text IS NULL OR macroactividad = $4)`,
    [fecha, nivel, banco || null, ranking || null],
  );
  return filas[0] || null;
}

/**
 * Tabla por banco (o por banco dentro de un ranking si se indica `ranking`), ordenada por saldo.
 * @returns {Promise<object[]>} mismas columnas que indicadorCartera.
 */
export async function carteraPorBanco({ fecha, ranking }) {
  await asegurar();
  return consulta(
    `SELECT ${COLUMNAS_CARTERA} FROM res_ind_cartera
     WHERE fecha = $1 AND nivel = $2 AND ($3::text IS NULL OR macroactividad = $3)
     ORDER BY saldo DESC, codigo_banco`,
    [fecha, ranking ? 'banco_macro' : 'banco', ranking || null],
  );
}

/** Tabla por macroactividad (todo el sistema), ordenada por saldo. */
export async function carteraPorActividad({ fecha }) {
  await asegurar();
  return consulta(
    `SELECT ${COLUMNAS_CARTERA} FROM res_ind_cartera WHERE fecha = $1 AND nivel = 'macro'
     ORDER BY saldo DESC, macroactividad`,
    [fecha],
  );
}

/**
 * Mapa de calor: ponderación (%) de cada banco en cada macroactividad (la misma de los rankings)
 * junto con su saldo.
 * @returns {Promise<{codigo_banco, banco, ranking, saldo, ponderacion_pct}[]>}
 */
export async function matrizBancoActividad({ fecha }) {
  await asegurar();
  return consulta(
    `SELECT codigo_banco, banco, ranking, saldo_actividad::text AS saldo, ponderacion_pct::text AS ponderacion_pct
     FROM res_rankings WHERE fecha = $1 ORDER BY codigo_banco, ranking`,
    [fecha],
  );
}

/**
 * Concentración del mercado por ranking (HHI y participación de los 3 mayores).
 * @returns {Promise<{ranking, saldo_total, hhi, top3_pct, nivel_concentracion, lider}[]>}
 */
export async function concentracionPorRanking({ fecha, ranking }) {
  await asegurar();
  return consulta(
    `SELECT ranking, saldo_total::text AS saldo_total, hhi::text AS hhi, top3_pct::text AS top3_pct,
            nivel_concentracion, lider
     FROM v_ind_concentracion WHERE fecha = $1 AND ($2::text IS NULL OR ranking = $2)`,
    [fecha, ranking || null],
  );
}

/** Participación de cada banco en un ranking: [{posicion, codigo_banco, banco, saldo, participacion_pct}]. */
export async function participacionEnRanking({ fecha, ranking }) {
  await asegurar();
  return consulta(
    `SELECT posicion, codigo_banco, banco, saldo::text AS saldo, participacion_pct::text AS participacion_pct
     FROM v_ind_participacion WHERE fecha = $1 AND ranking = $2 ORDER BY posicion`,
    [fecha, ranking],
  );
}

/** Concentración de la cartera de cada banco entre las 6 macroactividades. */
export async function concentracionPorBanco({ fecha, banco }) {
  await asegurar();
  return consulta(
    `SELECT codigo_banco, banco, saldo_total::text AS saldo_total, hhi_cartera::text AS hhi_cartera,
            macro_principal, peso_macro_principal_pct::text AS peso_macro_principal_pct
     FROM v_ind_concentracion_banco WHERE fecha = $1 AND ($2::text IS NULL OR codigo_banco = $2)
     ORDER BY hhi_cartera DESC, codigo_banco`,
    [fecha, banco || null],
  );
}

/** Etiquetas de los 16 tramos, en orden de plazo. */
export const TRAMOS = [
  { clave: 'pv_30', tipo: 'Por vencer', etiqueta: '0 a 30 días' },
  { clave: 'pv_60', tipo: 'Por vencer', etiqueta: '31 a 60 días' },
  { clave: 'pv_90', tipo: 'Por vencer', etiqueta: '61 a 90 días' },
  { clave: 'pv_120', tipo: 'Por vencer', etiqueta: '91 a 120 días' },
  { clave: 'pv_180', tipo: 'Por vencer', etiqueta: '121 a 180 días' },
  { clave: 'pv_1a', tipo: 'Por vencer', etiqueta: '181 a 365 días' },
  { clave: 'pv_1_5a', tipo: 'Por vencer', etiqueta: '1 a 5 años' },
  { clave: 'pv_5_10a', tipo: 'Por vencer', etiqueta: '5 a 10 años' },
  { clave: 'pv_10a', tipo: 'Por vencer', etiqueta: 'Más de 10 años' },
  { clave: 'v_30', tipo: 'Vencido', etiqueta: '1 a 30 días de atraso' },
  { clave: 'v_60', tipo: 'Vencido', etiqueta: '31 a 60 días de atraso' },
  { clave: 'v_90', tipo: 'Vencido', etiqueta: '61 a 90 días de atraso' },
  { clave: 'v_120', tipo: 'Vencido', etiqueta: '91 a 120 días de atraso' },
  { clave: 'v_180', tipo: 'Vencido', etiqueta: '121 a 180 días de atraso' },
  { clave: 'v_1a', tipo: 'Vencido', etiqueta: '181 a 365 días de atraso' },
  { clave: 'v_mas_1a', tipo: 'Vencido', etiqueta: 'Más de 1 año de atraso' },
];

/**
 * Escalera de vencimientos de la cartera elegida (mismos filtros que indicadorCartera).
 * @returns {Promise<{clave, tipo, etiqueta, monto, pct_saldo}[]>} 16 tramos; monto como texto.
 */
export async function escaleraVencimientos({ fecha, banco, ranking }) {
  await asegurar();
  const nivel = banco && ranking ? 'banco_macro' : banco ? 'banco' : ranking ? 'macro' : 'sistema';
  const columnas = TRAMOS.map((t) => `('${t.clave}', c.${t.clave})`).join(', ');
  const filas = await consulta(
    `SELECT t.clave, t.monto::text AS monto,
            CASE WHEN c.saldo > 0 THEN ROUND(t.monto * 100 / c.saldo, 4) ELSE 0 END::text AS pct_saldo
     FROM res_ind_cartera c
     CROSS JOIN LATERAL (VALUES ${columnas}) AS t(clave, monto)
     WHERE c.fecha = $1 AND c.nivel = $2
       AND ($3::text IS NULL OR c.codigo_banco = $3) AND ($4::text IS NULL OR c.macroactividad = $4)`,
    [fecha, nivel, banco || null, ranking || null],
  );
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  return TRAMOS.map((t) => ({
    ...t,
    monto: porClave.get(t.clave)?.monto ?? '0.00',
    pct_saldo: porClave.get(t.clave)?.pct_saldo ?? '0',
  }));
}

/**
 * Evolución del saldo con mora y de la tasa a lo largo de los períodos cargados (mismos filtros).
 * @returns {Promise<{fecha, saldo, saldo_mora, mora_pct, saldo_mora_90, mora_90_pct, tasa_ponderada}[]>}
 */
export async function evolucionIndicadores({ banco, ranking }) {
  await asegurar();
  const nivel = banco && ranking ? 'banco_macro' : banco ? 'banco' : ranking ? 'macro' : 'sistema';
  return consulta(
    `SELECT fecha, saldo::text AS saldo, saldo_mora::text AS saldo_mora, mora_pct::text AS mora_pct,
            saldo_mora_90::text AS saldo_mora_90, mora_90_pct::text AS mora_90_pct, tasa_ponderada::text AS tasa_ponderada
     FROM res_ind_cartera
     WHERE nivel = $1 AND ($2::text IS NULL OR codigo_banco = $2) AND ($3::text IS NULL OR macroactividad = $3)
     ORDER BY fecha`,
    [nivel, banco || null, ranking || null],
  );
}

/**
 * Perfil de vencimiento de cada banco agrupado en 5 bloques, como % de su saldo
 * (la suma de los 5 bloques es 100 %). Se calcula en SQL con NUMERIC.
 * Con `ranking` se limita a esa actividad.
 * @returns {Promise<{codigo_banco, banco, saldo, hasta_1a, de_1_a_5a, mas_5a, vencido_hasta_90, vencido_mas_90}[]>}
 */
export async function vencimientosPorBanco({ fecha, ranking }) {
  await asegurar();
  const pct = (suma) => `CASE WHEN saldo > 0 THEN ROUND((${suma}) * 100 / saldo, 4) ELSE 0 END::text`;
  return consulta(
    `SELECT codigo_banco, banco, saldo::text AS saldo,
            ${pct('pv_30 + pv_60 + pv_90 + pv_120 + pv_180 + pv_1a')} AS hasta_1a,
            ${pct('pv_1_5a')} AS de_1_a_5a,
            ${pct('pv_5_10a + pv_10a')} AS mas_5a,
            ${pct('v_30 + v_60 + v_90')} AS vencido_hasta_90,
            ${pct('v_120 + v_180 + v_1a + v_mas_1a')} AS vencido_mas_90
     FROM res_ind_cartera
     WHERE fecha = $1 AND nivel = $2 AND ($3::text IS NULL OR macroactividad = $3)
     ORDER BY codigo_banco`,
    [fecha, ranking ? 'banco_macro' : 'banco', ranking || null],
  );
}
