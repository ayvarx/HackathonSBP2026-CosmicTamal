// Aritmética exacta: montos en centavos (BigInt), sin punto flotante.

// "1234.5" -> 123450n ; "-3.00" -> -300n ; texto inválido -> lanza error.
export function aCentavos(texto) {
  const s = String(texto ?? "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Monto inválido: "${texto}"`);
  const negativo = s.startsWith("-");
  const sinSigno = negativo ? s.slice(1) : s;
  const [entero, decimales = ""] = sinSigno.split(".");
  const valor = BigInt(entero) * 100n + BigInt((decimales + "00").slice(0, 2));
  return negativo ? -valor : valor;
}

// Centavos -> texto con 2 decimales.
export function deCentavos(c) {
  const negativo = c < 0n;
  const abs = negativo ? -c : c;
  const txt = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return negativo ? `-${txt}` : txt;
}

// Porcentaje saldo/total*100 redondeado aritméticamente a 4 decimales (mitad hacia afuera de cero).
// Devuelve texto con 4 decimales.
export function porcentaje4(saldo, total) {
  if (total === 0n) return "0.0000";
  // saldo*100*10^4/total = saldo*10^6/total, en unidades de 1e-4 %
  const num = saldo * 1000000n;
  const medio = total / 2n;
  const cociente = (num >= 0n ? num + medio : num - medio) / total;
  const abs = cociente < 0n ? -cociente : cociente;
  const txt = `${abs / 10000n}.${String(abs % 10000n).padStart(4, "0")}`;
  return cociente < 0n ? `-${txt}` : txt;
}
