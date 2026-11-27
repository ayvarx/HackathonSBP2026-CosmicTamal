// Pruebas del motor de rankings contra la clave de control oficial.
// Se ejecutan con "npm test": usan PGlite EN MEMORIA (sin internet y sin
// tocar la base de desarrollo). La clave de control (tests/clave_de_control)
// solo la leen estas pruebas; la aplicación nunca la usa (regla R2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

// Antes de importar la capa de datos: base en memoria, nunca Supabase.
process.env.PGLITE_DIR = ':memory:';
delete process.env.DATABASE_URL;

const { consulta, cerrar } = await import('../lib/db.js');
const { cargarCorte, validarCorte } = await import('../lib/ingesta.js');
const q = await import('../lib/consultas.js');

const RAIZ = process.cwd();
const leer = (relativo) => fs.readFileSync(path.join(RAIZ, relativo));
const clave = (nombre) => parse(leer(`tests/clave_de_control/${nombre}`), { columns: true, bom: true, skip_empty_lines: true });

async function cargar(periodo, opciones = {}) {
  const nombreArchivo = `AT03_sintetico_${periodo}.csv`;
  return cargarCorte({ nombreArchivo, contenido: leer(`datos/${nombreArchivo}`), perfil: 'administrador', ...opciones });
}

/** Mide el tiempo de una consulta y lo muestra en el reporte de pruebas. */
async function medir(t, nombre, fn) {
  const inicio = performance.now();
  const resultado = await fn();
  t.diagnostic(`${nombre}: ${Math.round(performance.now() - inicio)} ms`);
  return resultado;
}

/**
 * Compara filas de la aplicación contra un CSV de la clave, campo por campo,
 * como TEXTO exacto (montos al centavo, ponderación a 4 decimales).
 */
function compararConClave(filasApp, filasClave, llaves) {
  const idApp = (f) => llaves.map((k) => String(f[k.toLowerCase()])).join('|');
  const idClave = (f) => llaves.map((k) => f[k]).join('|');
  const mapa = new Map(filasApp.map((f) => [idApp(f), f]));
  const diferencias = [];
  for (const c of filasClave) {
    const f = mapa.get(idClave(c));
    if (!f) { diferencias.push(`falta en la app: ${idClave(c)}`); continue; }
    for (const columna of Object.keys(c)) {
      const valor = f[columna.toLowerCase()];
      const texto = valor === null || valor === undefined ? '' : String(valor);
      if (texto !== c[columna]) diferencias.push(`${idClave(c)} ${columna}: app=${texto} clave=${c[columna]}`);
    }
  }
  assert.equal(filasApp.length, filasClave.length, 'cantidad de filas distinta a la clave');
  assert.equal(mapa.size, filasApp.length, 'la llave de comparación no es única');
  assert.deepEqual(diferencias.slice(0, 15), [], `${diferencias.length} diferencias contra la clave`);
}

test('automatización: con julio y agosto cargados, septiembre se agrega sin tocar código', async (t) => {
  for (const p of ['202607', '202608']) {
    const r = await medir(t, `carga ${p}`, () => cargar(p));
    assert.equal(r.ok, true, r.mensaje);
  }
  assert.deepEqual((await q.periodos()).map((p) => p.fecha), ['20260731', '20260831']);
  assert.equal((await q.movimientos()).length, 72, 'un solo par de períodos = 6 rankings × 12 bancos');

  const r = await medir(t, 'carga 202609 (30,000 filas + recálculo)', () => cargar('202609'));
  assert.equal(r.ok, true, r.mensaje);
  assert.deepEqual(r.periodos, ['20260930']);
  assert.equal(r.filas, 30000);
  assert.equal(r.cascada[0].universo_local_valido, 28802);
  assert.deepEqual((await q.periodos()).map((p) => p.fecha), ['20260731', '20260831', '20260930']);
  assert.equal((await q.movimientos({ anterior: '20260831', actual: '20260930' })).length, 72);
  assert.equal((await q.movimientos()).length, 216, '3 pares (jul→ago, ago→sep, jul→sep)');
});

test('calidad: E1–E4 y universo válido idénticos a control_calidad.csv', async (t) => {
  const filas = await medir(t, 'calidad()', () => q.calidad());
  compararConClave(filas, clave('control_calidad.csv'), ['Fecha']);
});

test('exclusiones: las 3,284 filas excluidas con su filtro, idénticas a la clave', async (t) => {
  const r = await medir(t, 'exclusiones(todas)', () => q.exclusiones({ tamano: 100000 }));
  assert.equal(r.total, 3284);
  compararConClave(r.filas, clave('control_exclusiones.csv'), ['Fecha', 'Fila_Archivo']);
  const pagina = await medir(t, 'exclusiones(página de 50)', () => q.exclusiones({ fecha: '20260930', filtro: 'E2', pagina: 2 }));
  assert.equal(pagina.filas.length, 50);
  assert.equal(pagina.total, 1058);
});

test('rankings: 216 celdas (posición, saldos al centavo, ponderación exacta)', async (t) => {
  const filas = [];
  for (const fecha of ['20260731', '20260831', '20260930']) {
    filas.push(...(await medir(t, `rankings(${fecha})`, () => q.rankings({ fecha }))));
  }
  compararConClave(filas, clave('control_rankings.csv'), ['Fecha', 'Ranking', 'Codigo_Banco']);
});

test('subactividades: 792 celdas con la reclasificación SB21 a Tarjeta', async (t) => {
  const filas = [];
  for (const fecha of ['20260731', '20260831', '20260930']) {
    filas.push(...(await medir(t, `subactividades(${fecha})`, () => q.subactividades({ fecha }))));
  }
  compararConClave(filas, clave('control_subactividades.csv'), ['Fecha', 'Ranking', 'Subactividad', 'Codigo_Banco']);
});

test('movimientos: 216 filas entre todos los pares de períodos', async (t) => {
  const filas = await medir(t, 'movimientos(todos)', () => q.movimientos());
  compararConClave(filas, clave('control_movimientos.csv'), ['Fecha_Anterior', 'Fecha_Actual', 'Ranking', 'Codigo_Banco']);
});

test('reconciliaciones 1, 2 y 3 cuadran al centavo en los 3 períodos', async (t) => {
  const calidadClave = clave('control_calidad.csv');
  for (const c of calidadClave) {
    const r = await medir(t, `reconciliaciones(${c.Fecha})`, () => q.reconciliaciones(c.Fecha));
    assert.deepEqual(r.resumen.map((x) => [x.reconciliacion, x.comprobaciones, x.todas_cuadran]), [[1, 72, true], [2, 12, true], [3, 1, true]]);
    assert.ok(r.detalle.every((d) => d.diferencia === '0.00'));
    // Reconciliación 3: el total coincide con el saldo del universo de la clave.
    assert.equal(r.detalle.find((d) => d.reconciliacion === 3).esperado, c.Saldo_Universo_Local_Valido);
  }
});

test('unicidad: ningún Numero_Prestamo se repite en el universo válido de un período', async () => {
  const filas = await consulta(
    'SELECT fecha, COUNT(*)::int AS n, COUNT(DISTINCT numero_prestamo)::int AS distintos FROM v_universo GROUP BY fecha ORDER BY fecha',
  );
  assert.equal(filas.length, 3);
  for (const f of filas) assert.equal(f.n, f.distintos, `préstamos repetidos en ${f.fecha}`);
});

test('descomposición: nuevos + salidos + continúan = Var_Saldo (exacto, en SQL)', async (t) => {
  const filas = await medir(t, 'descomposicion(ago→sep)', () => q.descomposicion({ anterior: '20260831', actual: '20260930' }));
  assert.equal(filas.length, 72);
  const [{ malas }] = await consulta(
    `SELECT COUNT(*)::int AS malas FROM res_descomposicion
     WHERE saldo_nuevos + saldo_salidos + variacion_continuan <> var_saldo`,
  );
  assert.equal(malas, 0);
});

test('detalle de préstamos: el total cuadra con el ranking', async (t) => {
  const [fila] = await q.rankings({ fecha: '20260930', ranking: 'CONSUMO' });
  const d = await medir(t, 'detallePrestamos', () => q.detallePrestamos({ fecha: '20260930', ranking: 'CONSUMO', banco: fila.codigo_banco, tamano: 10 }));
  assert.equal(d.saldo_total, fila.saldo_actividad);
  assert.equal(d.total_operaciones, fila.operaciones_validas);
  assert.equal(d.filas.length, 10);
});

test('alertas, panel y catálogos responden', async (t) => {
  const a = await medir(t, 'alertas', () => q.alertas('20260930'));
  assert.ok(Array.isArray(a.resumen));
  const panel = await medir(t, 'resumenPanel', () => q.resumenPanel());
  assert.equal(panel.fecha, '20260930');
  assert.equal(panel.rankings.length, 6);
  assert.equal(panel.universo.universo_local_valido, 28802);
  assert.equal(panel.reconciliaciones_cuadran, true);
  const cat = await q.catalogos();
  assert.equal(cat.bancos.length, 12);
  assert.equal(cat.cinu.length, 22);
  assert.equal(cat.sb21.length, 6);
  assert.equal(cat.sb21.find((s) => s.codigo === '07').descripcion, 'Tarjeta de credito');
});

test('parámetros: la regla de movimiento significativo es configurable', async () => {
  const base = (await q.movimientos({ anterior: '20260731', actual: '20260930' })).filter((m) => m.significativo).length;
  assert.equal((await q.guardarParametro('min_cambio_posicion', '1', 'administrador')).ok, true);
  assert.equal((await q.guardarParametro('min_var_saldo_pct', '1000', 'administrador')).ok, true);
  const conUno = await q.movimientos({ anterior: '20260731', actual: '20260930' });
  assert.ok(conUno.filter((m) => m.significativo).every((m) => m.cambio_posicion !== 0 || m.cambio_de_lider === 'SI'));
  assert.notEqual(conUno.filter((m) => m.significativo).length, base);
  assert.equal((await q.guardarParametro('min_cambio_posicion', 'dos', 'administrador')).ok, false);
  assert.equal((await q.guardarParametro('min_cambio_posicion', '2', 'publico')).ok, false);
  await q.guardarParametro('min_cambio_posicion', '2', 'administrador');
  await q.guardarParametro('min_var_saldo_pct', '10', 'administrador');
});

test('un período repetido se rechaza; con "reemplazar" se sustituye', async (t) => {
  const repetido = await cargar('202609');
  assert.equal(repetido.ok, false);
  assert.match(repetido.mensaje, /ya está cargado/);
  assert.equal((await q.periodos()).length, 3);

  const reemplazo = await medir(t, 'reemplazo 202609', () => cargar('202609', { reemplazar: true }));
  assert.equal(reemplazo.ok, true, reemplazo.mensaje);
  assert.equal(reemplazo.reemplazado, true);
  const [cal] = await q.calidad('20260930');
  assert.equal(cal.filas_leidas, 30000);
  assert.equal(cal.saldo_universo_local_valido, '5152103850.27');

  const publico = await cargarCorte({ nombreArchivo: 'x.csv', contenido: leer('datos/AT03_sintetico_202609.csv'), perfil: 'publico' });
  assert.equal(publico.ok, false);
  assert.match(publico.mensaje, /Administrador/);
});

test('cada archivo inválido da un mensaje claro', async () => {
  const casos = [
    ['columnas_faltantes.csv', /Faltan 1 columna\(s\) en el encabezado: Destino/],
    ['ceros_perdidos.csv', /ceros a la izquierda .*Facilidad_Crediticia: vale "\d" y debería ser "0\d"/],
    ['fecha_invalida.csv', /Fecha inválida en la fila 3: "31\/07\/2026"/],
    ['no_es_csv.csv', /no parece un CSV del AT03/],
  ];
  for (const [archivo, esperado] of casos) {
    const contenido = leer(`datos/pruebas_invalidas/${archivo}`);
    const v = validarCorte(contenido, archivo);
    assert.equal(v.valido, false, archivo);
    assert.ok(v.errores.some((e) => esperado.test(e.mensaje)), `${archivo}: ${JSON.stringify(v.errores.map((e) => e.mensaje))}`);
    const r = await cargarCorte({ nombreArchivo: archivo, contenido, perfil: 'administrador' });
    assert.equal(r.ok, false, archivo);
  }
  const binario = validarCorte(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), 'libro.xlsx');
  assert.match(binario.errores[0].mensaje, /no es un CSV de texto/);
  assert.equal((await q.periodos()).length, 3, 'los archivos inválidos no cambian nada');

  const errores = (await q.bitacora({ limite: 50 })).filter((b) => b.resultado === 'error');
  assert.ok(errores.length >= 4, 'los rechazos quedan en la bitácora');
});

test.after(async () => {
  await cerrar();
});
