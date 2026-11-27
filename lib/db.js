// lib/db.js — Adaptador ÚNICO a la base de datos.
//
// * Si existe la variable DATABASE_URL se conecta a Postgres (Supabase) con pg.
// * Si no, usa PGlite: un Postgres completo embebido, guardado en la carpeta
//   PGLITE_DIR (por defecto .pgdata) o en memoria si PGLITE_DIR=':memory:'.
// El mismo SQL (db/*.sql) corre en ambos, así que el motor es uno solo.
//
// Al abrir la conexión se aplica el esquema y el motor (si cambiaron) y se
// cargan los catálogos desde datos/ cuando las tablas están vacías.
//
// Normalización de tipos (igual en pg y PGlite):
//   NUMERIC -> texto (nunca punto flotante: el dinero se suma en SQL)
//   enteros -> Number de JavaScript
// Este módulo solo debe usarse en el servidor.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';

const RAIZ = process.cwd();
const OID_INT8 = 20;
const OID_NUMERIC = 1700;

/** Lee un archivo del proyecto como texto. */
export function leerArchivoProyecto(relativo) {
  // turbopackIgnore: la ruta se arma en tiempo de ejecución; no hay que empaquetar todo el proyecto.
  return fs.readFileSync(path.join(/*turbopackIgnore: true*/ RAIZ, relativo), 'utf8');
}

/** Convierte un CSV (texto) en arreglo de objetos; todo queda como texto y se quita el BOM. */
export function leerCsvComoObjetos(texto) {
  return parse(texto, { bom: true, columns: true, skip_empty_lines: true, cast: false });
}

// ---------------------------------------------------------------------
// Conexión: devuelve un objeto con la misma forma para pg y para PGlite.
// ---------------------------------------------------------------------
async function abrirConexion() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // Supabase exige SSL; en un Postgres local no hace falta. Si se indica el
    // certificado raíz de Supabase (DATABASE_CA_FILE) se verifica el servidor;
    // si no, se cifra la conexión sin verificar el certificado (uso de demo).
    const ca = process.env.DATABASE_CA_FILE ? fs.readFileSync(process.env.DATABASE_CA_FILE, 'utf8') : null;
    const pool = new pg.Pool({
      connectionString: url,
      ssl: esLocal ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
      max: 5,
      types: {
        getTypeParser(oid, formato) {
          if (oid === OID_INT8) return (v) => Number(v);
          if (oid === OID_NUMERIC) return (v) => v;
          return pg.types.getTypeParser(oid, formato);
        },
      },
    });
    return {
      tipo: 'postgres',
      consulta: async (sql, params) => (await pool.query(sql, params)).rows,
      // Varias sentencias sin parámetros (protocolo simple de Postgres).
      script: async (sql) => { await pool.query(sql); },
      transaccion: async (fn) => {
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          const resultado = await fn({ consulta: async (s, p) => (await cliente.query(s, p)).rows });
          await cliente.query('COMMIT');
          return resultado;
        } catch (error) {
          await cliente.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          cliente.release();
        }
      },
      cerrar: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const carpeta = process.env.PGLITE_DIR || '.pgdata';
  const opciones = { parsers: { [OID_INT8]: (v) => Number(v), [OID_NUMERIC]: (v) => v } };
  const db = carpeta === ':memory:'
    ? new PGlite('memory://', opciones)
    : new PGlite(path.resolve(/*turbopackIgnore: true*/ RAIZ, carpeta), opciones);
  await db.waitReady;
  return {
    tipo: carpeta === ':memory:' ? 'pglite (memoria)' : `pglite (${carpeta})`,
    consulta: async (sql, params) => (await db.query(sql, params)).rows,
    script: async (sql) => { await db.exec(sql); },
    // Dentro de la transacción use SOLO tx.consulta (PGlite atiende una cosa a la vez).
    transaccion: (fn) => db.transaction((tx) => fn({ consulta: async (s, p) => (await tx.query(s, p)).rows })),
    cerrar: () => db.close(),
  };
}

// ---------------------------------------------------------------------
// Preparación: esquema, motor y catálogos. Es idempotente.
// ---------------------------------------------------------------------
async function prepararBase(cx) {
  await cx.script(leerArchivoProyecto('db/01_esquema.sql'));

  // El motor solo se recrea si el archivo 02_motor.sql cambió (se compara su huella).
  const sqlMotor = leerArchivoProyecto('db/02_motor.sql');
  const huella = crypto.createHash('sha256').update(sqlMotor).digest('hex');
  const [version] = await cx.consulta("SELECT valor FROM meta WHERE clave = 'version_motor'");
  const motorNuevo = !version || version.valor !== huella;
  if (motorNuevo) {
    await cx.script(sqlMotor);
    await cx.consulta(
      `INSERT INTO meta (clave, valor) VALUES ('version_motor', $1)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [huella],
    );
  }

  const catalogosCargados = await cargarCatalogosSiVacios(cx);

  // Si cambió el motor o un catálogo y ya hay cortes, se recalculan los resultados.
  if (motorNuevo || catalogosCargados) {
    const [{ hay }] = await cx.consulta('SELECT EXISTS (SELECT 1 FROM at03_filas) AS hay');
    if (hay) await cx.consulta('SELECT recalcular()');
  }
}

/** Definición de cada catálogo: archivo de origen, tabla y columnas (en orden). */
export const CATALOGOS = {
  bancos: {
    archivo: 'datos/Bancos_ficticios.csv',
    tabla: 'bancos',
    columnas: ['Codigo_Banco', 'Nombre_Ficticio', 'Tipo_Licencia'],
  },
  cinu: {
    archivo: 'datos/Catalogo_CINU_SB109_reto.csv',
    tabla: 'catalogo_cinu',
    columnas: ['Codigo_CINU', 'Descripcion', 'Macroactividad_Reto', 'Subactividad_Reto', 'Codigo_SB08_Referencia'],
  },
  sb21: {
    archivo: 'datos/Tabla_SB21_simplificada.csv',
    tabla: 'tabla_sb21',
    columnas: ['Codigo', 'Descripcion', 'Uso_en_reto'],
  },
};

/** Inserta las filas de un catálogo (objetos con las columnas del CSV) en su tabla. */
export async function insertarCatalogo(cx, nombre, filas) {
  const def = CATALOGOS[nombre];
  const columnasSql = def.columnas.map((c) => c.toLowerCase());
  const arreglos = def.columnas.map((c) => filas.map((f) => f[c]));
  const tipos = def.columnas.map((_, i) => `$${i + 1}::text[]`).join(', ');
  await cx.consulta(
    `INSERT INTO ${def.tabla} (${columnasSql.join(', ')}) SELECT * FROM unnest(${tipos})`,
    arreglos,
  );
}

async function cargarCatalogosSiVacios(cx) {
  let cargoAlguno = false;
  for (const [nombre, def] of Object.entries(CATALOGOS)) {
    const [{ n }] = await cx.consulta(`SELECT COUNT(*)::int AS n FROM ${def.tabla}`);
    if (n > 0) continue;
    const filas = leerCsvComoObjetos(leerArchivoProyecto(def.archivo));
    await insertarCatalogo(cx, nombre, filas);
    cargoAlguno = true;
  }
  return cargoAlguno;
}

// ---------------------------------------------------------------------
// Singleton en globalThis: Next recarga los módulos en desarrollo y no
// queremos abrir una base nueva (ni aplicar el esquema) en cada recarga.
// ---------------------------------------------------------------------
function obtenerConexion() {
  if (!globalThis.__baseRankings) {
    globalThis.__baseRankings = (async () => {
      const cx = await abrirConexion();
      await prepararBase(cx);
      return cx;
    })().catch((error) => {
      globalThis.__baseRankings = undefined; // permite reintentar
      throw error;
    });
  }
  return globalThis.__baseRankings;
}

/**
 * Ejecuta una consulta parametrizada ($1, $2, ...) y devuelve las filas.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<object[]>} NUMERIC llega como texto; enteros como Number.
 */
export async function consulta(sql, params = []) {
  const cx = await obtenerConexion();
  return cx.consulta(sql, params);
}

/**
 * Ejecuta fn dentro de una transacción (todo o nada).
 * @param {(tx: {consulta: (sql: string, params?: any[]) => Promise<object[]>}) => Promise<any>} fn
 */
export async function transaccion(fn) {
  const cx = await obtenerConexion();
  return cx.transaccion(fn);
}

/** Ejecuta un script SQL con varias sentencias (sin parámetros). */
export async function ejecutarScript(sql) {
  const cx = await obtenerConexion();
  return cx.script(sql);
}

/** Describe la base en uso: 'postgres', 'pglite (memoria)' o 'pglite (carpeta)'. */
export async function tipoBase() {
  const cx = await obtenerConexion();
  return cx.tipo;
}

/** Cierra la conexión (scripts y pruebas). */
export async function cerrar() {
  const promesa = globalThis.__baseRankings;
  globalThis.__baseRankings = undefined;
  if (promesa) {
    const cx = await promesa;
    await cx.cerrar();
  }
}
