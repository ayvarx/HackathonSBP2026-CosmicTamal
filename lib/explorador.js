// lib/explorador.js — Conjuntos de datos del Explorador (/explorar) y su filtrado y orden.
//
// Lo usan el componente cliente (para pintar la tabla) y la ruta /api/exportar/explorador
// (para descargar). Las dos llaman a aplicarExplorador() con el mismo estado, así que el
// archivo descargado tiene exactamente las filas, el orden y las columnas que se ven.
// No importa nada del servidor (sin base de datos): solo lib/formato.js.
//
// Estado (va en la URL como ?f=<JSON>):
//   { q: "búsqueda global", o: [["campo", "a"|"d"], ...], h: ["campo oculto", ...],
//     x: { campo: { v: ["valor", ...], op: "c"|"i"|"e", t: "texto", n: "ge"|"le"|"entre"|"eq", a: "num", b: "num" } } }
//   v = valores elegidos (lista de casillas); op/t = condición de texto (contiene, es igual a, empieza por);
//   n/a/b = condición numérica. Los montos se comparan como texto decimal exacto (compararDecimales).

import {
  compararDecimales,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearPorcentaje,
  SIN_DATO,
} from "./formato.js";

// Tipos de columna: periodo | texto | entero | monto | pct | sino.
const col = (campo, encabezado, tipo, extra = {}) => ({ campo, encabezado, tipo, ...extra });

/** Conjuntos disponibles. `sumable`: la columna lleva total al pie. */
export const CONJUNTOS_EXPLORADOR = {
  rankings: {
    etiqueta: "Rankings",
    columnas: [
      col("fecha", "Fecha", "periodo"),
      col("ranking", "Ranking", "texto"),
      col("posicion", "Posicion", "entero"),
      col("codigo_banco", "Codigo_Banco", "texto"),
      col("banco", "Banco", "texto"),
      col("saldo_actividad", "Saldo_Actividad", "monto", { sumable: true }),
      col("total_cartera_local_valida", "Total_Cartera_Local_Valida", "monto"),
      col("ponderacion_pct", "Ponderacion_Pct", "pct"),
      col("operaciones_validas", "Operaciones_Validas", "entero", { sumable: true }),
    ],
  },
  subactividades: {
    etiqueta: "Subactividades",
    columnas: [
      col("fecha", "Fecha", "periodo"),
      col("ranking", "Ranking", "texto"),
      col("subactividad", "Subactividad", "texto"),
      col("codigo_banco", "Codigo_Banco", "texto"),
      col("banco", "Banco", "texto"),
      col("saldo", "Saldo", "monto", { sumable: true }),
      col("operaciones", "Operaciones", "entero", { sumable: true }),
    ],
  },
  movimientos: {
    etiqueta: "Movimientos",
    columnas: [
      col("fecha_anterior", "Fecha_Anterior", "periodo"),
      col("fecha_actual", "Fecha_Actual", "periodo"),
      col("ranking", "Ranking", "texto"),
      col("codigo_banco", "Codigo_Banco", "texto"),
      col("banco", "Banco", "texto"),
      col("posicion_anterior", "Posicion_Anterior", "entero"),
      col("posicion_actual", "Posicion_Actual", "entero"),
      col("cambio_posicion", "Cambio_Posicion", "entero"),
      col("saldo_anterior", "Saldo_Anterior", "monto", { sumable: true }),
      col("saldo_actual", "Saldo_Actual", "monto", { sumable: true }),
      col("var_saldo", "Var_Saldo", "monto", { sumable: true }),
      col("var_saldo_pct", "Var_Saldo_Pct", "pct"),
      col("cambio_de_lider", "Cambio_De_Lider", "sino"),
      col("significativo", "Significativo", "sino"),
      col("motivo", "Motivo", "texto"),
    ],
  },
  exclusiones: {
    etiqueta: "Filas excluidas",
    columnas: [
      col("fecha", "Fecha", "periodo"),
      col("archivo", "Archivo", "texto"),
      col("fila_archivo", "Fila_Archivo", "entero"),
      col("numero_prestamo", "Numero_Prestamo", "texto"),
      col("filtro", "Filtro", "texto"),
      col("codigo_banco", "Codigo_Banco", "texto"),
      col("destino", "Destino", "texto"),
      col("saldo", "Saldo", "monto", { sumable: true }),
      col("tipo_actividad", "Tipo_Actividad", "texto"),
    ],
  },
};

export const CLAVES_CONJUNTO = Object.keys(CONJUNTOS_EXPLORADOR);
export const CONJUNTO_PREDETERMINADO = "rankings";

export const TIPOS_NUMERICOS = new Set(["entero", "monto", "pct"]);
export const OPERADORES_TEXTO = { c: "contiene", i: "es igual a", e: "empieza por" };
export const OPERADORES_NUMERO = { ge: "mayor o igual a", le: "menor o igual a", entre: "entre", eq: "igual a" };

/** Clave de conjunto válida (o la predeterminada). */
export function conjuntoValido(clave) {
  return CLAVES_CONJUNTO.includes(clave) ? clave : CONJUNTO_PREDETERMINADO;
}

// ---------------------------------------------------------------------------
// Estado: lectura segura y codificación compacta
// ---------------------------------------------------------------------------

export const ESTADO_VACIO = Object.freeze({ q: "", o: [], h: [], x: {} });

const texto = (v, max = 200) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");

/** Número decimal escrito por el usuario ("1,250.5" → "1250.5"); "" si no es válido. */
export function limpiarNumero(v) {
  const t = texto(v, 40).replace(/[,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? t : "";
}

/**
 * Convierte el texto de ?f= (o un objeto) en un estado válido para el conjunto:
 * descarta columnas desconocidas y valores mal formados. Nunca lanza.
 */
export function leerEstado(entrada, conjunto) {
  let crudo = entrada;
  if (typeof entrada === "string") {
    try {
      crudo = entrada ? JSON.parse(entrada) : {};
    } catch {
      crudo = {};
    }
  }
  if (!crudo || typeof crudo !== "object") crudo = {};
  const campos = new Set(CONJUNTOS_EXPLORADOR[conjuntoValido(conjunto)].columnas.map((c) => c.campo));

  const o = (Array.isArray(crudo.o) ? crudo.o : [])
    .filter((p) => Array.isArray(p) && campos.has(p[0]))
    .map(([campo, dir]) => [campo, dir === "d" ? "d" : "a"])
    .filter((p, i, arr) => arr.findIndex((q) => q[0] === p[0]) === i)
    .slice(0, 5);
  const h = [...new Set((Array.isArray(crudo.h) ? crudo.h : []).filter((c) => campos.has(c)))];

  const x = {};
  for (const [campo, f] of Object.entries(crudo.x && typeof crudo.x === "object" ? crudo.x : {})) {
    if (!campos.has(campo) || !f || typeof f !== "object") continue;
    const limpio = {};
    if (Array.isArray(f.v)) limpio.v = [...new Set(f.v.map((v) => texto(v)).slice(0, 5000))];
    const t = texto(f.t).trim();
    if (t) {
      limpio.t = t;
      limpio.op = OPERADORES_TEXTO[f.op] ? f.op : "c";
    }
    if (OPERADORES_NUMERO[f.n]) {
      const a = limpiarNumero(f.a);
      const b = limpiarNumero(f.b);
      if (a || (f.n === "entre" && b)) {
        limpio.n = f.n;
        if (a) limpio.a = a;
        if (f.n === "entre" && b) limpio.b = b;
      }
    }
    if (Object.keys(limpio).length) x[campo] = limpio;
  }
  return { q: texto(crudo.q).trim(), o, h, x };
}

/** true si el estado tiene algún filtro (búsqueda o filtro de columna). */
export function hayFiltros(estado) {
  return Boolean(estado.q) || Object.keys(estado.x).length > 0;
}

/** Texto compacto para ?f= ("" si el estado está vacío). */
export function codificarEstado(estado) {
  const e = {};
  if (estado.q) e.q = estado.q;
  if (estado.o.length) e.o = estado.o;
  if (estado.h.length) e.h = estado.h;
  if (Object.keys(estado.x).length) e.x = estado.x;
  return Object.keys(e).length ? JSON.stringify(e) : "";
}

// ---------------------------------------------------------------------------
// Presentación de valores
// ---------------------------------------------------------------------------

/** Valor como texto (las filas guardan textos; null = sin dato). */
export const valorTexto = (v) => (v === null || v === undefined ? "" : String(v));

/** Cómo se ve la celda en pantalla (la descarga usa el texto exacto). */
export function mostrarValor(valor, tipo) {
  const v = valorTexto(valor);
  if (v === "") return SIN_DATO;
  if (tipo === "monto") return formatearMonto(v);
  if (tipo === "pct") return formatearPorcentaje(v, 4);
  if (tipo === "entero") return formatearEntero(v);
  if (tipo === "periodo") return formatearFecha(v, "corta");
  if (tipo === "sino") return v === "SI" ? "Sí" : v === "NO" ? "No" : v;
  return v;
}

/** Sin mayúsculas ni tildes, para comparar textos. */
export function normalizar(v) {
  return valorTexto(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Filtrado y orden (lo mismo en pantalla y en la descarga)
// ---------------------------------------------------------------------------

function cumpleFiltro(valor, f) {
  const v = valorTexto(valor);
  if (f.v && !f.v.includes(v)) return false;
  if (f.t) {
    const a = normalizar(v);
    const b = normalizar(f.t);
    if (f.op === "i" ? a !== b : f.op === "e" ? !a.startsWith(b) : !a.includes(b)) return false;
  }
  if (f.n) {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return false;
    if (f.n === "eq" && f.a && compararDecimales(v, f.a) !== 0) return false;
    if ((f.n === "ge" || f.n === "entre") && f.a && compararDecimales(v, f.a) < 0) return false;
    if (f.n === "le" && f.a && compararDecimales(v, f.a) > 0) return false;
    if (f.n === "entre" && f.b && compararDecimales(v, f.b) > 0) return false;
  }
  return true;
}

function compararValores(a, b, tipo) {
  if (TIPOS_NUMERICOS.has(tipo)) return compararDecimales(valorTexto(a), valorTexto(b));
  return valorTexto(a).localeCompare(valorTexto(b), "es", { numeric: true, sensitivity: "base" });
}

/** Columnas visibles del conjunto, en el orden en que se muestran y se exportan. */
export function columnasVisibles(conjunto, estado) {
  const ocultas = new Set(estado.h);
  return CONJUNTOS_EXPLORADOR[conjuntoValido(conjunto)].columnas.filter((c) => !ocultas.has(c.campo));
}

/**
 * Aplica búsqueda global, filtros por columna y orden. No modifica `filas`.
 * La búsqueda global mira las columnas visibles (texto exacto y texto mostrado).
 * @returns {object[]} filas que cumplen, ordenadas
 */
export function aplicarExplorador(filas, conjunto, estado) {
  const columnas = CONJUNTOS_EXPLORADOR[conjuntoValido(conjunto)].columnas;
  const tipoDe = Object.fromEntries(columnas.map((c) => [c.campo, c.tipo]));
  const visibles = columnasVisibles(conjunto, estado);
  const filtros = Object.entries(estado.x);
  const q = normalizar(estado.q);

  const resultado = [];
  filas.forEach((fila, indice) => {
    for (const [campo, f] of filtros) if (!cumpleFiltro(fila[campo], f)) return;
    if (q && !visibles.some((c) => normalizar(fila[c.campo]).includes(q) || normalizar(mostrarValor(fila[c.campo], c.tipo)).includes(q))) return;
    resultado.push({ fila, indice });
  });

  if (estado.o.length) {
    resultado.sort((a, b) => {
      for (const [campo, dir] of estado.o) {
        const r = compararValores(a.fila[campo], b.fila[campo], tipoDe[campo]);
        if (r !== 0) return dir === "d" ? -r : r;
      }
      return a.indice - b.indice;
    });
  }
  return resultado.map((r) => r.fila);
}

/**
 * Suma exacta de textos decimales con BigInt (sin float). Ignora vacíos y no numéricos.
 * @returns {string} suma en texto decimal ("1234.50")
 */
export function sumarExacto(valores) {
  const validos = valores.map(valorTexto).filter((v) => /^-?\d+(\.\d+)?$/.test(v));
  const escala = Math.max(0, ...validos.map((v) => (v.split(".")[1] || "").length));
  let total = 0n;
  for (const v of validos) {
    const negativo = v.startsWith("-");
    const [entero, fraccion = ""] = v.replace("-", "").split(".");
    const n = BigInt(entero + fraccion.padEnd(escala, "0"));
    total += negativo ? -n : n;
  }
  const negativo = total < 0n;
  const digitos = (negativo ? -total : total).toString().padStart(escala + 1, "0");
  const resultado = escala ? `${digitos.slice(0, -escala)}.${digitos.slice(-escala)}` : digitos;
  return (negativo ? "-" : "") + resultado;
}
