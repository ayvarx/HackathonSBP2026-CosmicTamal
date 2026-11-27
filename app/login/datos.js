// Cifras reales de todos los cortes cargados para la animación del panel de presentación del acceso.
// Devuelve null si no hay cortes o la base no responde (el panel muestra solo el nombre).
// Consultas: una de calidad (todos los períodos) + una de rankings por período (todos los rankings).
import { RANKINGS, calidad, rankings } from "@/lib/consultas";
import { formatearEntero, formatearFecha, formatearMontoCompacto, nombreBanco } from "@/lib/formato";

// "175.80 millones" → "175.80 M" (el redondeo lo hace lib/formato.js, exacto con BigInt).
const compacto = (valor) => formatearMontoCompacto(valor).replace(/ millones$/, " M");
// Solo visual (anchos de barra y conteos animados); la cifra final se muestra como texto exacto.
const numero = (valor) => Number(valor) || 0;

const TOP = 6;

export async function datosPresentacion() {
  try {
    const cortes = await calidad();
    if (!cortes.length) return null;
    const porPeriodo = await Promise.all(cortes.map((c) => rankings({ fecha: c.fecha })));

    const periodos = cortes.map((c, i) => ({
      fecha: c.fecha,
      etiqueta: formatearFecha(c.fecha),
      prestamos: formatearEntero(c.universo_local_valido),
      prestamosN: numero(c.universo_local_valido),
      bancos: formatearEntero(new Set(porPeriodo[i].map((f) => f.codigo_banco)).size),
      total: compacto(c.saldo_universo_local_valido),
      totalN: numero(c.saldo_universo_local_valido),
    }));

    const lista = RANKINGS.map((r) => {
      // Bancos que están en el top 6 de algún período del ranking.
      const codigos = new Set();
      porPeriodo.forEach((filas) =>
        filas.filter((f) => f.ranking === r.clave && f.posicion <= TOP).forEach((f) => codigos.add(f.codigo_banco)),
      );
      const bancos = [...codigos].map((codigo) => {
        let nombre = codigo;
        const serie = porPeriodo.map((filas) => {
          const f = filas.find((x) => x.ranking === r.clave && x.codigo_banco === codigo);
          if (!f) return null;
          nombre = nombreBanco(f.codigo_banco, f.banco);
          return { posicion: f.posicion, saldo: compacto(f.saldo_actividad), n: numero(f.saldo_actividad) };
        });
        return { codigo, banco: nombre, serie };
      });
      return { clave: r.clave, nombre: r.nombre, bancos };
    }).filter((r) => r.bancos.length);

    if (!lista.length) return null;
    return { periodos, rankings: lista };
  } catch (error) {
    console.error("[login] No se pudieron leer las cifras:", error.message);
    return null;
  }
}
