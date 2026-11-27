// lib/consultas-reportes.js — Lógica de las exportaciones CSV y del reporte personalizado.
//
// No calcula nada: toma las filas que ya produjo el motor SQL (vía lib/consultas.js),
// las filtra y las convierte a CSV con los encabezados OFICIALES (COLUMNAS_EXPORTACION).
// No sabe nada de perfiles: el control de acceso se hace en las rutas (app/api/exportar)
// y en las páginas. Así las pruebas pueden llamar estas funciones directamente.
// Solo para el servidor.

import { stringify } from 'csv-stringify/sync';
import {
  COLUMNAS_EXPORTACION, RANKINGS, FILTROS,
  periodos, rankings, subactividades, calidad, exclusiones, movimientos,
} from './consultas.js';

/** Los conjuntos que se pueden exportar. */
export const CONJUNTOS = ['rankings', 'subactividades', 'calidad', 'exclusiones', 'movimientos', 'personalizado'];

const ORDEN_RANKINGS = RANKINGS.map((r) => r.clave);
const CLAVES_FILTRO = FILTROS.map((f) => f.clave);

/** Error de entrada del usuario: la ruta lo convierte en una respuesta 400 o 404 con mensaje claro. */
export class ErrorExportacion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

// ---------------------------------------------------------------------------
// Lectura y validación de los filtros de la URL
// ---------------------------------------------------------------------------

/** Junta valores repetidos (?r=A&r=B) y separados por coma (?r=A,B) en una lista sin vacíos ni repetidos. */
function lista(parametros, ...nombres) {
  const valores = nombres.flatMap((n) => parametros.getAll(n)).flatMap((v) => v.split(','));
  return [...new Set(valores.map((v) => v.trim()).filter(Boolean))];
}

function unico(parametros, ...nombres) {
  return lista(parametros, ...nombres)[0] || '';
}

const esFecha = (v) => /^\d{8}$/.test(v);

/**
 * Convierte los parámetros de la URL en filtros validados.
 * Acepta fecha (o periodo), ranking, banco, anterior, actual, filtro (E1..E4) y extendido=1.
 * Para el reporte personalizado acepta listas: fechas, rankings, bancos y columnas.
 * @param {URLSearchParams} parametros
 */
export function leerFiltros(parametros) {
  const filtros = {
    fecha: unico(parametros, 'fecha', 'periodo'),
    ranking: unico(parametros, 'ranking').toUpperCase(),
    banco: unico(parametros, 'banco'),
    anterior: unico(parametros, 'anterior'),
    actual: unico(parametros, 'actual'),
    filtro: unico(parametros, 'filtro').toUpperCase(),
    extendido: unico(parametros, 'extendido') === '1',
    fechas: lista(parametros, 'fechas'),
    rankings: lista(parametros, 'rankings').map((r) => r.toUpperCase()),
    bancos: lista(parametros, 'bancos'),
    columnas: lista(parametros, 'columnas'),
  };
  for (const [nombre, valor] of [['fecha', filtros.fecha], ['anterior', filtros.anterior], ['actual', filtros.actual]]) {
    if (valor && !esFecha(valor)) throw new ErrorExportacion(`El parámetro "${nombre}" debe tener el formato AAAAMMDD (por ejemplo 20260930); se recibió "${valor}".`);
  }
  for (const f of filtros.fechas) {
    if (!esFecha(f)) throw new ErrorExportacion(`Cada valor de "fechas" debe tener el formato AAAAMMDD; se recibió "${f}".`);
  }
  for (const r of [filtros.ranking, ...filtros.rankings].filter(Boolean)) {
    if (!ORDEN_RANKINGS.includes(r)) throw new ErrorExportacion(`Ranking desconocido "${r}". Valores válidos: ${ORDEN_RANKINGS.join(', ')}.`);
  }
  for (const b of [filtros.banco, ...filtros.bancos].filter(Boolean)) {
    if (!/^\d{1,10}$/.test(b)) throw new ErrorExportacion(`El código de banco debe ser numérico; se recibió "${b}".`);
  }
  if (filtros.filtro && !CLAVES_FILTRO.includes(filtros.filtro)) {
    throw new ErrorExportacion(`Filtro desconocido "${filtros.filtro}". Valores válidos: ${CLAVES_FILTRO.join(', ')}.`);
  }
  return filtros;
}

/** Verifica que los períodos pedidos existan; devuelve todos los períodos cargados. */
async function periodosCargados(pedidos) {
  const todos = (await periodos()).map((p) => p.fecha);
  if (todos.length === 0) throw new ErrorExportacion('Aún no hay cortes cargados. Cargue un corte AT03 desde el perfil Administrador.', 404);
  for (const f of pedidos.filter(Boolean)) {
    if (!todos.includes(f)) throw new ErrorExportacion(`No hay un corte cargado para el período ${f}. Períodos disponibles: ${todos.join(', ')}.`, 404);
  }
  return todos;
}

// ---------------------------------------------------------------------------
// Datos de cada conjunto (siempre las filas tal cual las devuelve el motor)
// ---------------------------------------------------------------------------

const porBanco = (filas, bancos) => (bancos.length ? filas.filter((f) => bancos.includes(f.codigo_banco)) : filas);

/** Todas las filas de una consulta por período: un período si se pidió, todos si no. */
async function porPeriodo(fechas, consultarUno) {
  const filas = [];
  for (const fecha of fechas) filas.push(...(await consultarUno(fecha)));
  return filas;
}

async function datosRankings(f) {
  const fechas = f.fecha ? (await periodosCargados([f.fecha]), [f.fecha]) : await periodosCargados([]);
  const filas = await porPeriodo(fechas, (fecha) => rankings({ fecha, ranking: f.ranking || undefined }));
  return porBanco(filas, f.banco ? [f.banco] : []);
}

async function datosSubactividades(f) {
  const fechas = f.fecha ? (await periodosCargados([f.fecha]), [f.fecha]) : await periodosCargados([]);
  return porPeriodo(fechas, (fecha) => subactividades({ fecha, ranking: f.ranking || undefined, banco: f.banco || undefined }));
}

async function datosCalidad(f) {
  await periodosCargados([f.fecha]);
  return calidad(f.fecha || undefined);
}

async function datosExclusiones(f) {
  await periodosCargados([f.fecha]);
  const filas = [];
  for (let pagina = 1; ; pagina += 1) {
    const r = await exclusiones({ fecha: f.fecha || undefined, filtro: f.filtro || undefined, banco: f.banco || undefined, pagina, tamano: 100000 });
    filas.push(...r.filas);
    if (filas.length >= r.total || r.filas.length === 0) return filas;
  }
}

async function datosMovimientos(f) {
  // "fecha" se entiende como el período actual cuando no se indica "actual".
  const actual = f.actual || f.fecha;
  await periodosCargados([f.anterior, actual]);
  const filas = await movimientos({ anterior: f.anterior || undefined, actual: actual || undefined, ranking: f.ranking || undefined });
  return porBanco(filas, f.banco ? [f.banco] : []).map((m) => ({ ...m, significativo: m.significativo ? 'SI' : 'NO' }));
}

/** Columnas del reporte personalizado: las del entregable 2 (rankings). */
export const COLUMNAS_PERSONALIZADO = COLUMNAS_EXPORTACION.rankings;

/**
 * Reporte personalizado (perfil analista): rankings de los períodos, rankings y bancos elegidos,
 * con las columnas elegidas. Una lista vacía significa "todos".
 * @returns {Promise<{columnas: [string, string][], filas: object[], fechas: string[]}>}
 */
export async function reportePersonalizado(f) {
  const cargados = await periodosCargados(f.fechas);
  const fechas = f.fechas.length ? cargados.filter((c) => f.fechas.includes(c)) : cargados;
  const invalidas = f.columnas.filter((c) => !COLUMNAS_PERSONALIZADO.some(([campo, encabezado]) => c === campo || c === encabezado));
  if (invalidas.length) {
    throw new ErrorExportacion(`Columnas desconocidas: ${invalidas.join(', ')}. Válidas: ${COLUMNAS_PERSONALIZADO.map(([, e]) => e).join(', ')}.`);
  }
  const columnas = f.columnas.length
    ? COLUMNAS_PERSONALIZADO.filter(([campo, encabezado]) => f.columnas.includes(campo) || f.columnas.includes(encabezado))
    : COLUMNAS_PERSONALIZADO;
  let filas = await porPeriodo(fechas, (fecha) => rankings({ fecha }));
  if (f.rankings.length) filas = filas.filter((r) => f.rankings.includes(r.ranking));
  filas = porBanco(filas, f.bancos);
  return { columnas, filas, fechas };
}

// ---------------------------------------------------------------------------
// CSV y nombre de archivo
// ---------------------------------------------------------------------------

/** Convierte filas a CSV UTF-8 (separador coma, fin de línea CRLF como la clave de control). */
export function aCsv(filas, columnas) {
  return stringify(filas, {
    header: true,
    columns: columnas.map(([campo, encabezado]) => ({ key: campo, header: encabezado })),
    record_delimiter: '\r\n',
  });
}

/** Parte del nombre de archivo con el período: un corte, o "primero-ultimo" si hay varios. */
function textoPeriodo(fechas) {
  const unicas = [...new Set(fechas.filter(Boolean))].sort();
  if (unicas.length === 0) return 'sin_datos';
  return unicas.length === 1 ? unicas[0] : `${unicas[0]}-${unicas[unicas.length - 1]}`;
}

/**
 * Genera una exportación completa.
 * @param {string} conjunto uno de CONJUNTOS
 * @param {ReturnType<typeof leerFiltros>} f
 * @returns {Promise<{csv: string, nombreArchivo: string, filas: number}>}
 */
export async function generarExportacion(conjunto, f) {
  let filas;
  let columnas = COLUMNAS_EXPORTACION[conjunto];
  let fechas;
  switch (conjunto) {
    case 'rankings': filas = await datosRankings(f); fechas = filas.map((r) => r.fecha); break;
    case 'subactividades': filas = await datosSubactividades(f); fechas = filas.map((r) => r.fecha); break;
    case 'calidad': filas = await datosCalidad(f); fechas = filas.map((r) => r.fecha); break;
    case 'exclusiones': filas = await datosExclusiones(f); fechas = filas.map((r) => r.fecha); break;
    case 'movimientos':
      filas = await datosMovimientos(f);
      // Las 13 columnas de la clave de control; "extendido=1" agrega Significativo y Motivo.
      if (!f.extendido) columnas = columnas.filter(([campo]) => campo !== 'significativo' && campo !== 'motivo');
      fechas = filas.flatMap((r) => [r.fecha_anterior, r.fecha_actual]);
      break;
    case 'personalizado': {
      const r = await reportePersonalizado(f);
      filas = r.filas; columnas = r.columnas; fechas = r.fechas;
      break;
    }
    default: throw new ErrorExportacion(`Exportación desconocida "${conjunto}".`, 404);
  }
  const partes = [conjunto === 'personalizado' ? 'reporte_personalizado' : conjunto, textoPeriodo(fechas)];
  if (f.ranking) partes.push(f.ranking.toLowerCase());
  if (f.banco) partes.push(`banco${f.banco}`);
  if (f.filtro) partes.push(f.filtro.toLowerCase());
  return { csv: aCsv(filas, columnas), nombreArchivo: `${partes.join('_')}.csv`, filas: filas.length };
}
