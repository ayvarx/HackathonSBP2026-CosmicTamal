import { formatearMontoCompacto } from "@/lib/formato";

/**
 * Etiqueta compacta de gráfico en millones ("175.8 M", "50 M", "0"). Solo para ejes y
 * etiquetas de barras: se deriva de formatearMontoCompacto (exacto) sin los decimales ".00".
 */
export function montoEnMillones(valor, decimales = 0) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (Number(valor) === 0) return "0";
  const texto = formatearMontoCompacto(String(valor));
  if (!texto.endsWith(" millones")) return texto.replace(/\.00$/, "");
  // Redondeo aritmético exacto (BigInt) de centésimas de millón a `decimales` cifras.
  const crudo = texto.replace(" millones", "").replace(/,/g, "");
  const negativo = crudo.startsWith("-");
  const [entero, frac = "00"] = crudo.replace("-", "").split(".");
  const factor = 10n ** BigInt(2 - decimales);
  let unidades = BigInt(entero + frac.padEnd(2, "0")) / factor;
  if ((BigInt(entero + frac.padEnd(2, "0")) % factor) * 2n >= factor) unidades += 1n;
  const base = 10n ** BigInt(decimales);
  const ent = (unidades / base).toLocaleString("en-US");
  const dec = decimales > 0 ? (unidades % base).toString().padStart(decimales, "0") : "";
  const cifra = dec && !/^0+$/.test(dec) ? `${ent}.${dec}` : ent;
  return `${negativo ? "-" : ""}${cifra} M`;
}

