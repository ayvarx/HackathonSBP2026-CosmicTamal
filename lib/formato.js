// lib/formato.js — Formateo de cifras, fechas y nombres SOLO para mostrar en pantalla.
//
// Regla de oro del proyecto: el dinero nunca pasa por punto flotante de JavaScript.
// Los montos llegan desde SQL como TEXTO decimal (NUMERIC::text, p. ej. "1234567.89")
// y aquí solo se les agregan separadores de miles. Para eso se trabaja con la cadena
// y con BigInt (enteros exactos), nunca con Number/parseFloat.
//
// Las exportaciones CSV deben usar los valores y códigos EXACTOS (p. ej. "CONSTRUCCION",
// "1234567.89"); estas funciones son para la interfaz.
//
// Uso típico:
//   formatearMonto("1234567.8")          → "1,234,567.80"
//   formatearPorcentaje("12.34567", 4)   → "12.3457 %"
//   formatearFecha("20260930")           → "septiembre de 2026"
//   nombreRanking("CONSTRUCCION")        → "Construcción"
//   compararDecimales("10.5", "9.99")    → 1   (para ordenar sin float)

// ---------------------------------------------------------------------------
// Números decimales exactos (texto ↔ BigInt escalado)
// ---------------------------------------------------------------------------

// Acepta "123", "-123.4", "+0.50", ".5" y también enteros o BigInt de JS.
const PATRON_DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Convierte un decimal en texto a { negativo, entero, fraccion } (cadenas de dígitos).
 * Devuelve null si el valor no es un decimal válido (p. ej. "NA", "", null).
 */
function descomponerDecimal(valor) {
  if (valor === null || valor === undefined) return null;
  // Se aceptan BigInt y Number por comodidad (conteos de filas); para dinero
  // envíe siempre texto: un float de JS ya pudo perder exactitud.
  if (typeof valor === "bigint" || typeof valor === "number") valor = String(valor);
  const texto = String(valor).trim();
  const partes = PATRON_DECIMAL.exec(texto);
  if (!partes) return null;
  const [, signo, entero = "", fraccion = ""] = partes;
  if (entero === "" && fraccion === "") return null;
  return {
    negativo: signo === "-",
    entero: entero.replace(/^0+(?=\d)/, "") || "0",
    fraccion,
  };
}

/**
 * Lleva un decimal en texto a un BigInt escalado a `decimales` cifras,
 * con redondeo aritmético (la mitad se aleja del cero), igual que ROUND de Postgres.
 * Ejemplo: aEscalado("12.345", 2) → 1235n (centésimas).
 */
function aEscalado(valor, decimales) {
  const d = descomponerDecimal(valor);
  if (!d) return null;
  const fraccion = d.fraccion.padEnd(decimales + 1, "0");
  let escalado = BigInt(d.entero + fraccion.slice(0, decimales));
  // La cifra siguiente decide el redondeo (>= 5 sube).
  if (Number(fraccion[decimales]) >= 5) escalado += 1n;
  return d.negativo ? -escalado : escalado;
}

/** Inserta comas cada tres cifras en una cadena de dígitos ("1234567" → "1,234,567"). */
function agruparMiles(digitos) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Convierte un BigInt escalado de nuevo a texto con `decimales` cifras y miles. */
function escaladoATexto(escalado, decimales, { miles = true } = {}) {
  const negativo = escalado < 0n;
  const digitos = (negativo ? -escalado : escalado).toString().padStart(decimales + 1, "0");
  const entero = digitos.slice(0, digitos.length - decimales);
  const fraccion = decimales > 0 ? "." + digitos.slice(-decimales) : "";
  // Evita mostrar "-0.00" cuando el redondeo deja el valor en cero.
  const signo = negativo && /[1-9]/.test(digitos) ? "-" : "";
  return signo + (miles ? agruparMiles(entero) : entero) + fraccion;
}

/** Texto que se muestra cuando no hay dato (NULL, "NA" o vacío). */
export const SIN_DATO = "—";

// ---------------------------------------------------------------------------
// Montos y porcentajes
// ---------------------------------------------------------------------------

/**
 * Monto exacto con separador de miles y 2 decimales: "1234567.8" → "1,234,567.80".
 * @param {string|bigint|number} valor  Texto decimal (preferido) tal como viene de SQL.
 * @param {{decimales?: number, signo?: boolean}} opciones  signo: antepone "+" a positivos.
 */
export function formatearMonto(valor, { decimales = 2, signo = false } = {}) {
  const escalado = aEscalado(valor, decimales);
  if (escalado === null) return SIN_DATO;
  const texto = escaladoATexto(escalado, decimales);
  return signo && escalado > 0n ? "+" + texto : texto;
}

/**
 * Monto abreviado para tarjetas (no para tablas): "1234567890.12" → "1,234.57 millones".
 * Se calcula con BigInt para que la abreviatura también sea exacta al redondear.
 */
export function formatearMontoCompacto(valor) {
  const centavos = aEscalado(valor, 2);
  if (centavos === null) return SIN_DATO;
  const absoluto = centavos < 0n ? -centavos : centavos;
  // 1 millón = 100,000,000 centavos. Por debajo de eso se muestra el monto completo.
  if (absoluto < 100_000_000n) return formatearMonto(valor);
  // Centésimas de millón = centavos / 1,000,000 con redondeo aritmético.
  const divisor = 1_000_000n;
  let centesimas = absoluto / divisor;
  if ((absoluto % divisor) * 2n >= divisor) centesimas += 1n;
  const texto = escaladoATexto(centavos < 0n ? -centesimas : centesimas, 2);
  return `${texto} millones`;
}

/**
 * Porcentaje con `decimales` cifras (4 por defecto, como Ponderacion_Pct): "12.34567" → "12.3457 %".
 * El valor ya debe venir multiplicado por 100 (así lo entrega el motor SQL).
 */
export function formatearPorcentaje(valor, decimales = 4, { signo = false } = {}) {
  const escalado = aEscalado(valor, decimales);
  if (escalado === null) return SIN_DATO;
  const texto = escaladoATexto(escalado, decimales);
  // Espacio fino irrompible antes de "%", como recomienda la norma del español.
  return (signo && escalado > 0n ? "+" : "") + texto + " %";
}

/** Entero con separador de miles: 30000 → "30,000". Para conteos de filas y operaciones. */
export function formatearEntero(valor) {
  const escalado = aEscalado(valor, 0);
  if (escalado === null) return SIN_DATO;
  return escaladoATexto(escalado, 0);
}

/**
 * Compara dos decimales en texto sin pasar por float. Devuelve -1, 0 o 1.
 * Los valores vacíos/no numéricos se consideran menores que cualquier número.
 * Útil para ordenar tablas por saldo: filas.sort((a, b) => compararDecimales(a.saldo, b.saldo)).
 */
export function compararDecimales(a, b) {
  const da = descomponerDecimal(a);
  const db = descomponerDecimal(b);
  if (!da && !db) return 0;
  if (!da) return -1;
  if (!db) return 1;
  const decimales = Math.max(da.fraccion.length, db.fraccion.length);
  const ea = aEscalado(a, decimales);
  const eb = aEscalado(b, decimales);
  return ea === eb ? 0 : ea < eb ? -1 : 1;
}

/** Signo de un decimal en texto: -1 (negativo), 0 (cero) o 1 (positivo); null si no es número. */
export function signoDecimal(valor) {
  const d = descomponerDecimal(valor);
  if (!d) return null;
  if (!/[1-9]/.test(d.entero + d.fraccion)) return 0;
  return d.negativo ? -1 : 1;
}

/** true si el valor es un decimal válido (descarta "NA", "", null). */
export function esDecimal(valor) {
  return descomponerDecimal(valor) !== null;
}

/**
 * Convierte texto decimal a Number SOLO para dibujar gráficos (alto de barras, ejes).
 * Nunca use el resultado para sumar, comparar posiciones ni mostrar la cifra oficial:
 * la cifra exacta siempre se muestra con formatearMonto(texto).
 */
export function aNumeroParaGrafico(valor) {
  const d = descomponerDecimal(valor);
  if (!d) return null;
  return Number(`${d.negativo ? "-" : ""}${d.entero}.${d.fraccion || "0"}`);
}

// ---------------------------------------------------------------------------
// Fechas de corte (AAAAMMDD)
// ---------------------------------------------------------------------------

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Fecha de corte AAAAMMDD a texto legible, sin usar Date (evita desfases de zona horaria).
 *   estilo "mes"      → "septiembre de 2026"   (predeterminado; un corte = un mes)
 *   estilo "completa" → "30 de septiembre de 2026"
 *   estilo "corta"    → "sep. 2026"            (ejes de gráficos)
 * Si el texto no es AAAAMMDD válido, se devuelve tal cual.
 */
export function formatearFecha(aaaammdd, estilo = "mes") {
  const texto = String(aaaammdd ?? "").trim();
  const partes = /^(\d{4})(\d{2})(\d{2})$/.exec(texto);
  if (!partes) return texto || SIN_DATO;
  const [, anio, mes, dia] = partes;
  const nombreMes = MESES[Number(mes) - 1];
  if (!nombreMes) return texto;
  if (estilo === "completa") return `${Number(dia)} de ${nombreMes} de ${anio}`;
  if (estilo === "corta") return `${nombreMes.slice(0, 3)}. ${anio}`;
  return `${nombreMes} de ${anio}`;
}

/**
 * Fecha y hora (ISO, Date o timestamp de Postgres) en hora de Panamá: "27 nov 2026, 10:25 a. m.".
 * Para la bitácora de operaciones; aquí sí es válido usar Date porque no es dinero.
 * Se escribe el mes con letras para evitar la ambigüedad día/mes de "11/27/26".
 */
export function formatearFechaHora(valor) {
  if (!valor) return SIN_DATO;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(fecha);
}

// ---------------------------------------------------------------------------
// Nombres legibles (el código exacto se conserva para exportar)
// ---------------------------------------------------------------------------

// Nombres de presentación de cada Macroactividad_Reto del catálogo CINU/SB109.
// Solo cambia cómo se ve; los cálculos y exportaciones usan el código exacto.
const NOMBRES_RANKING = {
  HIPOTECARIO: "Hipotecario",
  CONSTRUCCION: "Construcción",
  INDUSTRIA: "Industria",
  AGROPECUARIO: "Agropecuario",
  COMERCIO: "Comercio",
  CONSUMO: "Consumo",
};

/** Orden de presentación de los rankings según las indicaciones del reto (sección 5). */
export const ORDEN_RANKINGS = ["HIPOTECARIO", "CONSTRUCCION", "INDUSTRIA", "AGROPECUARIO", "COMERCIO", "CONSUMO"];

/** Carácter de cada ranking en el reto: obligatorio, recomendado o bonus (sección 5). */
export const CARACTER_RANKING = {
  HIPOTECARIO: "Obligatorio",
  CONSTRUCCION: "Obligatorio",
  INDUSTRIA: "Obligatorio",
  AGROPECUARIO: "Obligatorio",
  COMERCIO: "Recomendado",
  CONSUMO: "Bonus",
};

/** Capitaliza un código desconocido: "NUEVA_ACTIVIDAD" → "Nueva actividad". */
function capitalizarCodigo(codigo) {
  const texto = String(codigo ?? "").replace(/_/g, " ").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "CONSTRUCCION" → "Construcción". Si llega un ranking nuevo del catálogo, se capitaliza. */
export function nombreRanking(codigo) {
  if (!codigo) return SIN_DATO;
  return NOMBRES_RANKING[codigo] ?? capitalizarCodigo(codigo);
}

// El catálogo trae las subactividades sin tildes (texto exacto para exportar).
// Para la pantalla se muestran con ortografía correcta.
const NOMBRES_SUBACTIVIDAD = {
  "Credito personal": "Crédito personal",
  Automovil: "Automóvil",
  Ganaderia: "Ganadería",
  "Petroleo y derivados": "Petróleo y derivados",
  "Produccion y generacion electrica": "Producción y generación eléctrica",
  "Acero y materiales de construccion": "Acero y materiales de construcción",
};

/** "Credito personal" → "Crédito personal". Los demás nombres se devuelven igual. */
export function nombreSubactividad(texto) {
  if (!texto) return SIN_DATO;
  return NOMBRES_SUBACTIVIDAD[texto] ?? texto;
}

/** Banco legible: ("101", "Banco Istmo") → "101 · Banco Istmo". */
export function nombreBanco(codigo, nombre) {
  if (!nombre) return String(codigo ?? SIN_DATO);
  return `${codigo} · ${nombre}`;
}
