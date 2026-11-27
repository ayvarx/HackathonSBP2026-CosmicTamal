// Cifras reales del último corte para el panel de presentación del acceso.
// Devuelve null si no hay cortes o la base no responde (el panel muestra solo el nombre).
import { rankings, resumenPanel } from "@/lib/consultas";
import { formatearEntero, formatearFecha, formatearMontoCompacto, nombreBanco } from "@/lib/formato";

// "175.80 millones" → "175.80 M" (el redondeo lo hace lib/formato.js, exacto con BigInt).
const compacto = (valor) => formatearMontoCompacto(valor).replace(/ millones$/, " M");

export async function datosPresentacion() {
  try {
    const r = await resumenPanel();
    if (!r || !r.rankings?.length) return null;
    const filas = await rankings({ fecha: r.fecha, ranking: r.rankings[0].ranking });
    const maximo = Math.max(...r.rankings.map((x) => Number(x.lider.saldo_actividad) || 0), 1);
    return {
      periodo: `Corte de ${formatearFecha(r.fecha)}`,
      prestamos: formatearEntero(r.universo.universo_local_valido),
      bancos: formatearEntero(new Set(filas.map((f) => f.codigo_banco)).size),
      total: compacto(r.universo.saldo_universo_local_valido),
      rankings: r.rankings.map((x) => ({
        clave: x.ranking,
        nombre: x.nombre,
        lider: nombreBanco(x.lider.codigo_banco, x.lider.banco),
        monto: compacto(x.lider.saldo_actividad),
        // Solo para el ancho visual de la barra; la cifra se muestra como texto.
        pct: Math.max(4, Math.round(((Number(x.lider.saldo_actividad) || 0) / maximo) * 100)),
      })),
    };
  } catch (error) {
    console.error("[login] No se pudieron leer las cifras:", error.message);
    return null;
  }
}
