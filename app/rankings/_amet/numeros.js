// numeros.js — Aritmética exacta para los componentes portados del frontend de Amet.
// Amet usaba Number(); aquí los montos llegan como TEXTO decimal exacto desde SQL y se
// operan como BigInt de centavos, para que ninguna cifra mostrada pierda precisión.
// Las cifras se formatean después con lib/formato.js.

/** "1234.5" → 123450n (centavos). Texto vacío o inválido → 0n. */
export function aCentavos(texto) {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(texto ?? "0").trim().replaceAll(",", ""));
  if (!m) return 0n;
  const valor = BigInt((m[2] || "0") + ((m[3] ?? "") + "00").slice(0, 2));
  return m[1] ? -valor : valor;
}

/** 123450n → "1234.50" (texto que entiende formatearMonto). */
export function deCentavos(centavos) {
  const negativo = centavos < 0n;
  const texto = (negativo ? -centavos : centavos).toString().padStart(3, "0");
  return `${negativo ? "-" : ""}${texto.slice(0, -2)}.${texto.slice(-2)}`;
}

/** a − b con montos en texto → texto. */
export function restarMontos(a, b) {
  return deCentavos(aCentavos(a) - aCentavos(b));
}

/**
 * parte ÷ total × 100 con `decimales` cifras (redondeo aritmético), como texto: "45.3".
 * null si el total es cero. Para formatear: formatearPorcentaje(texto, decimales).
 */
export function porcentajeDe(parte, total, decimales = 1) {
  const p = aCentavos(parte);
  const t = aCentavos(total);
  if (t === 0n) return null;
  const numerador = p * 100n * 10n ** BigInt(decimales);
  let cociente = numerador / t;
  const resto = numerador % t;
  const abs = (x) => (x < 0n ? -x : x);
  if (abs(resto) * 2n >= abs(t)) cociente += (numerador < 0n) !== (t < 0n) ? -1n : 1n;
  const negativo = cociente < 0n;
  const digitos = abs(cociente).toString().padStart(decimales + 1, "0");
  const texto = decimales ? `${digitos.slice(0, -decimales)}.${digitos.slice(-decimales)}` : digitos;
  return `${negativo ? "-" : ""}${texto}`;
}

/** Cifra resumida para tarjetas: "5152100000.00" → "5,152.1 M" (montos menores a un millón, completos). */
export function montoResumido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e6) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${(n / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
}
