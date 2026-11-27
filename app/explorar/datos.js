// Carga en el servidor las filas de un conjunto del Explorador (todos los períodos).
// La usan la página /explorar y la ruta /api/exportar/explorador. Solo para el servidor.
import { exclusiones, movimientos, periodos, rankings, subactividades } from "@/lib/consultas";
import { CONJUNTOS_EXPLORADOR, conjuntoValido } from "@/lib/explorador";

async function porPeriodo(fechas, consultarUno) {
  const filas = [];
  for (const fecha of fechas) filas.push(...(await consultarUno(fecha)));
  return filas;
}

async function todasLasExclusiones() {
  const filas = [];
  for (let pagina = 1; ; pagina += 1) {
    const r = await exclusiones({ pagina, tamano: 100000 });
    filas.push(...r.filas);
    if (filas.length >= r.total || r.filas.length === 0) return filas;
  }
}

/**
 * Filas del conjunto con solo sus columnas y todos los valores como texto (null = sin dato).
 * @param {string} clave rankings | subactividades | movimientos | exclusiones
 * @returns {Promise<{conjunto: string, fechas: string[], filas: Record<string, string|null>[]}>}
 */
export async function cargarConjunto(clave) {
  const conjunto = conjuntoValido(clave);
  const fechas = (await periodos()).map((p) => p.fecha);
  if (fechas.length === 0) return { conjunto, fechas, filas: [] };

  let crudas;
  if (conjunto === "rankings") crudas = await porPeriodo(fechas, (fecha) => rankings({ fecha }));
  else if (conjunto === "subactividades") crudas = await porPeriodo(fechas, (fecha) => subactividades({ fecha }));
  else if (conjunto === "movimientos") crudas = await movimientos();
  else crudas = await todasLasExclusiones();

  const columnas = CONJUNTOS_EXPLORADOR[conjunto].columnas;
  const filas = crudas.map((r) => {
    const fila = {};
    for (const { campo, tipo } of columnas) {
      let v = r[campo];
      if (tipo === "sino" && typeof v === "boolean") v = v ? "SI" : "NO";
      fila[campo] = v === null || v === undefined ? null : String(v);
    }
    return fila;
  });
  return { conjunto, fechas, filas };
}
