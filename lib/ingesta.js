// lib/ingesta.js — Carga y validación de cortes AT03 y de catálogos.
//
// Flujo de una carga: validar el archivo -> comprobar que el período no esté
// cargado -> insertar las filas por lotes -> recalcular() el motor SQL ->
// anotar en la bitácora. Todo dentro de una transacción: o entra el corte
// completo o no entra nada.

import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { transaccion, leerArchivoProyecto, leerCsvComoObjetos, CATALOGOS, insertarCatalogo } from './db.js';
import { registrarBitacora } from './consultas.js';

/** Perfiles que pueden modificar datos (los scripts de instalación usan 'sistema'). */
const PERFILES_ESCRITURA = ['administrador', 'sistema'];

/** Máximo de errores detallados que se devuelven (el total siempre se informa). */
const MAX_ERRORES = 25;

/** Filas por lote al insertar (equilibrio entre velocidad y tamaño de cada consulta). */
const TAMANO_LOTE = 5000;

// Nombres y orden oficiales de las 61 columnas, leídos del diccionario de datos.
let columnasDiccionario = null;
export function columnasAT03() {
  if (!columnasDiccionario) {
    columnasDiccionario = leerCsvComoObjetos(leerArchivoProyecto('datos/Diccionario_datos_AT03_reto.csv')).map((f) => f.Campo);
  }
  return columnasDiccionario;
}

/** Nombre de la columna en la tabla at03_filas (la de Saldo guarda el texto original). */
function columnaSql(nombre) {
  return nombre === 'Saldo' ? 'saldo_texto' : nombre.toLowerCase();
}

// Columnas que son códigos numéricos de largo fijo. Si llegan más cortas
// es porque se perdieron ceros a la izquierda (típico al abrir en Excel):
// por ejemplo Facilidad_Crediticia '7' en vez de '07'.
const CODIGOS_LARGO_FIJO = {
  Preferencial_No_Preferencial: 4,
  Tipo_Credito: 3,
  Facilidad_Crediticia: 2,
  Clasificacion_Prestamo: 2,
  Codigo_Region: 3,
  Tamano_Empresa: 2,
  Genero: 2,
  Primera_Garantia: 4,
  Periodicidad_Pago_Capital: 2,
  Periodicidad_Pago_Intereses: 2,
  Perfil_Vencimiento: 2,
  Metodologia_Calculo_Intereses: 2,
};

const RE_FECHA = /^\d{8}$/;
const RE_MONTO = /^-?\d+(\.\d{1,2})?$/;

function fechaValida(texto) {
  if (!RE_FECHA.test(texto)) return false;
  const a = Number(texto.slice(0, 4));
  const m = Number(texto.slice(4, 6));
  const d = Number(texto.slice(6, 8));
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Convierte el contenido recibido (Buffer, Uint8Array, ArrayBuffer o texto) en texto. */
function aTexto(contenido) {
  if (typeof contenido === 'string') return { texto: contenido, binario: contenido.includes('\u0000') };
  const bytes = contenido instanceof ArrayBuffer ? new Uint8Array(contenido) : contenido;
  const binario = bytes.includes(0);
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { texto: '', binario: true };
  }
  return { texto, binario };
}

/**
 * Analiza un corte AT03 y devuelve los errores y, si es válido, los registros.
 * Uso interno de validarCorte y cargarCorte.
 */
function analizarCorte(contenido, nombreArchivo) {
  const errores = [];
  let totalErrores = 0;
  const agregar = (error) => {
    totalErrores += 1;
    if (errores.length < MAX_ERRORES) errores.push(error);
  };
  const resultado = (extra = {}) => ({ valido: totalErrores === 0, errores, totalErrores, ...extra });

  const { texto, binario } = aTexto(contenido);
  if (binario) {
    agregar({ fila: null, columna: null, mensaje: `El archivo "${nombreArchivo}" no es un CSV de texto (parece un archivo binario, por ejemplo un Excel .xlsx o un PDF). Exporte los datos como CSV UTF-8 separado por comas.` });
    return resultado();
  }
  if (!texto.trim()) {
    agregar({ fila: null, columna: null, mensaje: `El archivo "${nombreArchivo}" está vacío.` });
    return resultado();
  }

  // Parser CSV real: respeta comillas, quita el BOM y acepta CRLF o LF.
  // Todo queda como TEXTO (no se convierten tipos) para no perder ceros.
  let registros;
  try {
    registros = parse(texto, { bom: true, relax_column_count: true, skip_empty_lines: true, info: true });
  } catch (error) {
    agregar({ fila: error.lines ?? null, columna: null, mensaje: `El archivo no se puede leer como CSV (línea ${error.lines ?? '?'}): ${error.message}. Revise que las comillas estén cerradas y que el separador sea la coma.` });
    return resultado();
  }

  // 1) Encabezado: 61 columnas con los nombres y el orden del diccionario.
  const esperadas = columnasAT03();
  const encabezado = (registros[0]?.record ?? []).map((c) => c.trim());
  if (encabezado.length < 2) {
    agregar({ fila: 1, columna: null, mensaje: `El archivo "${nombreArchivo}" no parece un CSV del AT03: la primera línea debería ser el encabezado con ${esperadas.length} columnas separadas por coma y solo tiene ${encabezado.length}. Verifique que eligió el archivo correcto y que el separador sea la coma (no punto y coma).` });
    return resultado();
  }
  const faltantes = esperadas.filter((c) => !encabezado.includes(c));
  const sobrantes = encabezado.filter((c) => !esperadas.includes(c));
  if (faltantes.length) {
    agregar({ fila: 1, columna: faltantes.join(', '), mensaje: `Faltan ${faltantes.length} columna(s) en el encabezado: ${faltantes.join(', ')}. El archivo debe tener las ${esperadas.length} columnas del diccionario AT03.` });
  }
  if (sobrantes.length) {
    agregar({ fila: 1, columna: sobrantes.join(', '), mensaje: `El encabezado tiene columna(s) que no existen en el diccionario: ${sobrantes.join(', ')}. Revise la ortografía (mayúsculas, espacios) o elimínelas.` });
  }
  if (!faltantes.length && !sobrantes.length) {
    const pos = esperadas.findIndex((c, i) => encabezado[i] !== c);
    if (pos !== -1 || encabezado.length !== esperadas.length) {
      agregar({ fila: 1, columna: encabezado[pos], mensaje: `Las columnas no están en el orden del diccionario: en la posición ${pos + 1} se esperaba "${esperadas[pos]}" y se encontró "${encabezado[pos]}". Reordene las columnas según el diccionario.` });
    }
  }
  if (totalErrores) return resultado();

  // 2) Filas: cantidad de columnas, celdas vacías, Fecha, Saldo y ceros perdidos.
  const iFecha = esperadas.indexOf('Fecha');
  const iSaldo = esperadas.indexOf('Saldo');
  const iPrestamo = esperadas.indexOf('Numero_Prestamo');
  const codigos = Object.entries(CODIGOS_LARGO_FIJO).map(([nombre, largo]) => [nombre, esperadas.indexOf(nombre), largo]);
  const periodos = new Set();
  const filas = [];
  for (let k = 1; k < registros.length; k++) {
    const { record, info } = registros[k];
    const linea = info.lines; // línea física del archivo (el encabezado es la 1)
    if (record.length !== esperadas.length) {
      agregar({ fila: linea, columna: null, mensaje: `La fila ${linea} tiene ${record.length} columnas y deben ser ${esperadas.length}. Revise si hay comas de más o celdas faltantes en esa fila.` });
      continue;
    }
    const vacia = record.findIndex((v) => v === '');
    if (vacia !== -1) {
      agregar({ fila: linea, columna: esperadas[vacia], mensaje: `La fila ${linea} tiene la celda "${esperadas[vacia]}" vacía. En el AT03 no hay celdas vacías: use NA cuando el dato no aplica.` });
    }
    const fecha = record[iFecha];
    if (!fechaValida(fecha)) {
      agregar({ fila: linea, columna: 'Fecha', mensaje: `Fecha inválida en la fila ${linea}: "${fecha}". Debe tener formato AAAAMMDD (8 dígitos, por ejemplo 20260930) y ser una fecha real.` });
    } else {
      periodos.add(fecha);
    }
    const saldo = record[iSaldo];
    if (!RE_MONTO.test(saldo)) {
      agregar({ fila: linea, columna: 'Saldo', mensaje: `Saldo no numérico en la fila ${linea}: "${saldo}". Debe ser un número con punto decimal, sin separador de miles y con hasta 2 decimales (por ejemplo 15230.75).` });
    }
    if (!record[iPrestamo] || record[iPrestamo] === 'NA') {
      agregar({ fila: linea, columna: 'Numero_Prestamo', mensaje: `La fila ${linea} no tiene Numero_Prestamo. Es la llave de cada operación y es obligatoria.` });
    }
    for (const [nombre, i, largo] of codigos) {
      const v = record[i];
      if (/^\d+$/.test(v) && v.length < largo) {
        agregar({ fila: linea, columna: nombre, mensaje: `Se perdieron ceros a la izquierda en la fila ${linea}, columna ${nombre}: vale "${v}" y debería ser "${v.padStart(largo, '0')}". Suele pasar al abrir y guardar el CSV en Excel. Vuelva a exportarlo importando esa columna como Texto.` });
      }
    }
    filas.push({ linea, valores: record });
  }
  if (registros.length < 2) {
    agregar({ fila: null, columna: null, mensaje: 'El archivo solo tiene el encabezado; no contiene filas de datos.' });
  }

  // Advertencia (no error): el nombre del archivo sugiere otro período.
  const advertencias = [];
  const enNombre = /(\d{6})/.exec(nombreArchivo || '')?.[1];
  if (enNombre && periodos.size && ![...periodos].some((p) => p.startsWith(enNombre))) {
    advertencias.push(`El nombre del archivo sugiere el período ${enNombre}, pero la columna Fecha dice ${[...periodos].join(', ')}. Se usa la columna Fecha.`);
  }
  if (periodos.size > 1) {
    advertencias.push(`El archivo trae ${periodos.size} períodos distintos (${[...periodos].sort().join(', ')}); cada uno se calcula por separado.`);
  }

  return resultado({ periodos: [...periodos].sort(), filas: filas.length, registros: filas, advertencias, texto });
}

/**
 * Valida un corte AT03 sin cargarlo.
 * @param {string|Buffer|Uint8Array} textoCsv contenido del archivo
 * @param {string} nombreArchivo
 * @returns {{valido: boolean, errores: {fila: number|null, columna: string|null, mensaje: string}[],
 *            totalErrores: number, periodos?: string[], filas?: number, advertencias?: string[]}}
 *   errores trae como máximo 25 mensajes; totalErrores es el conteo completo.
 */
export function validarCorte(textoCsv, nombreArchivo) {
  const { registros, texto, ...resumen } = analizarCorte(textoCsv, nombreArchivo);
  return resumen;
}

/**
 * Valida y carga un corte AT03, recalcula el motor y lo anota en la bitácora.
 * @param {{nombreArchivo: string, contenido: string|Buffer|Uint8Array, perfil: string, reemplazar?: boolean}} opciones
 * @returns {Promise<
 *   {ok: true, archivo: string, periodos: string[], filas: number, reemplazado: boolean,
 *    duracion_ms: number, advertencias: string[], cascada: object[]}
 * | {ok: false, archivo: string, mensaje: string, errores: object[], totalErrores: number, periodos?: string[]}>}
 *   cascada = filas de calidad (mismas columnas que calidad()) de los períodos cargados.
 */
export async function cargarCorte({ nombreArchivo, contenido, perfil, reemplazar = false }) {
  const inicio = Date.now();
  const archivo = nombreArchivo || 'archivo_sin_nombre.csv';
  const fallar = async (mensaje, errores = [], extra = {}) => {
    await registrarBitacora({ perfil: perfil || 'desconocido', operacion: 'carga_corte', detalle: `${archivo}: ${mensaje}`, resultado: 'error', duracion_ms: Date.now() - inicio });
    return { ok: false, archivo, mensaje, errores, totalErrores: errores.length, ...extra };
  };

  // Control de acceso también aquí (además del de las pantallas): solo el administrador carga.
  if (!PERFILES_ESCRITURA.includes(perfil)) {
    return fallar('Solo el perfil Administrador puede cargar cortes.');
  }

  const analisis = analizarCorte(contenido, archivo);
  if (!analisis.valido) {
    return fallar(`archivo rechazado (${analisis.totalErrores} error(es)). ${analisis.errores[0]?.mensaje ?? ''}`, analisis.errores, { totalErrores: analisis.totalErrores });
  }
  const { periodos, registros, texto } = analisis;
  const sha256 = crypto.createHash('sha256').update(texto).digest('hex');
  const columnas = columnasAT03();

  try {
    const resumen = await transaccion(async (tx) => {
      // Un período ya cargado solo se reemplaza si se pide explícitamente.
      const existentes = await tx.consulta(
        `SELECT DISTINCT f.fecha, c.archivo, to_char(c.cargado_en, 'YYYY-MM-DD HH24:MI') AS cargado_en
         FROM at03_filas f JOIN cortes c ON c.id = f.corte_id
         WHERE f.fecha = ANY($1::text[]) ORDER BY f.fecha`,
        [periodos],
      );
      if (existentes.length && !reemplazar) {
        const lista = existentes.map((e) => `${e.fecha} (archivo ${e.archivo}, cargado ${e.cargado_en})`).join('; ');
        const error = new Error(`El período ya está cargado: ${lista}. Si quiere sustituirlo, vuelva a cargarlo marcando la opción "reemplazar".`);
        error.esValidacion = true;
        throw error;
      }
      if (existentes.length) {
        await tx.consulta('DELETE FROM at03_filas WHERE fecha = ANY($1::text[])', [periodos]);
        await tx.consulta('DELETE FROM cortes c WHERE NOT EXISTS (SELECT 1 FROM at03_filas f WHERE f.corte_id = c.id)');
      }

      const [corte] = await tx.consulta(
        'INSERT INTO cortes (archivo, sha256, filas, periodos, perfil) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [archivo, sha256, registros.length, periodos.join(','), perfil],
      );

      // Inserción por lotes con unnest(): una consulta por cada 5,000 filas,
      // cada columna viaja como un arreglo de texto. Funciona igual en pg y PGlite.
      const listaColumnas = ['fila_archivo', ...columnas.map(columnaSql)].join(', ');
      const arreglosSql = ['$3::int[]', ...columnas.map((_, i) => `$${i + 4}::text[]`)].join(', ');
      const sqlInsertar = `INSERT INTO at03_filas (corte_id, archivo, ${listaColumnas})
                           SELECT $1, $2, * FROM unnest(${arreglosSql})`;
      for (let desde = 0; desde < registros.length; desde += TAMANO_LOTE) {
        const lote = registros.slice(desde, desde + TAMANO_LOTE);
        const params = [corte.id, archivo, lote.map((r) => r.linea)];
        for (let c = 0; c < columnas.length; c++) params.push(lote.map((r) => r.valores[c]));
        await tx.consulta(sqlInsertar, params);
      }

      // El motor vuelve a calcular todo desde at03_filas.
      await tx.consulta('SELECT recalcular()');
      const cascada = await tx.consulta('SELECT * FROM res_calidad WHERE fecha = ANY($1::text[]) ORDER BY fecha', [periodos]);
      return { reemplazado: existentes.length > 0, cascada };
    });

    const duracion_ms = Date.now() - inicio;
    await registrarBitacora({
      perfil,
      operacion: resumen.reemplazado ? 'reemplazo_corte' : 'carga_corte',
      detalle: `${archivo}: ${registros.length} filas, período ${periodos.join(', ')}, universo válido ${resumen.cascada.map((c) => c.universo_local_valido).join(', ')}`,
      resultado: 'ok',
      duracion_ms,
    });
    return { ok: true, archivo, periodos, filas: registros.length, reemplazado: resumen.reemplazado, duracion_ms, advertencias: analisis.advertencias, cascada: resumen.cascada };
  } catch (error) {
    if (error.esValidacion) return fallar(error.message, [{ fila: null, columna: 'Fecha', mensaje: error.message }], { periodos });
    return fallar(`error inesperado al guardar: ${error.message}`, [{ fila: null, columna: null, mensaje: `No se pudo guardar el corte: ${error.message}` }]);
  }
}

/**
 * Reemplaza un catálogo completo (bancos, CINU o SB21) desde un CSV y recalcula.
 * @param {{tipo: 'bancos'|'cinu'|'sb21', contenido: string|Buffer, nombreArchivo?: string, perfil: string}} opciones
 * @returns {Promise<{ok: true, tipo: string, filas: number} | {ok: false, mensaje: string}>}
 */
export async function cargarCatalogo({ tipo, contenido, nombreArchivo = '', perfil }) {
  const inicio = Date.now();
  const def = CATALOGOS[tipo];
  const fallar = async (mensaje) => {
    await registrarBitacora({ perfil: perfil || 'desconocido', operacion: 'carga_catalogo', detalle: `${tipo} ${nombreArchivo}: ${mensaje}`, resultado: 'error', duracion_ms: Date.now() - inicio });
    return { ok: false, mensaje };
  };
  if (!PERFILES_ESCRITURA.includes(perfil)) return fallar('Solo el perfil Administrador puede modificar catálogos.');
  if (!def) return fallar(`Catálogo desconocido "${tipo}". Use bancos, cinu o sb21.`);

  const { texto, binario } = aTexto(contenido);
  if (binario || !texto.trim()) return fallar('El archivo no es un CSV de texto o está vacío.');
  let filas;
  try {
    filas = parse(texto, { bom: true, columns: true, skip_empty_lines: true });
  } catch (error) {
    return fallar(`El CSV no se puede leer: ${error.message}`);
  }
  const encabezado = filas.length ? Object.keys(filas[0]) : [];
  if (encabezado.join(',') !== def.columnas.join(',')) {
    return fallar(`El encabezado debe ser exactamente: ${def.columnas.join(',')} (se encontró: ${encabezado.join(',') || 'nada'}).`);
  }
  const llave = def.columnas[0];
  const vistos = new Set();
  for (const [i, f] of filas.entries()) {
    if (def.columnas.some((c) => !f[c])) return fallar(`La fila ${i + 2} tiene celdas vacías.`);
    if (vistos.has(f[llave])) return fallar(`El código ${f[llave]} está repetido (fila ${i + 2}).`);
    vistos.add(f[llave]);
  }

  await transaccion(async (tx) => {
    await tx.consulta(`DELETE FROM ${def.tabla}`);
    await insertarCatalogo(tx, tipo, filas);
    await tx.consulta('SELECT recalcular()');
  });
  await registrarBitacora({ perfil, operacion: 'carga_catalogo', detalle: `${tipo}: ${filas.length} filas desde ${nombreArchivo || 'archivo'}`, resultado: 'ok', duracion_ms: Date.now() - inicio });
  return { ok: true, tipo, filas: filas.length };
}
