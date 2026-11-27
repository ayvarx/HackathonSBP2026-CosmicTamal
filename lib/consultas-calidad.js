// lib/consultas-calidad.js — Consultas extra de las pantallas Calidad y Verificación.
// Igual que lib/consultas.js: aquí no se calcula ningún ranking; solo se suman
// resultados que ya dejó el motor SQL. Los montos viajan como TEXTO con 2 decimales.
import { consulta } from './db.js';
import { RANKINGS } from './consultas.js';

const ORDEN = RANKINGS.map((r) => r.clave);

/**
 * Elige el período a mostrar: el pedido en la URL si existe; si no, el más reciente.
 * @param {{fecha: string}[]} lista períodos cargados (de periodos())
 * @param {string} [pedido]
 */
export function elegirPeriodo(lista, pedido) {
  if (!lista.length) return null;
  if (pedido && lista.some((p) => p.fecha === pedido)) return pedido;
  return lista[lista.length - 1].fecha;
}

/**
 * Saldo y operaciones por ranking y subactividad (suma de los 12 bancos).
 * Ya incluye la reclasificación SB21 (las tarjetas dentro de "Crédito personal" van a "Tarjeta").
 * @returns {Promise<{ranking: string, subactividad: string, saldo: string, operaciones: number}[]>}
 */
export async function totalesPorSubactividad(fecha) {
  return consulta(
    `SELECT ranking, subactividad, SUM(saldo)::numeric(20,2)::text AS saldo, SUM(operaciones)::int AS operaciones
     FROM res_subactividades WHERE fecha = $1
     GROUP BY ranking, subactividad
     ORDER BY array_position($2::text[], ranking), subactividad`,
    [fecha, ORDEN],
  );
}

/**
 * Efecto de la regla SB21: préstamos del universo válido cuyo CINU es "Credito personal"
 * pero con Facilidad_Crediticia = '07' (tarjeta), que el motor movió a "Tarjeta".
 * @returns {Promise<{operaciones_movidas: number, saldo_movido: string,
 *   tarjeta_saldo: string, tarjeta_operaciones: number,
 *   credito_personal_saldo: string, credito_personal_operaciones: number}>}
 */
export async function reclasificacionSb21(fecha) {
  const [mov] = await consulta(
    `SELECT COUNT(*)::int AS operaciones_movidas, COALESCE(SUM(r.saldo), 0)::numeric(20,2)::text AS saldo_movido
     FROM res_filas r JOIN catalogo_cinu c ON c.codigo_cinu = r.tipo_actividad
     WHERE r.fecha = $1 AND r.filtro IS NULL AND r.subactividad = 'Tarjeta'
       AND c.macroactividad_reto = 'CONSUMO' AND c.subactividad_reto = 'Credito personal'`,
    [fecha],
  );
  const [fin] = await consulta(
    `SELECT COALESCE(SUM(saldo) FILTER (WHERE subactividad = 'Tarjeta'), 0)::numeric(20,2)::text AS tarjeta_saldo,
            COALESCE(SUM(operaciones) FILTER (WHERE subactividad = 'Tarjeta'), 0)::int AS tarjeta_operaciones,
            COALESCE(SUM(saldo) FILTER (WHERE subactividad = 'Credito personal'), 0)::numeric(20,2)::text AS credito_personal_saldo,
            COALESCE(SUM(operaciones) FILTER (WHERE subactividad = 'Credito personal'), 0)::int AS credito_personal_operaciones
     FROM res_subactividades WHERE fecha = $1 AND ranking = 'CONSUMO'`,
    [fecha],
  );
  return { ...mov, ...fin };
}
