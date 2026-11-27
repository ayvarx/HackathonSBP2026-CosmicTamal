// Pruebas de las exportaciones CSV: el archivo completo debe coincidir con la clave de control
// (mismos encabezados, mismas filas, mismos valores como texto exacto).
// La clave solo la leen las pruebas; la aplicación nunca la usa (regla R2).
// Usa PGlite EN MEMORIA, sin tocar la base de desarrollo.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

process.env.PGLITE_DIR = ':memory:';
delete process.env.DATABASE_URL;

const { cerrar } = await import('../lib/db.js');
const { cargarCorte } = await import('../lib/ingesta.js');
const { generarExportacion, leerFiltros, ErrorExportacion } = await import('../lib/consultas-reportes.js');

const RAIZ = process.cwd();
const leer = (relativo) => fs.readFileSync(path.join(RAIZ, relativo));
const filtrosDe = (consulta = '') => leerFiltros(new URLSearchParams(consulta));
const leerCsv = (texto) => parse(texto, { columns: true, bom: true, skip_empty_lines: true });

before(async () => {
  for (const p of ['202607', '202608', '202609']) {
    const nombreArchivo = `AT03_sintetico_${p}.csv`;
    const r = await cargarCorte({ nombreArchivo, contenido: leer(`datos/${nombreArchivo}`), perfil: 'administrador' });
    assert.equal(r.ok, true, r.mensaje);
  }
});
after(() => cerrar());

/** Compara un CSV exportado con un archivo de la clave: encabezados y cada fila, en el mismo orden. */
function compararConClave(csv, archivoClave, llaves) {
  const textoClave = leer(`tests/clave_de_control/${archivoClave}`).toString('utf8');
  const encabezadoClave = textoClave.split(/\r?\n/)[0];
  assert.equal(csv.split(/\r?\n/)[0].replace(/^﻿/, ''), encabezadoClave, 'el encabezado debe ser idéntico al de la clave');
  const filasApp = leerCsv(csv);
  const filasClave = leerCsv(textoClave);
  assert.equal(filasApp.length, filasClave.length, 'cantidad de filas distinta a la clave');
  const id = (f) => llaves.map((k) => f[k]).join('|');
  const mapa = new Map(filasApp.map((f) => [id(f), f]));
  assert.equal(mapa.size, filasApp.length, 'la llave de comparación no es única');
  const diferencias = [];
  for (const c of filasClave) {
    const f = mapa.get(id(c));
    if (!f) { diferencias.push(`falta: ${id(c)}`); continue; }
    for (const col of Object.keys(c)) if (f[col] !== c[col]) diferencias.push(`${id(c)} ${col}: app=${f[col]} clave=${c[col]}`);
  }
  assert.deepEqual(diferencias.slice(0, 10), [], `${diferencias.length} diferencias contra la clave`);
}

test('rankings completo = control_rankings.csv', async () => {
  const r = await generarExportacion('rankings', filtrosDe());
  assert.equal(r.filas, 216);
  assert.equal(r.nombreArchivo, 'rankings_20260731-20260930.csv');
  compararConClave(r.csv, 'control_rankings.csv', ['Fecha', 'Ranking', 'Codigo_Banco']);
});

test('subactividades completo = control_subactividades.csv', async () => {
  const r = await generarExportacion('subactividades', filtrosDe());
  compararConClave(r.csv, 'control_subactividades.csv', ['Fecha', 'Ranking', 'Subactividad', 'Codigo_Banco']);
});

test('calidad completo = control_calidad.csv', async () => {
  const r = await generarExportacion('calidad', filtrosDe());
  compararConClave(r.csv, 'control_calidad.csv', ['Fecha']);
});

test('exclusiones completo = control_exclusiones.csv (3,284 filas)', async () => {
  const r = await generarExportacion('exclusiones', filtrosDe());
  assert.equal(r.filas, 3284);
  compararConClave(r.csv, 'control_exclusiones.csv', ['Fecha', 'Fila_Archivo']);
});

test('movimientos completo = control_movimientos.csv (todos los pares de períodos)', async () => {
  const r = await generarExportacion('movimientos', filtrosDe());
  assert.equal(r.filas, 216);
  compararConClave(r.csv, 'control_movimientos.csv', ['Fecha_Anterior', 'Fecha_Actual', 'Ranking', 'Codigo_Banco']);
  const ext = await generarExportacion('movimientos', filtrosDe('extendido=1'));
  assert.match(ext.csv.split('\r\n')[0], /,Significativo,Motivo$/);
});

test('filtros: un período, un ranking y un banco devuelven solo esas filas', async () => {
  const r = await generarExportacion('rankings', filtrosDe('fecha=20260831&ranking=CONSTRUCCION'));
  assert.equal(r.filas, 12);
  assert.equal(r.nombreArchivo, 'rankings_20260831_construccion.csv');
  const uno = await generarExportacion('rankings', filtrosDe('periodo=20260831&banco=112'));
  assert.equal(uno.filas, 6);
  const mov = await generarExportacion('movimientos', filtrosDe('anterior=20260731&actual=20260831'));
  assert.equal(mov.filas, 72);
  const ex = await generarExportacion('exclusiones', filtrosDe('fecha=20260930&filtro=E2'));
  assert.equal(ex.filas, 1058);
});

test('reporte personalizado: períodos, rankings, bancos y columnas elegidos', async () => {
  const r = await generarExportacion('personalizado', filtrosDe('fechas=20260731,20260930&rankings=HIPOTECARIO&rankings=CONSUMO&bancos=101,112&columnas=Fecha,Ranking,Codigo_Banco,Saldo_Actividad'));
  const filas = leerCsv(r.csv);
  assert.equal(filas.length, 2 * 2 * 2);
  assert.deepEqual(Object.keys(filas[0]), ['Fecha', 'Ranking', 'Codigo_Banco', 'Saldo_Actividad']);
  // Los valores coinciden con la clave de control.
  const clave = leerCsv(leer('tests/clave_de_control/control_rankings.csv'));
  for (const f of filas) {
    const c = clave.find((x) => x.Fecha === f.Fecha && x.Ranking === f.Ranking && x.Codigo_Banco === f.Codigo_Banco);
    assert.equal(f.Saldo_Actividad, c.Saldo_Actividad);
  }
});

test('entradas inválidas o sin datos dan errores claros', async () => {
  assert.throws(() => filtrosDe('fecha=2026-07'), ErrorExportacion);
  assert.throws(() => filtrosDe('ranking=NADA'), ErrorExportacion);
  assert.throws(() => filtrosDe('banco=1;DROP'), ErrorExportacion);
  await assert.rejects(generarExportacion('rankings', filtrosDe('fecha=20251231')), (e) => e instanceof ErrorExportacion && e.estado === 404);
  await assert.rejects(generarExportacion('personalizado', filtrosDe('columnas=Inventada')), ErrorExportacion);
});
