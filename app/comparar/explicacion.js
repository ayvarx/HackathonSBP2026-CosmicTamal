// app/comparar/explicacion.js — Utilidades de texto deterministas para la pantalla Comparar.
//
// Los montos exactos se muestran con formatearMonto; las cifras compactas ("22.6 M") son solo
// de lectura rápida. Las comparaciones de montos se hacen con compararDecimales (texto exacto).

import { compararDecimales } from "@/lib/formato";

/** "-6408501.43" → "6408501.43" (valor absoluto como texto, sin aritmética). */
export function quitarSigno(texto) {
  return String(texto ?? "0").replace(/^[+-]/, "");
}

/** 3 → "3.ª" (posición es femenino: "la 3.ª posición"). */
export function ordinal(n) {
  return `${n}.ª`;
}

/** ["A", "B", "C"] → "A, B y C". */
export function unirLista(elementos) {
  if (elementos.length <= 1) return elementos.join("");
  return `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`;
}

/** Monto compacto con signo para tarjetas: "22612345.10" → "+22.6 M"; "-812000" → "−0.8 M". */
export function montoCompacto(texto, { signo = true } = {}) {
  const n = Number(texto ?? 0);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const cuerpo = abs >= 1e5 ? `${(abs / 1e6).toFixed(1)} M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)} mil` : abs.toFixed(0);
  if (!signo || n === 0) return cuerpo;
  return `${n > 0 ? "+" : "−"}${cuerpo}`;
}

/**
 * Movimientos que se muestran en tarjetas, separados en dos grupos: significativos (aunque no
 * cambien de puesto) y cambios de posición no significativos. Dentro de cada grupo: cambio de
 * líder, salto de posición más grande, mayor variación de saldo.
 */
export function principalesMovimientos(movimientosRanking) {
  const orden = (a, b) =>
    (a.cambio_de_lider === "SI" ? 0 : 1) - (b.cambio_de_lider === "SI" ? 0 : 1) ||
    Math.abs(b.cambio_posicion) - Math.abs(a.cambio_posicion) ||
    compararDecimales(quitarSigno(b.var_saldo), quitarSigno(a.var_saldo)) ||
    a.posicion_actual - b.posicion_actual;
  const significativos = movimientosRanking.filter((m) => m.significativo).sort(orden);
  const otros = movimientosRanking.filter((m) => !m.significativo && m.cambio_posicion !== 0).sort(orden);
  return { significativos, otros };
}

/** Si cambió el líder del ranking: { nuevo, anterior } con los nombres; si no, null. */
export function cambioLider(movimientosRanking) {
  const lider = movimientosRanking.find((m) => m.posicion_actual === 1);
  const liderAnterior = movimientosRanking.find((m) => m.posicion_anterior === 1);
  if (!lider || !liderAnterior || lider.codigo_banco === liderAnterior.codigo_banco) return null;
  return { nuevo: lider.banco, anterior: liderAnterior.banco };
}
