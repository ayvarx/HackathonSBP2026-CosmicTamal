// scripts/prueba-e2e.mjs — Prueba de punta a punta (evidencia de pruebas para el jurado).
//
// Recorre el guion de la demostración contra la aplicación EN MARCHA, por HTTP, igual que
// un navegador: perfiles, pantallas, carga de un corte nuevo y descargas. Al final compara
// las exportaciones descargadas con la clave de control (tests/clave_de_control).
// La clave solo la lee esta prueba; la aplicación nunca la usa (regla R2).
//
// Uso:
//   npm run e2e               compila (next build) y prueba con "next start" (rápido)
//   npm run e2e -- --dev      usa "next dev" en lugar de compilar
//   npm run e2e -- --conservar  no borra las carpetas temporales al terminar
//
// Qué hace, en orden:
//   0. Base VACÍA: levanta el servidor sin cortes y recorre todas las pantallas (nada debe romperse).
//   1. Base limpia .pgdata-e2e: siembra julio y agosto con scripts/seed.mjs y levanta el servidor.
//   2. PÚBLICO: pantallas con datos, ranking con filtros, descarga CSV; NO puede cargar (403) ni ver /admin.
//   3. ADMINISTRADOR: archivo inválido (mensaje claro) y luego el corte de septiembre;
//      aparece 20260930, el resumen "Qué cambió" y los movimientos.
//   4. ANALISTA: compara períodos, abre el detalle de una cifra y descarga movimientos.
//   5. EXACTITUD: descarga las 5 exportaciones completas y las compara con la clave
//      (posiciones exactas, montos ±0.01, ponderación ±0.0001) en los 3 períodos.
//
// No usa Supabase aunque .env.local tenga DATABASE_URL: siempre PGlite en carpetas propias
// (.pgdata-e2e*, .next-e2e) y el puerto 3120 (cámbielo con E2E_PUERTO).
// El resultado queda también en tests/resultados/prueba-e2e.txt.

import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';

const RAIZ = process.cwd();
const ARGS = process.argv.slice(2);
const MODO_DEV = ARGS.includes('--dev');
const CONSERVAR = ARGS.includes('--conservar');
const PUERTO = Number(process.env.E2E_PUERTO || 3120);
const BASE = `http://localhost:${PUERTO}`;
const DIST = '.next-e2e';
const BASE_VACIA = '.pgdata-e2e-vacia';
const BASE_DATOS = '.pgdata-e2e';
// Secreto aleatorio SOLO para esta prueba: nunca se escribe en disco ni en el repositorio (R5).
const SECRETO = randomBytes(32).toString('hex');

const resultados = [];
const bitacora = [];
function anotar(texto) {
  bitacora.push(texto);
  console.log(texto);
}

/** Registra una comprobación: ok/falla con un detalle legible. */
function comprobar(fase, nombre, ok, detalle = '') {
  resultados.push({ fase, nombre, ok: Boolean(ok), detalle });
  anotar(`${ok ? '  ✓' : '  ✗'} [${fase}] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

function entornoServidor(carpetaBase) {
  return {
    ...process.env,
    DATABASE_URL: '', // nunca Supabase en la prueba
    PGLITE_DIR: carpetaBase,
    NEXT_DIST_DIR: DIST,
    SESSION_SECRET: SECRETO,
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

function ejecutar(comando, argumentos, env) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(comando, argumentos, { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (codigo) => (codigo === 0 ? resolver(salida) : rechazar(new Error(`${comando} ${argumentos.join(' ')} terminó con código ${codigo}\n${salida.slice(-3000)}`))));
  });
}

async function levantarServidor(carpetaBase) {
  const argumentos = MODO_DEV ? ['next', 'dev', '-p', String(PUERTO)] : ['next', 'start', '-p', String(PUERTO)];
  const hijo = spawn('npx', argumentos, { cwd: RAIZ, env: entornoServidor(carpetaBase), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let registro = '';
  hijo.stdout.on('data', (d) => { registro += d; });
  hijo.stderr.on('data', (d) => { registro += d; });
  const limite = Date.now() + 180_000;
  while (Date.now() < limite) {
    if (hijo.exitCode !== null) throw new Error(`El servidor se detuvo al arrancar:\n${registro.slice(-3000)}`);
    try {
      const r = await fetch(`${BASE}/perfil`, { redirect: 'manual' });
      if (r.status === 200) return { hijo, registro: () => registro };
    } catch { /* todavía no escucha */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió en 3 minutos:\n${registro.slice(-3000)}`);
}

async function apagarServidor(servidor) {
  if (!servidor || servidor.hijo.exitCode !== null) return;
  // detached: el proceso es líder de su grupo; se apaga el grupo completo (npx + next).
  try { process.kill(-servidor.hijo.pid, 'SIGTERM'); } catch { /* ya terminó */ }
  const limite = Date.now() + 10_000;
  while (servidor.hijo.exitCode === null && Date.now() < limite) await new Promise((r) => setTimeout(r, 200));
  try { process.kill(-servidor.hijo.pid, 'SIGKILL'); } catch { /* ya terminó */ }
}

// ---------------------------------------------------------------------------
// Perfiles: misma cookie firmada que lib/auth.js (perfil.emitidoEn.firma HMAC-SHA256).
// ---------------------------------------------------------------------------

function cookiePerfil(perfil) {
  const contenido = `${perfil}.${Math.floor(Date.now() / 1000)}`;
  const firma = createHmac('sha256', SECRETO).update(contenido).digest('base64url');
  return `sbp_perfil=${contenido}.${firma}`;
}

async function pedir(perfil, ruta, opciones = {}) {
  const r = await fetch(BASE + ruta, {
    redirect: 'manual',
    ...opciones,
    headers: { cookie: cookiePerfil(perfil), ...(opciones.headers || {}) },
  });
  const tipo = r.headers.get('content-type') || '';
  const cuerpo = tipo.includes('application/json') ? await r.json() : await r.text();
  return { estado: r.status, cuerpo, tipo, ubicacion: r.headers.get('location') || '', encabezados: r.headers };
}

/** Texto visible aproximado de una página HTML (sin etiquetas ni scripts). */
function textoVisible(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

const AVISO = 'Datos ficticios';
const FUENTE = 'Fuente:';
const TEXTOS_ERROR = ['Ocurrió un error al preparar la información', 'Unhandled Runtime Error', 'Internal Server Error', 'Application error'];

/** Página que debe abrirse (200), con la franja de fuente/período/aviso y sin errores. */
async function revisarPantalla(fase, perfil, ruta, { debeContener = [], periodoFranja } = {}) {
  let r = await pedir(perfil, ruta);
  // Algunas pantallas completan la URL (p. ej. agregan ?anterior=): se sigue esa redirección
  // interna, pero nunca la de /acceso-restringido (eso sería un bloqueo, no una pantalla abierta).
  if ([303, 307, 308].includes(r.estado) && r.ubicacion.startsWith('/') && !r.ubicacion.includes('/acceso-restringido')) {
    r = await pedir(perfil, r.ubicacion);
  }
  const texto = textoVisible(r.cuerpo);
  const faltan = [AVISO, FUENTE, 'Período en consulta', ...debeContener].filter((t) => !texto.includes(t));
  const errores = TEXTOS_ERROR.filter((t) => String(r.cuerpo).includes(t));
  // Texto de relleno o valores sin formatear que nunca deberían verse en pantalla.
  const basura = texto.match(/\bundefined\b|\bNaN\b|\[object Object\]|Lorem ipsum/);
  if (basura) errores.push(`texto inválido «${basura[0]}»`);
  if (periodoFranja && !texto.includes(periodoFranja)) faltan.push(`franja con «${periodoFranja}»`);
  comprobar(fase, `${perfil} abre ${ruta}`, r.estado === 200 && !faltan.length && !errores.length,
    `HTTP ${r.estado}${faltan.length ? `; falta: ${faltan.join(', ')}` : ''}${errores.length ? `; error: ${errores.join(', ')}` : ''}`);
  return { ...r, texto };
}

/** Página protegida: debe redirigir a /acceso-restringido (o responder 403). */
async function revisarBloqueo(fase, perfil, ruta) {
  const r = await pedir(perfil, ruta);
  const redirige = [303, 307, 308].includes(r.estado) && r.ubicacion.includes('/acceso-restringido');
  const bloqueaEnHtml = r.estado === 200 && String(r.cuerpo).includes('NEXT_REDIRECT') && String(r.cuerpo).includes('acceso-restringido');
  comprobar(fase, `${perfil} NO puede abrir ${ruta}`, redirige || bloqueaEnHtml || r.estado === 403, `HTTP ${r.estado} ${r.ubicacion}`);
}

// ---------------------------------------------------------------------------
// CSV y comparación con la clave de control
// ---------------------------------------------------------------------------

const leerCsv = (texto) => parse(texto, { columns: true, bom: true, skip_empty_lines: true });

/** Decimal en texto → entero escalado a 4 decimales (BigInt): comparar sin punto flotante. */
function aEscala4(texto) {
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const valor = BigInt(m[2]) * 10000n + BigInt((m[3] || '').padEnd(4, '0'));
  return m[1] ? -valor : valor;
}

/** Tolerancia de cada columna (sección 11.1): montos ±0.01, porcentajes ±0.0001, lo demás exacto. */
function tolerancia(columna) {
  if (/_Pct$/.test(columna)) return 1n;                       // 0.0001
  if (/^(Saldo|Total_Cartera|Var_Saldo$)/.test(columna)) return 100n; // 0.01
  return 0n;                                                  // posiciones, conteos, textos: exacto
}

function compararConClave(fase, nombre, csv, archivoClave, llaves) {
  const textoClave = fs.readFileSync(path.join(RAIZ, 'tests/clave_de_control', archivoClave), 'utf8');
  const encabezadoApp = csv.replace(/^﻿/, '').split(/\r?\n/)[0];
  const encabezadoClave = textoClave.split(/\r?\n/)[0];
  const app = leerCsv(csv);
  const clave = leerCsv(textoClave);
  const id = (f) => llaves.map((k) => f[k]).join('|');
  const mapa = new Map(app.map((f) => [id(f), f]));
  const diferencias = [];
  if (encabezadoApp !== encabezadoClave) diferencias.push(`encabezado distinto: ${encabezadoApp}`);
  if (app.length !== clave.length) diferencias.push(`filas: app=${app.length} clave=${clave.length}`);
  for (const c of clave) {
    const f = mapa.get(id(c));
    if (!f) { diferencias.push(`falta ${id(c)}`); continue; }
    for (const col of Object.keys(c)) {
      const tol = tolerancia(col);
      const a = aEscala4(f[col]);
      const b = aEscala4(c[col]);
      const igual = tol > 0n && a !== null && b !== null
        ? (a > b ? a - b : b - a) <= tol
        : f[col] === c[col];
      if (!igual) diferencias.push(`${id(c)} ${col}: app=${f[col]} clave=${c[col]}`);
    }
  }
  const periodos = [...new Set(clave.map((f) => f.Fecha ?? f.Fecha_Actual))].sort().join(', ');
  comprobar(fase, `${nombre} = ${archivoClave}`, diferencias.length === 0,
    diferencias.length ? `${diferencias.length} diferencias: ${diferencias.slice(0, 5).join(' · ')}` : `${clave.length} filas idénticas (períodos ${periodos})`);
}

async function descargarCsv(perfil, ruta) {
  const r = await pedir(perfil, ruta);
  const esCsv = r.estado === 200 && r.tipo.includes('text/csv');
  return { ...r, esCsv, filas: esCsv ? leerCsv(r.cuerpo) : [] };
}

// ---------------------------------------------------------------------------
// Carga de un corte por la ruta de Administración (igual que el formulario: gzip + multipart).
// ---------------------------------------------------------------------------

async function subirCorte(perfil, archivoConConsulta, { comprimir = true } = {}) {
  // "archivo.csv?modo=validar" → la parte después de "?" va a la URL de la ruta.
  const [archivo, consultaUrl] = archivoConConsulta.split('?');
  const bytes = fs.readFileSync(path.join(RAIZ, archivo));
  const nombre = path.basename(archivo);
  const formulario = new FormData();
  formulario.set('archivo', new Blob([comprimir ? gzipSync(bytes) : bytes]), comprimir ? `${nombre}.gz` : nombre);
  return pedir(perfil, `/api/admin/cortes${consultaUrl ? `?${consultaUrl}` : ''}`, { method: 'POST', body: formulario });
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

const PANTALLAS_PUBLICAS = ['/', '/rankings', '/indicadores', '/calidad', '/verificacion', '/reportes'];
const PANTALLAS_ANALISTA = ['/comparar', '/rankings/detalle', '/reportes/imprimir'];
const PANTALLAS_ADMIN = ['/admin', '/admin/resumen', '/admin/parametros', '/admin/catalogos', '/admin/bitacora'];

async function faseBaseVacia() {
  const fase = 'vacía';
  anotar('\n== Fase 0: base vacía (sin cortes cargados) ==');
  const servidor = await levantarServidor(BASE_VACIA);
  try {
    for (const ruta of [...PANTALLAS_PUBLICAS, ...PANTALLAS_ANALISTA, ...PANTALLAS_ADMIN, '/perfil']) {
      await revisarPantalla(fase, 'administrador', ruta, { periodoFranja: 'sin cortes cargados' });
    }
    // Las descargas sin datos responden con un mensaje claro (no un error 500).
    for (const conjunto of ['rankings', 'subactividades', 'calidad', 'exclusiones', 'movimientos']) {
      const r = await pedir('administrador', `/api/exportar/${conjunto}`);
      comprobar(fase, `exportar ${conjunto} sin cortes da un mensaje claro`, r.estado >= 400 && r.estado < 500 && typeof r.cuerpo?.mensaje === 'string',
        `HTTP ${r.estado}: ${r.cuerpo?.mensaje ?? String(r.cuerpo).slice(0, 80)}`);
    }
  } finally {
    await apagarServidor(servidor);
  }
}

async function fasePublico() {
  const fase = 'público';
  anotar('\n== Fase 2: perfil Público ==');
  for (const ruta of PANTALLAS_PUBLICAS) {
    await revisarPantalla(fase, 'publico', ruta, { debeContener: ['Banco'], periodoFranja: 'agosto de 2026' });
  }
  // Ranking con filtros: período, ranking y banco.
  const filtrado = await revisarPantalla(fase, 'publico', '/rankings?periodo=20260731&ranking=CONSTRUCCION&banco=112',
    { debeContener: ['Banco Solidez'], periodoFranja: 'julio de 2026' });
  comprobar(fase, 'el ranking filtrado muestra CONSTRUCCION', /Construcci[oó]n/i.test(filtrado.texto));

  const csv = await descargarCsv('publico', '/api/exportar/rankings?fecha=20260831&ranking=HIPOTECARIO');
  comprobar(fase, 'descarga CSV del ranking filtrado (12 bancos)', csv.esCsv && csv.filas.length === 12,
    `HTTP ${csv.estado}, ${csv.filas.length} filas, ${csv.encabezados.get('content-disposition') ?? ''}`);
  const sub = await descargarCsv('publico', '/api/exportar/subactividades?periodo=20260831&ranking=CONSUMO');
  comprobar(fase, 'descarga CSV de subactividades de CONSUMO (3 × 12)', sub.esCsv && sub.filas.length === 36, `HTTP ${sub.estado}, ${sub.filas.length} filas`);

  const carga = await subirCorte('publico', 'datos/AT03_sintetico_202609.csv');
  comprobar(fase, 'Público NO puede cargar un período (403)', carga.estado === 403, `HTTP ${carga.estado}: ${carga.cuerpo?.mensaje ?? ''}`);
  await revisarBloqueo(fase, 'publico', '/admin');
  await revisarBloqueo(fase, 'publico', '/comparar');
  await revisarBloqueo(fase, 'publico', '/rankings/detalle?periodo=20260831&ranking=HIPOTECARIO&banco=101');
  const aviso = await revisarPantalla(fase, 'publico', '/acceso-restringido?requiere=analista&desde=%2Frankings%2Fdetalle');
  comprobar(fase, 'el aviso de acceso nombra la sección y el perfil que se necesita',
    aviso.texto.includes('Detalle de préstamos') && aviso.texto.includes('Analista'));
  const mov = await pedir('publico', '/api/exportar/movimientos');
  comprobar(fase, 'Público NO descarga el reporte de movimientos de analista (403)', mov.estado === 403, `HTTP ${mov.estado}`);
  // Una cookie manipulada vale como Público.
  const falsa = await fetch(`${BASE}/api/admin/cortes`, { headers: { cookie: 'sbp_perfil=administrador.1.firmafalsa' } });
  comprobar(fase, 'una cookie de perfil falsificada no da acceso (403)', falsa.status === 403, `HTTP ${falsa.status}`);
}

async function faseAdministrador() {
  const fase = 'admin';
  anotar('\n== Fase 3: perfil Administrador ==');
  for (const ruta of PANTALLAS_ADMIN) await revisarPantalla(fase, 'administrador', ruta);

  for (const invalido of ['datos/pruebas_invalidas/columnas_faltantes.csv', 'datos/pruebas_invalidas/no_es_csv.csv', 'datos/pruebas_invalidas/ceros_perdidos.csv', 'datos/pruebas_invalidas/fecha_invalida.csv']) {
    const r = await subirCorte('administrador', invalido, { comprimir: false });
    const mensaje = r.cuerpo?.mensaje ?? '';
    comprobar(fase, `archivo inválido ${path.basename(invalido)} se rechaza con mensaje claro`,
      r.estado === 422 && r.cuerpo?.ok === false && mensaje.length > 10,
      `HTTP ${r.estado}: ${mensaje}${r.cuerpo?.errores?.[0] ? ` | ${r.cuerpo.errores[0].mensaje}` : ''}`);
  }
  const antes = await pedir('administrador', '/api/admin/cortes');
  comprobar(fase, 'los archivos inválidos no cambiaron los datos (siguen 2 períodos)', antes.cuerpo?.cortes?.length === 2,
    `${antes.cuerpo?.cortes?.length} cortes`);

  // "Solo validar" con el archivo SIN comprimir (~11 MB): llega completo y no escribe datos.
  const validacion = await subirCorte('administrador', 'datos/AT03_sintetico_202609.csv?modo=validar', { comprimir: false });
  comprobar(fase, 'validar el corte de septiembre sin comprimir (11 MB) no escribe datos', validacion.estado === 200 && validacion.cuerpo?.valido === true,
    `HTTP ${validacion.estado}: ${validacion.cuerpo?.filas ?? ''} filas, período ${validacion.cuerpo?.periodos?.join(', ') ?? validacion.cuerpo?.mensaje}`);

  const inicio = Date.now();
  const carga = await subirCorte('administrador', 'datos/AT03_sintetico_202609.csv');
  comprobar(fase, 'carga AT03_sintetico_202609.csv', carga.estado === 200 && carga.cuerpo?.ok === true,
    `HTTP ${carga.estado} en ${Date.now() - inicio} ms; períodos ${carga.cuerpo?.periodos?.join(', ') ?? carga.cuerpo?.mensaje}`);
  const resumen = carga.cuerpo?.resumen;
  comprobar(fase, 'el resumen "Qué cambió" compara contra agosto', resumen?.anterior === '20260831',
    `anterior=${resumen?.anterior}; ${resumen?.total_movimientos} movimientos, ${resumen?.total_significativos} significativos`);
  comprobar(fase, 'los movimientos significativos traen explicación automática',
    (resumen?.significativos ?? []).length > 0 && resumen.significativos.every((m) => (m.explicacion?.texto ?? '').length > 20),
    resumen?.significativos?.[0]?.explicacion?.texto ?? '');

  const cortes = await pedir('administrador', '/api/admin/cortes');
  const fechas = (cortes.cuerpo?.cortes ?? []).map((c) => c.fecha ?? c.periodo ?? c.periodos).join(', ');
  comprobar(fase, 'aparece el período 20260930', fechas.includes('20260930'), fechas);
  await revisarPantalla(fase, 'administrador', '/admin/resumen?periodo=20260930',
    { debeContener: ['Qué cambió con el corte de septiembre de 2026'], periodoFranja: 'septiembre de 2026' });
  const repetido = await subirCorte('administrador', 'datos/AT03_sintetico_202609.csv');
  comprobar(fase, 'volver a subir el mismo período se rechaza (409) con mensaje', repetido.estado === 409, `HTTP ${repetido.estado}: ${repetido.cuerpo?.mensaje ?? ''}`);
  const bitacora = await pedir('administrador', '/admin/bitacora');
  comprobar(fase, 'la bitácora registra la carga', textoVisible(bitacora.cuerpo).includes('AT03_sintetico_202609.csv'));
  // El Público ahora ve el corte nuevo como último corte.
  await revisarPantalla(fase, 'publico', '/', { periodoFranja: 'septiembre de 2026' });
}

async function faseAnalista() {
  const fase = 'analista';
  anotar('\n== Fase 4: perfil Analista ==');
  const comp = await revisarPantalla(fase, 'analista', '/comparar?anterior=20260831&periodo=20260930',
    { periodoFranja: 'agosto de 2026 → septiembre de 2026' });
  comprobar(fase, 'la comparación muestra movimientos', /sube|baja|significativ/i.test(comp.texto));
  const detalle = await revisarPantalla(fase, 'analista', '/rankings/detalle?periodo=20260930&ranking=HIPOTECARIO&banco=112',
    { debeContener: ['Banco Solidez'] });
  comprobar(fase, 'el detalle de la cifra lista préstamos', /-CR-\d+/.test(detalle.texto) || /\d{3}-[A-Z]{2}-\d+/.test(detalle.texto));
  await revisarPantalla(fase, 'analista', '/reportes/imprimir?fechas=20260930&rankings=HIPOTECARIO');
  const mov = await descargarCsv('analista', '/api/exportar/movimientos?anterior=20260831&actual=20260930');
  comprobar(fase, 'descarga el reporte de movimientos ago→sep (6 × 12)', mov.esCsv && mov.filas.length === 72, `HTTP ${mov.estado}, ${mov.filas.length} filas`);
  const pers = await descargarCsv('analista', '/api/exportar/personalizado?fechas=20260731,20260930&rankings=CONSUMO&bancos=101,112&columnas=Fecha,Ranking,Codigo_Banco,Saldo_Actividad');
  comprobar(fase, 'descarga un reporte personalizado', pers.esCsv && pers.filas.length === 4, `HTTP ${pers.estado}, ${pers.filas.length} filas`);
  const carga = await subirCorte('analista', 'datos/AT03_sintetico_202609.csv');
  comprobar(fase, 'Analista NO puede cargar un período (403)', carga.estado === 403, `HTTP ${carga.estado}`);
  await revisarBloqueo(fase, 'analista', '/admin');
}

async function faseExactitud() {
  const fase = 'exactitud';
  anotar('\n== Fase 5: exactitud de extremo a extremo contra la clave de control ==');
  const casos = [
    ['rankings', 'control_rankings.csv', ['Fecha', 'Ranking', 'Codigo_Banco']],
    ['subactividades', 'control_subactividades.csv', ['Fecha', 'Ranking', 'Subactividad', 'Codigo_Banco']],
    ['calidad', 'control_calidad.csv', ['Fecha']],
    ['exclusiones', 'control_exclusiones.csv', ['Fecha', 'Fila_Archivo']],
    ['movimientos', 'control_movimientos.csv', ['Fecha_Anterior', 'Fecha_Actual', 'Ranking', 'Codigo_Banco']],
  ];
  for (const [conjunto, archivo, llaves] of casos) {
    // movimientos exige Analista; las demás descargas son públicas.
    const perfil = conjunto === 'movimientos' ? 'analista' : 'publico';
    const r = await descargarCsv(perfil, `/api/exportar/${conjunto}`);
    if (!r.esCsv) { comprobar(fase, `descarga ${conjunto}`, false, `HTTP ${r.estado}`); continue; }
    compararConClave(fase, `exportación ${conjunto} (perfil ${perfil})`, r.cuerpo, archivo, llaves);
  }
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

function borrar(carpeta) {
  fs.rmSync(path.join(RAIZ, carpeta), { recursive: true, force: true });
}

async function principal() {
  const inicio = Date.now();
  anotar(`Prueba de punta a punta — ${new Date().toISOString()} — ${MODO_DEV ? 'next dev' : 'next build + next start'} en ${BASE}`);
  borrar(BASE_VACIA);
  borrar(BASE_DATOS);
  let servidor;
  try {
    if (!MODO_DEV) {
      anotar('Compilando (next build)…');
      await ejecutar('npx', ['next', 'build'], entornoServidor(BASE_VACIA));
    }
    await faseBaseVacia();

    anotar('\n== Fase 1: base limpia y siembra de julio y agosto (scripts/seed.mjs) ==');
    const siembra = await ejecutar('node', ['scripts/seed.mjs', '202607', '202608'], entornoServidor(BASE_DATOS));
    for (const linea of siembra.trim().split('\n')) anotar(`  ${linea}`);
    comprobar('siembra', 'julio y agosto cargados', /20260731/.test(siembra) && /20260831/.test(siembra));

    servidor = await levantarServidor(BASE_DATOS);
    await fasePublico();
    await faseAdministrador();
    await faseAnalista();
    await faseExactitud();
  } catch (error) {
    comprobar('general', 'la prueba terminó sin errores inesperados', false, error.message);
  } finally {
    await apagarServidor(servidor);
    if (!CONSERVAR) {
      borrar(BASE_VACIA);
      borrar(BASE_DATOS);
      borrar(DIST);
    }
  }

  const fallas = resultados.filter((r) => !r.ok);
  anotar(`\nResultado: ${resultados.length - fallas.length} de ${resultados.length} comprobaciones correctas en ${Math.round((Date.now() - inicio) / 1000)} s.`);
  if (fallas.length) {
    anotar('Fallas:');
    for (const f of fallas) anotar(`  ✗ [${f.fase}] ${f.nombre} — ${f.detalle}`);
  }
  fs.mkdirSync(path.join(RAIZ, 'tests/resultados'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'tests/resultados/prueba-e2e.txt'), bitacora.join('\n') + '\n');
  process.exitCode = fallas.length ? 1 : 0;
}

await principal();
