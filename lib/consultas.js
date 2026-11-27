// lib/consultas.js — La ÚNICA puerta de la interfaz a los datos.
//
// Cada función lee los resultados que calculó el motor SQL (db/02_motor.sql).
// Aquí no se calcula ningún ranking: solo se filtra y se ordena.
//
// Convenciones de lo que devuelven TODAS las funciones:
//   * Montos (saldo_*, var_saldo, total_*): TEXTO con 2 decimales, p. ej. "87562053.92".
//     No los sume ni compare con Number: para mostrarlos use lib/formato.js.
//   * Porcentajes (ponderacion_pct, var_saldo_pct): TEXTO con 4 decimales, p. ej. "19.5397".
//   * Conteos y posiciones: Number.
//   * Fechas de período: TEXTO 'AAAAMMDD' (p. ej. "20260930").
//   * Nombres de campos en minúsculas con guion bajo; COLUMNAS_EXPORTACION da
//     el encabezado oficial de cada entregable (Fecha, Ranking, Posicion, ...).
// Solo para el servidor (Server Components, Server Actions, Route Handlers).

import { consulta } from './db.js';

/**
 * Los 6 rankings, en el orden en que se muestran.
 * tipo: 'obligatorio' | 'recomendado' | 'bonus' (Sección 5 de las indicaciones).
 * @type {{clave: string, nombre: string, tipo: string}[]}
 */
export const RANKINGS = [
  { clave: 'HIPOTECARIO', nombre: 'Hipotecario', tipo: 'obligatorio' },
  { clave: 'CONSTRUCCION', nombre: 'Construcción', tipo: 'obligatorio' },
  { clave: 'INDUSTRIA', nombre: 'Industria', tipo: 'obligatorio' },
  { clave: 'AGROPECUARIO', nombre: 'Agropecuario', tipo: 'obligatorio' },
  { clave: 'COMERCIO', nombre: 'Comercio', tipo: 'recomendado' },
  { clave: 'CONSUMO', nombre: 'Consumo', tipo: 'bonus' },
];
const ORDEN_RANKINGS = RANKINGS.map((r) => r.clave);

/** Filtros de la cascada de exclusión. */
export const FILTROS = [
  { clave: 'E1', nombre: 'Duplicados' },
  { clave: 'E2', nombre: 'Destino extranjero' },
  { clave: 'E3', nombre: 'Saldo no positivo' },
  { clave: 'E4', nombre: 'Actividad no catalogada' },
];

/** Fuente y aviso que toda pantalla debe mostrar. */
export const FUENTE = 'Fuente: registros sintéticos AT03 (Hackathon SBP 2026) y catálogos CINU/SB109, SB21 y bancos ficticios.';
export const AVISO_DATOS_FICTICIOS = 'Datos 100% ficticios: no representan bancos, clientes ni la estructura real del sistema bancario panameño.';

/**
 * Encabezados oficiales de cada exportación: pares [campo_devuelto, Encabezado_CSV].
 * Úselos para generar los CSV de los entregables 2 a 5 con los nombres exactos.
 */
export const COLUMNAS_EXPORTACION = {
  rankings: [['fecha', 'Fecha'], ['ranking', 'Ranking'], ['posicion', 'Posicion'], ['codigo_banco', 'Codigo_Banco'], ['banco', 'Banco'], ['saldo_actividad', 'Saldo_Actividad'], ['total_cartera_local_valida', 'Total_Cartera_Local_Valida'], ['ponderacion_pct', 'Ponderacion_Pct'], ['operaciones_validas', 'Operaciones_Validas']],
  subactividades: [['fecha', 'Fecha'], ['ranking', 'Ranking'], ['subactividad', 'Subactividad'], ['codigo_banco', 'Codigo_Banco'], ['saldo', 'Saldo']],
  calidad: [['fecha', 'Fecha'], ['filas_leidas', 'Filas_Leidas'], ['e1_duplicados', 'E1_Duplicados'], ['e2_destino_extranjero', 'E2_Destino_Extranjero'], ['e3_saldo_no_positivo', 'E3_Saldo_No_Positivo'], ['e4_actividad_no_catalogada', 'E4_Actividad_No_Catalogada'], ['universo_local_valido', 'Universo_Local_Valido'], ['saldo_universo_local_valido', 'Saldo_Universo_Local_Valido'], ['cuadre_cascada', 'Cuadre_Cascada'], ['indep_duplicados', 'Indep_Duplicados'], ['indep_destino_extranjero', 'Indep_Destino_Extranjero'], ['indep_saldo_no_positivo', 'Indep_Saldo_No_Positivo'], ['indep_actividad_no_catalogada', 'Indep_Actividad_No_Catalogada'], ['alertas_integridad', 'Alertas_Integridad']],
  movimientos: [['fecha_anterior', 'Fecha_Anterior'], ['fecha_actual', 'Fecha_Actual'], ['ranking', 'Ranking'], ['codigo_banco', 'Codigo_Banco'], ['banco', 'Banco'], ['posicion_anterior', 'Posicion_Anterior'], ['posicion_actual', 'Posicion_Actual'], ['cambio_posicion', 'Cambio_Posicion'], ['saldo_anterior', 'Saldo_Anterior'], ['saldo_actual', 'Saldo_Actual'], ['var_saldo', 'Var_Saldo'], ['var_saldo_pct', 'Var_Saldo_Pct'], ['cambio_de_lider', 'Cambio_De_Lider'], ['significativo', 'Significativo'], ['motivo', 'Motivo']],
  exclusiones: [['fecha', 'Fecha'], ['archivo', 'Archivo'], ['fila_archivo', 'Fila_Archivo'], ['numero_prestamo', 'Numero_Prestamo'], ['filtro', 'Filtro'], ['codigo_banco', 'Codigo_Banco'], ['destino', 'Destino'], ['saldo', 'Saldo'], ['tipo_actividad', 'Tipo_Actividad']],
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '20260930' -> 'Septiembre 2026'. */
export function etiquetaPeriodo(fecha) {
  if (!/^\d{8}$/.test(fecha || '')) return fecha || '';
  const mes = MESES[Number(fecha.slice(4, 6)) - 1] || '';
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${fecha.slice(0, 4)}`;
}

// Paginación segura: página >= 1 y tamaño entre 1 y 100,000 (100,000 sirve para exportar todo).
function paginar(pagina, tamano, porDefecto = 50) {
  const p = Math.max(1, Number.parseInt(pagina, 10) || 1);
  const t = Math.min(100000, Math.max(1, Number.parseInt(tamano, 10) || porDefecto));
  return { pagina: p, tamano: t, desplazamiento: (p - 1) * t };
}

/** Período más reciente cargado (o null si no hay ninguno). */
async function ultimoPeriodo() {
  const [fila] = await consulta('SELECT MAX(fecha) AS fecha FROM res_calidad');
  return fila?.fecha ?? null;
}

/**
 * Registra una operación en la bitácora.
 * @param {{perfil: string, operacion: string, detalle: string, resultado: 'ok'|'error', duracion_ms?: number}} entrada
 */
export async function registrarBitacora({ perfil, operacion, detalle, resultado, duracion_ms = null }) {
  await consulta(
    'INSERT INTO bitacora (perfil, operacion, detalle, resultado, duracion_ms) VALUES ($1, $2, $3, $4, $5)',
    [perfil, operacion, detalle, resultado, duracion_ms],
  );
}

/**
 * Períodos cargados, del más antiguo al más reciente.
 * @returns {Promise<{fecha: string, etiqueta: string, filas_leidas: number, universo_local_valido: number,
 *   archivos: string, cargado_en: string}[]>}  cargado_en = 'AAAA-MM-DD HH:MI' (hora del servidor de BD).
 */
export async function periodos() {
  const filas = await consulta(`
    SELECT q.fecha, q.filas_leidas, q.universo_local_valido,
           (SELECT string_agg(DISTINCT c.archivo, ', ') FROM cortes c
             WHERE c.id IN (SELECT DISTINCT corte_id FROM at03_filas f WHERE f.fecha = q.fecha)) AS archivos,
           (SELECT to_char(MAX(c.cargado_en), 'YYYY-MM-DD HH24:MI') FROM cortes c
             WHERE c.id IN (SELECT DISTINCT corte_id FROM at03_filas f WHERE f.fecha = q.fecha)) AS cargado_en
    FROM res_calidad q ORDER BY q.fecha`);
  return filas.map((f) => ({ ...f, etiqueta: etiquetaPeriodo(f.fecha) }));
}

/**
 * Reporte de calidad por período (entregable 4). Columnas = control_calidad.csv en minúsculas.
 * @param {string} [fecha] si se omite, devuelve todos los períodos.
 * @returns {Promise<{fecha: string, filas_leidas: number, e1_duplicados: number, e2_destino_extranjero: number,
 *   e3_saldo_no_positivo: number, e4_actividad_no_catalogada: number, universo_local_valido: number,
 *   saldo_universo_local_valido: string, cuadre_cascada: 'SI'|'NO', indep_duplicados: number,
 *   indep_destino_extranjero: number, indep_saldo_no_positivo: number, indep_actividad_no_catalogada: number,
 *   alertas_integridad: number}[]>}
 */
export async function calidad(fecha) {
  return consulta(
    'SELECT * FROM res_calidad WHERE ($1::text IS NULL OR fecha = $1) ORDER BY fecha',
    [fecha || null],
  );
}

/**
 * Lista paginada de filas excluidas con su motivo.
 * @param {{fecha?: string, filtro?: 'E1'|'E2'|'E3'|'E4', banco?: string, busqueda?: string, pagina?: number, tamano?: number}} [opciones]
 *   busqueda = parte del Numero_Prestamo. tamano máx. 100,000 (para exportar todo).
 * @returns {Promise<{total: number, pagina: number, tamano: number, filas: {fecha: string, archivo: string,
 *   fila_archivo: number, numero_prestamo: string, filtro: string, motivo: string, codigo_banco: string,
 *   destino: string, saldo: string, tipo_actividad: string}[]}>}
 */
export async function exclusiones({ fecha, filtro, banco, busqueda, pagina, tamano } = {}) {
  const pag = paginar(pagina, tamano);
  const condicion = `($1::text IS NULL OR fecha = $1) AND ($2::text IS NULL OR filtro = $2)
                     AND ($3::text IS NULL OR codigo_banco = $3) AND ($4::text IS NULL OR numero_prestamo ILIKE '%' || $4 || '%')`;
  const params = [fecha || null, filtro || null, banco || null, busqueda || null];
  const [{ total }] = await consulta(`SELECT COUNT(*)::int AS total FROM v_exclusiones WHERE ${condicion}`, params);
  const filas = await consulta(
    `SELECT fecha, archivo, fila_archivo, numero_prestamo, filtro, motivo, codigo_banco, destino,
            saldo::text AS saldo, tipo_actividad
     FROM v_exclusiones WHERE ${condicion}
     ORDER BY fecha, archivo, fila_archivo LIMIT $5 OFFSET $6`,
    [...params, pag.tamano, pag.desplazamiento],
  );
  return { total, pagina: pag.pagina, tamano: pag.tamano, filas };
}

/**
 * Rankings de un período (entregable 2): 12 bancos por ranking, ordenados por ranking y posición.
 * @param {{fecha?: string, ranking?: string}} [opciones] fecha por defecto = período más reciente.
 * @returns {Promise<{fecha: string, ranking: string, posicion: number, codigo_banco: string, banco: string,
 *   saldo_actividad: string, total_cartera_local_valida: string, ponderacion_pct: string,
 *   operaciones_validas: number}[]>}
 */
export async function rankings({ fecha, ranking } = {}) {
  const f = fecha || (await ultimoPeriodo());
  return consulta(
    `SELECT fecha, ranking, posicion, codigo_banco, banco, saldo_actividad::text AS saldo_actividad,
            total_cartera_local_valida::text AS total_cartera_local_valida,
            ponderacion_pct::text AS ponderacion_pct, operaciones_validas
     FROM res_rankings
     WHERE fecha = $1 AND ($2::text IS NULL OR ranking = $2)
     ORDER BY array_position($3::text[], ranking), posicion`,
    [f, ranking || null, ORDEN_RANKINGS],
  );
}

/**
 * Desglose por subactividad (entregable 3): 22 subactividades × 12 bancos (0.00 si no hay saldo).
 * @param {{fecha?: string, ranking?: string, banco?: string}} [opciones] fecha por defecto = más reciente.
 * @returns {Promise<{fecha: string, ranking: string, subactividad: string, codigo_banco: string,
 *   banco: string, saldo: string, operaciones: number}[]>}
 */
export async function subactividades({ fecha, ranking, banco } = {}) {
  const f = fecha || (await ultimoPeriodo());
  return consulta(
    `SELECT fecha, ranking, subactividad, codigo_banco, banco, saldo::text AS saldo, operaciones
     FROM res_subactividades
     WHERE fecha = $1 AND ($2::text IS NULL OR ranking = $2) AND ($3::text IS NULL OR codigo_banco = $3)
     ORDER BY array_position($4::text[], ranking), subactividad, codigo_banco`,
    [f, ranking || null, banco || null, ORDEN_RANKINGS],
  );
}

/**
 * Movimientos de posición entre dos períodos (entregable 5), con la marca de
 * "significativo" calculada según los parámetros vigentes (tabla parametros).
 * @param {{anterior?: string, actual?: string, ranking?: string}} [opciones]
 *   Sin anterior/actual devuelve TODOS los pares de períodos (consecutivos y no consecutivos).
 * @returns {Promise<{fecha_anterior: string, fecha_actual: string, ranking: string, codigo_banco: string,
 *   banco: string, posicion_anterior: number, posicion_actual: number, cambio_posicion: number,
 *   saldo_anterior: string, saldo_actual: string, var_saldo: string, var_saldo_pct: string|null,
 *   cambio_de_lider: 'SI'|'NO', consecutivos: boolean, significativo: boolean, motivo: string}[]>}
 *   cambio_posicion > 0 = sube; < 0 = baja. motivo explica por qué es significativo ('' si no lo es).
 */
export async function movimientos({ anterior, actual, ranking } = {}) {
  return consulta(
    `WITH p AS (
       SELECT COALESCE((SELECT valor FROM parametros WHERE clave = 'min_cambio_posicion'), '2')::int     AS min_pos,
              COALESCE((SELECT valor FROM parametros WHERE clave = 'marcar_cambio_lider'), 'si') = 'si'  AS lider,
              COALESCE((SELECT valor FROM parametros WHERE clave = 'min_var_saldo_pct'), '20')::numeric  AS min_pct
     ),
     m AS (
       SELECT v.*,
              (ABS(v.cambio_posicion) >= p.min_pos AND v.cambio_posicion <> 0)  AS por_posicion,
              (p.lider AND v.cambio_de_lider = 'SI')                             AS por_lider,
              (v.var_saldo_pct IS NOT NULL AND ABS(v.var_saldo_pct) >= p.min_pct) AS por_saldo,
              (v.saldo_anterior = 0 AND v.saldo_actual > 0)                      AS por_nuevo
       FROM v_movimientos v CROSS JOIN p
       WHERE ($1::text IS NULL OR v.fecha_anterior = $1) AND ($2::text IS NULL OR v.fecha_actual = $2)
         AND ($3::text IS NULL OR v.ranking = $3)
     )
     SELECT fecha_anterior, fecha_actual, ranking, codigo_banco, banco, posicion_anterior, posicion_actual,
            cambio_posicion, saldo_anterior::text AS saldo_anterior, saldo_actual::text AS saldo_actual,
            var_saldo::text AS var_saldo, var_saldo_pct::text AS var_saldo_pct, cambio_de_lider, consecutivos,
            (por_posicion OR por_lider OR por_saldo OR por_nuevo) AS significativo,
            concat_ws('; ',
              CASE WHEN por_posicion AND cambio_posicion > 0 THEN 'Sube ' || cambio_posicion || ' posiciones' END,
              CASE WHEN por_posicion AND cambio_posicion < 0 THEN 'Baja ' || -cambio_posicion || ' posiciones' END,
              CASE WHEN por_lider AND posicion_actual = 1 THEN 'Nuevo líder del ranking' END,
              CASE WHEN por_lider AND posicion_anterior = 1 THEN 'Pierde el liderazgo' END,
              CASE WHEN por_saldo THEN 'Saldo varía ' || var_saldo_pct::text || '%' END,
              CASE WHEN por_nuevo THEN 'Empieza a tener saldo en el ranking' END) AS motivo
     FROM m
     ORDER BY fecha_anterior, fecha_actual, array_position($4::text[], ranking), posicion_actual`,
    [anterior || null, actual || null, ranking || null, ORDEN_RANKINGS],
  );
}

/**
 * Explica la variación de saldo de cada banco entre dos períodos.
 * Siempre: saldo_nuevos + saldo_salidos + variacion_continuan = var_saldo.
 * @param {{anterior: string, actual: string, ranking?: string, banco?: string}} opciones
 * @returns {Promise<{fecha_anterior: string, fecha_actual: string, ranking: string, codigo_banco: string,
 *   banco: string, var_saldo: string, saldo_nuevos: string, saldo_salidos: string, variacion_continuan: string,
 *   prestamos_nuevos: number, prestamos_salidos: number, prestamos_continuan: number}[]>}
 *   saldo_nuevos (+) = saldo actual de préstamos que no estaban; saldo_salidos (−) = saldo anterior de los
 *   que ya no están (vencieron o dejaron de ser válidos); variacion_continuan = cambio de los que siguen (amortización).
 */
export async function descomposicion({ anterior, actual, ranking, banco } = {}) {
  return consulta(
    `SELECT fecha_anterior, fecha_actual, ranking, codigo_banco, banco, var_saldo::text AS var_saldo,
            saldo_nuevos::text AS saldo_nuevos, saldo_salidos::text AS saldo_salidos,
            variacion_continuan::text AS variacion_continuan, prestamos_nuevos, prestamos_salidos, prestamos_continuan
     FROM res_descomposicion
     WHERE fecha_anterior = $1 AND fecha_actual = $2
       AND ($3::text IS NULL OR ranking = $3) AND ($4::text IS NULL OR codigo_banco = $4)
     ORDER BY array_position($5::text[], ranking), codigo_banco`,
    [anterior, actual, ranking || null, banco || null, ORDEN_RANKINGS],
  );
}

const DESCRIPCION_RECONCILIACION = {
  1: 'Por banco y ranking: la suma de las subactividades es igual al saldo de la actividad.',
  2: 'Por banco: la suma de las 6 actividades es igual al total de cartera local válida.',
  3: 'Por período: la suma de los totales de los 12 bancos es igual al saldo del universo local válido.',
};

/**
 * Reconciliaciones 1, 2 y 3 de un período.
 * @param {string} [fecha] por defecto = más reciente.
 * @returns {Promise<{fecha: string,
 *   resumen: {reconciliacion: number, descripcion: string, comprobaciones: number, cuadran: number, todas_cuadran: boolean}[],
 *   detalle: {reconciliacion: number, ranking: string|null, codigo_banco: string|null, esperado: string,
 *             obtenido: string, diferencia: string, cuadra: 'SI'|'NO'}[]}>}
 */
export async function reconciliaciones(fecha) {
  const f = fecha || (await ultimoPeriodo());
  const detalle = await consulta(
    `SELECT reconciliacion, ranking, codigo_banco, esperado::text AS esperado, obtenido::text AS obtenido,
            diferencia::text AS diferencia, cuadra
     FROM v_reconciliaciones WHERE fecha = $1
     ORDER BY reconciliacion, array_position($2::text[], ranking), codigo_banco`,
    [f, ORDEN_RANKINGS],
  );
  const resumen = [1, 2, 3].map((n) => {
    const filas = detalle.filter((d) => d.reconciliacion === n);
    const cuadran = filas.filter((d) => d.cuadra === 'SI').length;
    return { reconciliacion: n, descripcion: DESCRIPCION_RECONCILIACION[n], comprobaciones: filas.length, cuadran, todas_cuadran: filas.length > 0 && cuadran === filas.length };
  });
  return { fecha: f, resumen, detalle };
}

/**
 * Alertas de calidad de un período (no excluyen filas).
 * @param {string} [fecha] por defecto = más reciente.
 * @returns {Promise<{fecha: string, resumen: {tipo: string, cantidad: number}[],
 *   filas: {tipo: string, archivo: string, fila_archivo: number, numero_prestamo: string,
 *           codigo_banco: string, valor: string, detalle: string}[]}>}
 *   tipo: BANCO_NO_CATALOGADO | FACILIDAD_NO_CATALOGADA | TARJETA_SIN_FACILIDAD_07 | AUTOMOVIL_SIN_FACILIDAD_03.
 *   filas trae como máximo 500.
 */
export async function alertas(fecha) {
  const f = fecha || (await ultimoPeriodo());
  const resumen = await consulta(
    'SELECT tipo, COUNT(*)::int AS cantidad FROM v_alertas WHERE fecha = $1 GROUP BY tipo ORDER BY tipo',
    [f],
  );
  const filas = await consulta(
    `SELECT tipo, archivo, fila_archivo, numero_prestamo, codigo_banco, valor, detalle
     FROM v_alertas WHERE fecha = $1 ORDER BY tipo, fila_archivo LIMIT 500`,
    [f],
  );
  return { fecha: f, resumen, filas };
}

/**
 * Préstamos que forman el saldo de un banco en un ranking (y subactividad opcional).
 * total_operaciones y saldo_total cuadran con operaciones_validas y saldo_actividad del ranking.
 * @param {{fecha: string, ranking: string, subactividad?: string, banco?: string, pagina?: number, tamano?: number}} opciones
 * @returns {Promise<{total_operaciones: number, saldo_total: string, pagina: number, tamano: number,
 *   filas: {numero_prestamo: string, codigo_banco: string, subactividad: string, tipo_actividad: string,
 *     facilidad_crediticia: string, saldo: string, tasa_interes: string, dias_mora: string,
 *     fecha_inicial_prestamo: string, fecha_vencimiento: string, archivo: string, fila_archivo: number}[]}>}
 *   Ordenadas por saldo descendente.
 */
export async function detallePrestamos({ fecha, ranking, subactividad, banco, pagina, tamano } = {}) {
  const pag = paginar(pagina, tamano);
  const condicion = `u.fecha = $1 AND u.macroactividad = $2 AND ($3::text IS NULL OR u.subactividad = $3)
                     AND ($4::text IS NULL OR u.codigo_banco = $4)`;
  const params = [fecha, ranking, subactividad || null, banco || null];
  const [tot] = await consulta(
    `SELECT COUNT(*)::int AS total_operaciones, COALESCE(SUM(u.saldo), 0)::numeric(20,2)::text AS saldo_total
     FROM v_universo u WHERE ${condicion}`,
    params,
  );
  const filas = await consulta(
    `SELECT u.numero_prestamo, u.codigo_banco, u.subactividad, u.tipo_actividad, u.facilidad_crediticia,
            u.saldo::text AS saldo, a.tasa_interes, a.dias_mora, a.fecha_inicial_prestamo, a.fecha_vencimiento,
            u.archivo, u.fila_archivo
     FROM v_universo u JOIN at03_filas a ON a.id = u.id
     WHERE ${condicion}
     ORDER BY u.saldo DESC, u.numero_prestamo LIMIT $5 OFFSET $6`,
    [...params, pag.tamano, pag.desplazamiento],
  );
  return { ...tot, pagina: pag.pagina, tamano: pag.tamano, filas };
}

/**
 * Catálogos de referencia.
 * @returns {Promise<{bancos: {codigo_banco: string, nombre_ficticio: string, tipo_licencia: string}[],
 *   cinu: {codigo_cinu: string, descripcion: string, macroactividad_reto: string, subactividad_reto: string,
 *          codigo_sb08_referencia: string}[],
 *   sb21: {codigo: string, descripcion: string, uso_en_reto: string}[]}>}
 */
export async function catalogos() {
  const [bancos, cinu, sb21] = await Promise.all([
    consulta('SELECT * FROM bancos ORDER BY codigo_banco'),
    consulta('SELECT * FROM catalogo_cinu ORDER BY array_position($1::text[], macroactividad_reto), codigo_cinu', [ORDEN_RANKINGS]),
    consulta('SELECT * FROM tabla_sb21 ORDER BY codigo'),
  ]);
  return { bancos, cinu, sb21 };
}

/**
 * Parámetros configurables (regla de movimiento significativo).
 * @returns {Promise<{clave: string, valor: string, descripcion: string, actualizado_en: string, actualizado_por: string}[]>}
 */
export async function parametros() {
  return consulta(
    `SELECT clave, valor, descripcion, to_char(actualizado_en, 'YYYY-MM-DD HH24:MI') AS actualizado_en, actualizado_por
     FROM parametros ORDER BY clave`,
  );
}

// Validación de cada parámetro: así un valor mal escrito no rompe las consultas.
const VALIDAR_PARAMETRO = {
  min_cambio_posicion: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 11 ? null : 'Debe ser un entero entre 1 y 11.',
  marcar_cambio_lider: (v) => (['si', 'no'].includes(v) ? null : 'Debe ser "si" o "no".'),
  min_var_saldo_pct: (v) => (/^\d+(\.\d{1,4})?$/.test(v) ? null : 'Debe ser un número mayor o igual a 0, con punto decimal (por ejemplo 10 o 7.5).'),
};

/**
 * Cambia un parámetro (solo Administrador) y lo anota en la bitácora.
 * @param {string} clave
 * @param {string} valor
 * @param {string} perfil
 * @returns {Promise<{ok: true, parametro: object} | {ok: false, mensaje: string}>}
 */
export async function guardarParametro(clave, valor, perfil) {
  const texto = String(valor ?? '').trim().toLowerCase();
  let mensaje = null;
  if (!['administrador', 'sistema'].includes(perfil)) mensaje = 'Solo el perfil Administrador puede cambiar parámetros.';
  else if (!VALIDAR_PARAMETRO[clave]) mensaje = `El parámetro "${clave}" no existe.`;
  else mensaje = VALIDAR_PARAMETRO[clave](texto);
  if (mensaje) {
    await registrarBitacora({ perfil: perfil || 'desconocido', operacion: 'parametro', detalle: `${clave} = ${texto}: ${mensaje}`, resultado: 'error' });
    return { ok: false, mensaje };
  }
  const [anterior] = await consulta('SELECT valor FROM parametros WHERE clave = $1', [clave]);
  const [parametro] = await consulta(
    `UPDATE parametros SET valor = $2, actualizado_en = now(), actualizado_por = $3 WHERE clave = $1
     RETURNING clave, valor, descripcion, to_char(actualizado_en, 'YYYY-MM-DD HH24:MI') AS actualizado_en, actualizado_por`,
    [clave, texto, perfil],
  );
  await registrarBitacora({ perfil, operacion: 'parametro', detalle: `${clave}: ${anterior?.valor ?? '—'} -> ${texto}`, resultado: 'ok' });
  return { ok: true, parametro };
}

/**
 * Últimas operaciones registradas (más reciente primero).
 * @param {{limite?: number}} [opciones] por defecto 100, máximo 1000.
 * @returns {Promise<{id: number, momento: string, perfil: string, operacion: string, detalle: string,
 *   resultado: 'ok'|'error', duracion_ms: number|null}[]>}  momento = 'AAAA-MM-DD HH:MI:SS'.
 */
export async function bitacora({ limite = 100 } = {}) {
  const n = Math.min(1000, Math.max(1, Number.parseInt(limite, 10) || 100));
  return consulta(
    `SELECT id, to_char(momento, 'YYYY-MM-DD HH24:MI:SS') AS momento, perfil, operacion, detalle, resultado, duracion_ms
     FROM bitacora ORDER BY id DESC LIMIT $1`,
    [n],
  );
}

/**
 * Datos para el panel principal.
 * @param {string} [fecha] por defecto = más reciente.
 * @returns {Promise<null | {fecha: string, etiqueta: string, fecha_anterior: string|null,
 *   universo: {filas_leidas: number, excluidas: number, universo_local_valido: number, saldo_universo_local_valido: string},
 *   rankings: {ranking: string, nombre: string, tipo: string, saldo_total: string, operaciones: number,
 *     lider: {codigo_banco: string, banco: string, saldo_actividad: string, ponderacion_pct: string},
 *     lider_anterior: {codigo_banco: string, banco: string}|null, cambio_de_lider: boolean}[],
 *   movimientos_significativos: number, reconciliaciones_cuadran: boolean}>}
 *   null si todavía no hay ningún corte cargado.
 */
export async function resumenPanel(fecha) {
  const f = fecha || (await ultimoPeriodo());
  if (!f) return null;
  const [q] = await calidad(f);
  if (!q) return null;
  const [{ anterior }] = await consulta('SELECT MAX(fecha) AS anterior FROM res_calidad WHERE fecha < $1', [f]);
  const filas = await consulta(
    `SELECT r.ranking, SUM(r.saldo_actividad)::numeric(20,2)::text AS saldo_total, SUM(r.operaciones_validas)::int AS operaciones,
            MAX(r.codigo_banco) FILTER (WHERE r.posicion = 1) AS codigo_banco,
            MAX(r.banco) FILTER (WHERE r.posicion = 1) AS banco,
            MAX(r.saldo_actividad::text) FILTER (WHERE r.posicion = 1) AS saldo_actividad,
            MAX(r.ponderacion_pct::text) FILTER (WHERE r.posicion = 1) AS ponderacion_pct,
            (SELECT a.codigo_banco FROM res_rankings a WHERE a.fecha = $2 AND a.ranking = r.ranking AND a.posicion = 1) AS codigo_anterior,
            (SELECT a.banco FROM res_rankings a WHERE a.fecha = $2 AND a.ranking = r.ranking AND a.posicion = 1) AS banco_anterior
     FROM res_rankings r WHERE r.fecha = $1 GROUP BY r.ranking`,
    [f, anterior],
  );
  const porClave = Object.fromEntries(filas.map((x) => [x.ranking, x]));
  const lista = RANKINGS.filter((r) => porClave[r.clave]).map((r) => {
    const x = porClave[r.clave];
    return {
      ranking: r.clave, nombre: r.nombre, tipo: r.tipo, saldo_total: x.saldo_total, operaciones: x.operaciones,
      lider: { codigo_banco: x.codigo_banco, banco: x.banco, saldo_actividad: x.saldo_actividad, ponderacion_pct: x.ponderacion_pct },
      lider_anterior: x.codigo_anterior ? { codigo_banco: x.codigo_anterior, banco: x.banco_anterior } : null,
      cambio_de_lider: Boolean(x.codigo_anterior && x.codigo_anterior !== x.codigo_banco),
    };
  });
  let significativos = 0;
  if (anterior) {
    significativos = (await movimientos({ anterior, actual: f })).filter((m) => m.significativo).length;
  }
  const rec = await reconciliaciones(f);
  return {
    fecha: f,
    etiqueta: etiquetaPeriodo(f),
    fecha_anterior: anterior,
    universo: {
      filas_leidas: q.filas_leidas,
      excluidas: q.filas_leidas - q.universo_local_valido,
      universo_local_valido: q.universo_local_valido,
      saldo_universo_local_valido: q.saldo_universo_local_valido,
    },
    rankings: lista,
    movimientos_significativos: significativos,
    reconciliaciones_cuadran: rec.resumen.every((r) => r.todas_cuadran),
  };
}
