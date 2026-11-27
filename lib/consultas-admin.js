// lib/consultas-admin.js — Consultas y operaciones del módulo de Administración.
//
// Complementa a lib/consultas.js (que sigue siendo la puerta principal a los datos):
//   * cortesCargados()   estado de los cortes: archivo, filas, fecha de carga, quién lo cargó.
//   * eliminarPeriodo()  borra un período y recalcula el motor (solo Administrador).
//   * resumenCorte()     "Qué cambió con este corte": cascada E1–E4, movimientos
//                        significativos con su explicación, cambios de líder y regla vigente.
//   * bitacoraAdmin()    bitácora con filtros y la hora en formato ISO (UTC) para mostrarla
//                        en hora de Panamá con lib/formato.js.
//
// Aquí NO se calcula ningún ranking ni ninguna cifra: todo sale del motor SQL
// (db/02_motor.sql). Las explicaciones son plantillas de texto fijas (deterministas)
// que solo leen la descomposición de saldo que ya calculó el motor.
// Montos: siempre TEXTO decimal; se comparan con compararDecimales (sin punto flotante).
// Solo para el servidor.

import { consulta, transaccion } from './db.js';
import { calidad, descomposicion, etiquetaPeriodo, movimientos, parametros, registrarBitacora, RANKINGS } from './consultas.js';
import {
  compararDecimales,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearPorcentaje,
  nombreRanking,
  signoDecimal,
} from './formato.js';

const RE_PERIODO = /^\d{8}$/;

/** true si el texto tiene forma de período AAAAMMDD. */
export function esPeriodo(valor) {
  return RE_PERIODO.test(String(valor ?? ''));
}

// ---------------------------------------------------------------------
// Estado de los cortes cargados
// ---------------------------------------------------------------------

/**
 * Un registro por período cargado, del más reciente al más antiguo.
 * @returns {Promise<{fecha: string, etiqueta: string, filas_leidas: number, universo_local_valido: number,
 *   saldo_universo_local_valido: string, archivo: string|null, filas_archivo: number|null, perfil: string|null,
 *   huella: string|null, cargado_en: string|null}[]>}
 *   cargado_en en ISO UTC ('2026-11-27T15:04:05Z'); huella = primeros 12 caracteres del SHA-256 del archivo.
 */
export async function cortesCargados() {
  const filas = await consulta(`
    SELECT q.fecha, q.filas_leidas, q.universo_local_valido,
           q.saldo_universo_local_valido::text AS saldo_universo_local_valido,
           c.archivo, c.filas AS filas_archivo, c.perfil, left(c.sha256, 12) AS huella,
           to_char(c.cargado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cargado_en
    FROM res_calidad q
    LEFT JOIN LATERAL (
      SELECT * FROM cortes c
      WHERE c.id IN (SELECT DISTINCT f.corte_id FROM at03_filas f WHERE f.fecha = q.fecha)
      ORDER BY c.cargado_en DESC LIMIT 1
    ) c ON true
    ORDER BY q.fecha DESC`);
  return filas.map((f) => ({ ...f, etiqueta: etiquetaPeriodo(f.fecha) }));
}

/** Período inmediatamente anterior a `fecha` entre los cargados (o null). */
export async function periodoAnterior(fecha) {
  const [fila] = await consulta('SELECT MAX(fecha) AS anterior FROM res_calidad WHERE fecha < $1', [fecha]);
  return fila?.anterior ?? null;
}

/** Período más reciente cargado (o null si no hay ninguno). */
export async function periodoMasReciente() {
  const [fila] = await consulta('SELECT MAX(fecha) AS fecha FROM res_calidad');
  return fila?.fecha ?? null;
}

// ---------------------------------------------------------------------
// Eliminar un período
// ---------------------------------------------------------------------

/**
 * Borra todas las filas AT03 de un período, quita los cortes que quedan vacíos,
 * recalcula el motor y lo anota en la bitácora. Todo o nada (transacción).
 * @param {{fecha: string, perfil: string}} opciones
 * @returns {Promise<{ok: true, fecha: string, filas_eliminadas: number} | {ok: false, mensaje: string, estado: number}>}
 */
export async function eliminarPeriodo({ fecha, perfil }) {
  const inicio = Date.now();
  const fallar = async (mensaje, estado) => {
    await registrarBitacora({ perfil: perfil || 'desconocido', operacion: 'eliminar_corte', detalle: `${fecha || '(sin período)'}: ${mensaje}`, resultado: 'error', duracion_ms: Date.now() - inicio });
    return { ok: false, mensaje, estado };
  };
  // Segunda barrera (además de la ruta API): solo el administrador borra datos.
  if (perfil !== 'administrador') return fallar('Solo el perfil Administrador puede eliminar cortes.', 403);
  if (!esPeriodo(fecha)) return fallar('Indique el período a eliminar con formato AAAAMMDD (por ejemplo 20260930).', 400);

  const resultado = await transaccion(async (tx) => {
    const [{ n }] = await tx.consulta('SELECT COUNT(*)::int AS n FROM at03_filas WHERE fecha = $1', [fecha]);
    if (n === 0) return { filas: 0 };
    await tx.consulta('DELETE FROM at03_filas WHERE fecha = $1', [fecha]);
    // Un archivo puede traer varios períodos: el registro del corte solo se borra si quedó vacío.
    await tx.consulta('DELETE FROM cortes c WHERE NOT EXISTS (SELECT 1 FROM at03_filas f WHERE f.corte_id = c.id)');
    // El motor vuelve a calcular todo (rankings, movimientos) sin el período borrado.
    await tx.consulta('SELECT recalcular()');
    return { filas: n };
  });
  if (resultado.filas === 0) return fallar(`El período ${fecha} no está cargado; no hay nada que eliminar.`, 404);

  await registrarBitacora({ perfil, operacion: 'eliminar_corte', detalle: `${fecha}: ${resultado.filas} filas eliminadas y motor recalculado`, resultado: 'ok', duracion_ms: Date.now() - inicio });
  return { ok: true, fecha, filas_eliminadas: resultado.filas };
}

// ---------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------

/**
 * Bitácora (más reciente primero) con filtros opcionales.
 * @param {{operacion?: string, resultado?: 'ok'|'error', limite?: number}} [opciones] limite por defecto 300 (máx. 1000).
 * @returns {Promise<{id: number, momento: string, perfil: string, operacion: string, detalle: string,
 *   resultado: string, duracion_ms: number|null}[]>}  momento en ISO UTC.
 */
export async function bitacoraAdmin({ operacion, resultado, limite = 300 } = {}) {
  const n = Math.min(1000, Math.max(1, Number.parseInt(limite, 10) || 300));
  return consulta(
    `SELECT id, to_char(momento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS momento,
            perfil, operacion, detalle, resultado, duracion_ms
     FROM bitacora
     WHERE ($1::text IS NULL OR operacion = $1) AND ($2::text IS NULL OR resultado = $2)
     ORDER BY id DESC LIMIT $3`,
    [operacion || null, resultado || null, n],
  );
}

/** Operaciones distintas registradas en la bitácora (para el filtro). */
export async function operacionesBitacora() {
  const filas = await consulta('SELECT DISTINCT operacion FROM bitacora ORDER BY operacion');
  return filas.map((f) => f.operacion);
}

// ---------------------------------------------------------------------
// Regla de movimiento significativo (texto legible de los parámetros)
// ---------------------------------------------------------------------

/**
 * Describe en palabras la regla vigente, a partir de la tabla parametros.
 * @returns {Promise<{min_cambio_posicion: string, marcar_cambio_lider: string, min_var_saldo_pct: string, texto: string}>}
 */
export async function reglaSignificativo() {
  const lista = await parametros();
  const valor = (clave, porDefecto) => lista.find((p) => p.clave === clave)?.valor ?? porDefecto;
  const minPos = valor('min_cambio_posicion', '2');
  const lider = valor('marcar_cambio_lider', 'si');
  const minPct = valor('min_var_saldo_pct', '10');
  const criterios = [
    `sube o baja ${minPos} posición(es) o más`,
    ...(lider === 'si' ? ['gana o pierde el primer lugar'] : []),
    `su saldo varía ${minPct} % o más (en valor absoluto)`,
    'empieza a tener saldo en el ranking',
  ];
  return {
    min_cambio_posicion: minPos,
    marcar_cambio_lider: lider,
    min_var_saldo_pct: minPct,
    texto: `Un movimiento es significativo si el banco ${criterios.join('; o ')}.`,
  };
}

// ---------------------------------------------------------------------
// Explicación automática de un movimiento (plantillas deterministas)
// ---------------------------------------------------------------------

/** Valor absoluto de un decimal en texto, sin pasar por Number. */
function absoluto(texto) {
  return String(texto ?? '0').replace(/^[-+]/, '');
}

// Montos como centavos enteros (BigInt): resta exacta, sin punto flotante.
function aCentavos(texto) {
  const [entero, fraccion = ''] = absoluto(texto).split('.');
  const centavos = BigInt(entero + fraccion.padEnd(2, '0').slice(0, 2));
  return String(texto).startsWith('-') ? -centavos : centavos;
}
function deCentavos(centavos) {
  const negativo = centavos < 0n;
  const digitos = (negativo ? -centavos : centavos).toString().padStart(3, '0');
  return `${negativo ? '-' : ''}${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}

/** a − b con montos en texto ("123.45"), resultado exacto en texto con 2 decimales. */
export function restarMontos(a, b) {
  return deCentavos(aCentavos(a) - aCentavos(b));
}

function plural(n, singular, pluralTexto) {
  return `${formatearEntero(n)} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Arma la explicación de un movimiento con plantillas fijas.
 * @param {object} m fila de movimientos() (lib/consultas.js)
 * @param {object|undefined} d fila de descomposicion() del mismo ranking y banco
 * @param {{nuevo?: object, sale?: object}|undefined} lider cambio de líder del ranking (si hubo)
 * @returns {{titular: string, saldo: string, causa: string, motivo: string, texto: string}}
 */
export function explicarMovimiento(m, d, lider) {
  const banco = `${m.banco} (${m.codigo_banco})`;
  const ranking = nombreRanking(m.ranking);

  // 1) Posición (Cambio_Posicion = anterior − actual: positivo = sube).
  let titular;
  if (m.cambio_posicion > 0) {
    titular = `${banco} sube ${plural(m.cambio_posicion, 'posición', 'posiciones')} en ${ranking}: pasa del ${m.posicion_anterior}.º al ${m.posicion_actual}.º lugar.`;
  } else if (m.cambio_posicion < 0) {
    titular = `${banco} baja ${plural(-m.cambio_posicion, 'posición', 'posiciones')} en ${ranking}: pasa del ${m.posicion_anterior}.º al ${m.posicion_actual}.º lugar.`;
  } else {
    titular = `${banco} se mantiene en el ${m.posicion_actual}.º lugar de ${ranking}.`;
  }
  if (m.cambio_de_lider === 'SI' && m.posicion_actual === 1) {
    titular += ` Es el nuevo líder del ranking${lider?.sale ? `, en lugar de ${lider.sale.banco}` : ''}.`;
  } else if (m.cambio_de_lider === 'SI' && m.posicion_anterior === 1) {
    titular += ` Pierde el primer lugar${lider?.nuevo ? ` frente a ${lider.nuevo.banco}` : ''}.`;
  }

  // 2) Saldo.
  const signo = signoDecimal(m.var_saldo);
  let saldo;
  if (signo === 0) {
    saldo = `Su saldo no cambia: ${formatearMonto(m.saldo_actual)}.`;
  } else {
    const pct = m.var_saldo_pct === null ? '' : ` (${formatearPorcentaje(m.var_saldo_pct, 2, { signo: true })})`;
    saldo = `Su saldo ${signo > 0 ? 'aumenta' : 'disminuye'} ${formatearMonto(absoluto(m.var_saldo))}${pct}: de ${formatearMonto(m.saldo_anterior)} a ${formatearMonto(m.saldo_actual)}.`;
  }

  // 3) Causa, con la descomposición del motor: nuevos + salidos + continúan = Var_Saldo.
  let causa = '';
  if (d && signo !== 0) {
    const componentes = [
      { monto: d.saldo_nuevos, texto: `${plural(d.prestamos_nuevos, 'préstamo nuevo aporta', 'préstamos nuevos aportan')} ${formatearMonto(d.saldo_nuevos, { signo: true })}`, factor: 'la entrada de préstamos nuevos' },
      { monto: d.saldo_salidos, texto: `${plural(d.prestamos_salidos, 'préstamo que salió (venció o dejó de ser válido) resta', 'préstamos que salieron (vencieron o dejaron de ser válidos) restan')} ${formatearMonto(absoluto(d.saldo_salidos))}`, factor: 'la salida de préstamos' },
      {
        monto: d.variacion_continuan,
        // Si el saldo de los que siguen baja, es amortización (pagos de capital).
        texto: `los ${plural(d.prestamos_continuan, 'préstamo que continúa varía', 'préstamos que continúan varían')} ${formatearMonto(d.variacion_continuan, { signo: true })}${signoDecimal(d.variacion_continuan) < 0 ? ' (amortización)' : ''}`,
        factor: signoDecimal(d.variacion_continuan) < 0 ? 'la amortización de los préstamos que continúan' : 'el aumento de saldo de los préstamos que continúan',
      },
    ];
    // Factor principal: el componente que más empuja en la MISMA dirección que la variación.
    const aFavor = componentes.filter((c) => signoDecimal(c.monto) === signo);
    const principal = aFavor.reduce((max, c) => (compararDecimales(absoluto(c.monto), absoluto(max.monto)) > 0 ? c : max), aFavor[0]);
    causa = `Desglose de la variación: ${componentes.map((c) => c.texto).join('; ')}.`;
    if (principal) causa += ` Factor principal: ${principal.factor}.`;
  }

  const motivo = m.motivo ? `Se marca como significativo por: ${m.motivo}.` : '';
  return { titular, saldo, causa, motivo, texto: [titular, saldo, causa, motivo].filter(Boolean).join(' ') };
}

// Orden de "importancia" para destacar los principales movimientos (regla fija):
// 1.º cambios de líder, 2.º mayor salto de posición, 3.º mayor variación porcentual de saldo.
function compararImportancia(a, b) {
  const liderA = a.cambio_de_lider === 'SI' ? 1 : 0;
  const liderB = b.cambio_de_lider === 'SI' ? 1 : 0;
  if (liderA !== liderB) return liderB - liderA;
  const pasos = Math.abs(b.cambio_posicion) - Math.abs(a.cambio_posicion);
  if (pasos !== 0) return pasos;
  return compararDecimales(absoluto(b.var_saldo_pct ?? '0'), absoluto(a.var_saldo_pct ?? '0'));
}

// ---------------------------------------------------------------------
// "Qué cambió con este corte"
// ---------------------------------------------------------------------

/**
 * Resumen de un período recién cargado frente al período anterior.
 * @param {string} fecha período AAAAMMDD
 * @returns {Promise<null | {
 *   fecha: string, etiqueta: string, anterior: string|null, etiqueta_anterior: string|null,
 *   cascada: object, cascada_anterior: object|null,
 *   regla: {texto: string, min_cambio_posicion: string, marcar_cambio_lider: string, min_var_saldo_pct: string},
 *   total_movimientos: number, total_significativos: number,
 *   significativos_por_ranking: {ranking: string, nombre: string, significativos: number}[],
 *   cambios_lider: {ranking: string, nombre: string, nuevo: {codigo_banco: string, banco: string, saldo_actual: string},
 *                   sale: {codigo_banco: string, banco: string, posicion_actual: number}|null}[],
 *   significativos: (object & {explicacion: {titular: string, saldo: string, causa: string, motivo: string, texto: string}})[],
 *   principales: object[], reporte_movimientos: string|null}>}
 *   null si el período no está cargado. cascada = fila de calidad() (lib/consultas.js).
 */
export async function resumenCorte(fecha) {
  if (!esPeriodo(fecha)) return null;
  const [cascada] = await calidad(fecha);
  if (!cascada) return null;
  const anterior = await periodoAnterior(fecha);
  const regla = await reglaSignificativo();

  const base = {
    fecha,
    etiqueta: formatearFecha(fecha),
    anterior,
    etiqueta_anterior: anterior ? formatearFecha(anterior) : null,
    cascada,
    cascada_anterior: null,
    regla,
    total_movimientos: 0,
    total_significativos: 0,
    significativos_por_ranking: [],
    cambios_lider: [],
    significativos: [],
    principales: [],
    reporte_movimientos: null,
  };
  if (!anterior) return base; // primer período: no hay con qué comparar

  const [[cascadaAnterior], movs, descomp] = await Promise.all([
    calidad(anterior),
    movimientos({ anterior, actual: fecha }),
    descomposicion({ anterior, actual: fecha }),
  ]);

  // Cambios de líder por ranking (el motor marca al que llega al 1.º y al que lo pierde).
  const cambiosLider = [];
  const liderPorRanking = {};
  for (const r of RANKINGS) {
    const nuevo = movs.find((m) => m.ranking === r.clave && m.cambio_de_lider === 'SI' && m.posicion_actual === 1);
    if (!nuevo) continue;
    const sale = movs.find((m) => m.ranking === r.clave && m.cambio_de_lider === 'SI' && m.posicion_anterior === 1) ?? null;
    const item = {
      ranking: r.clave,
      nombre: r.nombre,
      nuevo: { codigo_banco: nuevo.codigo_banco, banco: nuevo.banco, saldo_actual: nuevo.saldo_actual },
      sale: sale ? { codigo_banco: sale.codigo_banco, banco: sale.banco, posicion_actual: sale.posicion_actual } : null,
    };
    cambiosLider.push(item);
    liderPorRanking[r.clave] = item;
  }

  const descPorClave = new Map(descomp.map((d) => [`${d.ranking}|${d.codigo_banco}`, d]));
  const significativos = movs
    .filter((m) => m.significativo)
    .map((m) => ({ ...m, explicacion: explicarMovimiento(m, descPorClave.get(`${m.ranking}|${m.codigo_banco}`), liderPorRanking[m.ranking]) }));

  return {
    ...base,
    cascada_anterior: cascadaAnterior ?? null,
    total_movimientos: movs.length,
    total_significativos: significativos.length,
    significativos_por_ranking: RANKINGS.map((r) => ({
      ranking: r.clave,
      nombre: r.nombre,
      significativos: significativos.filter((m) => m.ranking === r.clave).length,
    })),
    cambios_lider: cambiosLider,
    significativos,
    principales: [...significativos].sort(compararImportancia).slice(0, 8),
    reporte_movimientos: `/api/exportar/movimientos?anterior=${anterior}&actual=${fecha}`,
  };
}

/**
 * Cuántos movimientos marca la regla vigente en cada par de períodos consecutivos.
 * Sirve para ver de inmediato el efecto de cambiar un parámetro.
 * @returns {Promise<{anterior: string, actual: string, total: number, significativos: number,
 *   por_posicion: number, por_lider: number, por_saldo: number, por_nuevo: number}[]>}
 */
export async function efectoRegla() {
  const lista = (await consulta('SELECT fecha FROM res_calidad ORDER BY fecha')).map((f) => f.fecha);
  const pares = lista.slice(1).map((actual, i) => ({ anterior: lista[i], actual }));
  return Promise.all(pares.map(async ({ anterior, actual }) => {
    const movs = await movimientos({ anterior, actual });
    const sig = movs.filter((m) => m.significativo);
    const cuenta = (re) => sig.filter((m) => re.test(m.motivo)).length;
    return {
      anterior,
      actual,
      total: movs.length,
      significativos: sig.length,
      por_posicion: cuenta(/^(Sube|Baja) |; (Sube|Baja) /),
      por_lider: cuenta(/líder|liderazgo/),
      por_saldo: cuenta(/Saldo varía/),
      por_nuevo: cuenta(/Empieza a tener saldo/),
    };
  }));
}
