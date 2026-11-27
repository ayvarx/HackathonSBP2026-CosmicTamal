// Cifras reales del último corte para el panel de presentación del acceso.
// Devuelve null si no hay cortes o la base no responde (el panel omite las cifras).
import { rankings, resumenPanel } from "@/lib/consultas";
import { compararDecimales, formatearEntero, formatearMonto, nombreBanco } from "@/lib/formato";

export async function datosPresentacion() {
  try {
    const r = await resumenPanel();
    const primero = r?.rankings?.[0];
    if (!r || !primero) return null;
    const filas = await rankings({ fecha: r.fecha, ranking: primero.ranking });
    const top = filas.slice(0, 5);
    const maximo = top.reduce((m, f) => (compararDecimales(f.saldo_actividad, m) > 0 ? f.saldo_actividad : m), "0");
    const maxNum = Number(maximo) || 1;
    return {
      etiqueta: r.etiqueta,
      ranking: primero.nombre,
      prestamos: Number(r.universo.universo_local_valido) || 0,
      prestamosTexto: formatearEntero(r.universo.universo_local_valido),
      bancos: new Set(filas.map((f) => f.codigo_banco)).size,
      top: top.map((f) => ({
        nombre: nombreBanco(f.codigo_banco, f.banco),
        // Solo para el ancho visual de la barra; el monto se muestra como texto exacto.
        pct: Math.max(4, Math.round((Number(f.saldo_actividad) / maxNum) * 100)),
        monto: formatearMonto(f.saldo_actividad),
      })),
      total: formatearMonto(primero.saldo_total),
    };
  } catch (error) {
    console.error("[login] No se pudieron leer las cifras:", error.message);
    return null;
  }
}
