// urls.js — Arma las direcciones de las pantallas de rankings con sus filtros.
// Se omiten los parámetros vacíos para que los enlaces queden limpios y se puedan compartir.

/**
 * urlRankings({ periodo: "20260930", ranking: "CONSUMO", banco: "" }) → "/rankings?periodo=20260930&ranking=CONSUMO"
 * @param {Record<string, string>} parametros
 * @param {string} [ruta] "/rankings" por defecto; "/rankings/detalle" para el detalle de préstamos.
 */
export function urlRankings(parametros, ruta = "/rankings") {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) if (valor) consulta.set(clave, valor);
  const texto = consulta.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}
