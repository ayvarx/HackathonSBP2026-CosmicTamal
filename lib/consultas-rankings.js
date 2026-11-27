// lib/consultas-rankings.js — Consultas propias del Panel (/) y de Rankings (/rankings).
//
// Complementan lib/consultas.js con cuatro agregados que esas pantallas necesitan.
// Igual que allí, TODA la aritmética de dinero (sumas y porcentajes) se hace en SQL
// con NUMERIC exacto, y los montos vuelven como TEXTO con 2 decimales. Aquí no se
// calcula ningún ranking: solo se leen las tablas res_* que llena el motor.
// Solo para el servidor.

import { consulta } from './db.js';
import { RANKINGS } from './consultas.js';

const ORDEN_RANKINGS = RANKINGS.map((r) => r.clave);

/** Fechas de corte cargadas, de la más antigua a la más reciente: ['20260731', ...]. */
export async function fechasDisponibles() {
  const filas = await consulta('SELECT fecha FROM res_calidad ORDER BY fecha');
  return filas.map((f) => f.fecha);
}

/**
 * Composición de la cartera local válida por macroactividad (los 6 rankings).
 * participacion_pct = saldo del ranking / saldo de los 6 rankings × 100, redondeado a 4 decimales.
 * @param {string} fecha AAAAMMDD
 * @returns {Promise<{ranking: string, saldo: string, operaciones: number, participacion_pct: string|null}[]>}
 */
export async function composicionCartera(fecha) {
  return consulta(
    `WITH s AS (
       SELECT ranking, SUM(saldo_actividad) AS saldo, SUM(operaciones_validas)::int AS operaciones
       FROM res_rankings WHERE fecha = $1 GROUP BY ranking
     ), t AS (SELECT SUM(saldo) AS total FROM s)
     SELECT s.ranking, s.saldo::numeric(20,2)::text AS saldo, s.operaciones,
            CASE WHEN t.total > 0 THEN ROUND(s.saldo * 100 / t.total, 4)::text END AS participacion_pct
     FROM s CROSS JOIN t
     ORDER BY array_position($2::text[], s.ranking)`,
    [fecha, ORDEN_RANKINGS],
  );
}

/**
 * Cartera local válida de cada banco (el denominador de la ponderación), de mayor a menor.
 * El total del banco es el mismo en los 6 rankings, por eso se toma MAX.
 * Desempate por código de banco, igual que en los rankings.
 * @param {string} fecha AAAAMMDD
 * @returns {Promise<{posicion: number, codigo_banco: string, banco: string,
 *   total_cartera_local_valida: string, operaciones: number, participacion_pct: string|null}[]>}
 */
export async function carteraPorBanco(fecha) {
  return consulta(
    `WITH b AS (
       SELECT codigo_banco, MAX(banco) AS banco, MAX(total_cartera_local_valida) AS total,
              SUM(operaciones_validas)::int AS operaciones
       FROM res_rankings WHERE fecha = $1 GROUP BY codigo_banco
     ), t AS (SELECT SUM(total) AS total_sistema FROM b)
     SELECT ROW_NUMBER() OVER (ORDER BY b.total DESC, b.codigo_banco)::int AS posicion,
            b.codigo_banco, b.banco, b.total::numeric(20,2)::text AS total_cartera_local_valida, b.operaciones,
            CASE WHEN t.total_sistema > 0 THEN ROUND(b.total * 100 / t.total_sistema, 4)::text END AS participacion_pct
     FROM b CROSS JOIN t
     ORDER BY posicion`,
    [fecha],
  );
}

/**
 * Totales de un ranking: por subactividad (12 bancos sumados) y del ranking completo.
 * Sirve para el pie de la tabla de desglose y para comprobar que el detalle de préstamos cuadra.
 * @param {{fecha: string, ranking: string}} opciones
 * @returns {Promise<{subactividades: {subactividad: string, saldo: string, operaciones: number}[],
 *   total: {saldo: string, operaciones: number}}>}
 */
export async function totalesRanking({ fecha, ranking }) {
  const [subactividades, [total]] = await Promise.all([
    consulta(
      `SELECT subactividad, SUM(saldo)::numeric(20,2)::text AS saldo, SUM(operaciones)::int AS operaciones
       FROM res_subactividades WHERE fecha = $1 AND ranking = $2
       GROUP BY subactividad ORDER BY subactividad`,
      [fecha, ranking],
    ),
    consulta(
      `SELECT COALESCE(SUM(saldo_actividad), 0)::numeric(20,2)::text AS saldo,
              COALESCE(SUM(operaciones_validas), 0)::int AS operaciones
       FROM res_rankings WHERE fecha = $1 AND ranking = $2`,
      [fecha, ranking],
    ),
  ]);
  return { subactividades, total };
}

/**
 * Efecto de la regla SB21 (Sección 6) por banco: préstamos cuyo CINU del catálogo es
 * "Credito personal" pero que el motor contó en "Tarjeta" por tener facilidad 07.
 * La condición se lee del catálogo (no de un código fijo): subactividad del catálogo
 * distinta de la subactividad final asignada.
 * @param {string} fecha AAAAMMDD
 * @returns {Promise<{bancos: {codigo_banco: string, banco: string, operaciones: number, saldo: string}[],
 *   total: {operaciones: number, saldo: string}}>}
 */
export async function reclasificacionSB21(fecha) {
  const bancos = await consulta(
    `WITH r AS (
       SELECT u.codigo_banco, COUNT(*)::int AS operaciones, SUM(u.saldo) AS saldo
       FROM v_universo u
       JOIN catalogo_cinu c ON c.codigo_cinu = u.tipo_actividad
       WHERE u.fecha = $1 AND u.macroactividad = 'CONSUMO'
         AND c.subactividad_reto = 'Credito personal' AND u.subactividad = 'Tarjeta'
       GROUP BY u.codigo_banco
     )
     SELECT b.codigo_banco, b.nombre_ficticio AS banco,
            COALESCE(r.operaciones, 0)::int AS operaciones,
            COALESCE(r.saldo, 0)::numeric(20,2)::text AS saldo
     FROM bancos b LEFT JOIN r ON r.codigo_banco = b.codigo_banco
     ORDER BY b.codigo_banco`,
    [fecha],
  );
  const [total] = await consulta(
    `SELECT COUNT(*)::int AS operaciones, COALESCE(SUM(u.saldo), 0)::numeric(20,2)::text AS saldo
     FROM v_universo u
     JOIN catalogo_cinu c ON c.codigo_cinu = u.tipo_actividad
     WHERE u.fecha = $1 AND u.macroactividad = 'CONSUMO'
       AND c.subactividad_reto = 'Credito personal' AND u.subactividad = 'Tarjeta'`,
    [fecha],
  );
  return { bancos, total };
}

// ---------------------------------------------------------------------------
// Ayudas para leer los parámetros de la URL (searchParams) con seguridad.
// ---------------------------------------------------------------------------

/** searchParams puede traer un arreglo si el parámetro se repite (?a=1&a=2): se toma el primero. */
export function textoParametro(valor) {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === 'string' ? texto.trim() : '';
}

/**
 * Elige el período a mostrar: el de la URL si está cargado; si no, el más reciente.
 * Devuelve también el período anterior (para comparar) y si la URL traía uno inválido.
 * @param {string} pedido valor de ?periodo=
 * @param {string[]} fechas fechas cargadas en orden ascendente
 * @returns {{fecha: string|null, anterior: string|null, invalido: boolean}}
 */
export function elegirPeriodo(pedido, fechas) {
  if (!fechas.length) return { fecha: null, anterior: null, invalido: Boolean(pedido) };
  const indicePedido = fechas.indexOf(pedido);
  const indice = indicePedido >= 0 ? indicePedido : fechas.length - 1;
  return {
    fecha: fechas[indice],
    // Se compara con el corte inmediatamente anterior (períodos consecutivos, Sección 8).
    anterior: indice > 0 ? fechas[indice - 1] : null,
    invalido: Boolean(pedido) && indicePedido < 0,
  };
}
