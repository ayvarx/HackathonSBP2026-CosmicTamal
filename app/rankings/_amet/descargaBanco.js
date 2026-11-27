// Portado del frontend de Amet: descargaBanco.js
// En Amet el CSV de un banco se armaba en el navegador con datos de su API Express.
// Aquí se usan las rutas oficiales /api/exportar/* (mismas columnas que los entregables
// 2 y 3), filtradas por ranking y banco, para que el archivo salga del motor SQL.

/**
 * Enlaces de descarga de un banco en un ranking.
 * @param {{fecha: string, ranking: string, codigo: string}} opciones
 * @returns {{texto: string, href: string, descripcion: string}[]}
 */
export function descargasBanco({ fecha, ranking, codigo }) {
  const historico = new URLSearchParams({ ranking, banco: codigo });
  const corte = new URLSearchParams({ fecha, ranking, banco: codigo });
  return [
    {
      texto: "Histórico",
      href: `/api/exportar/rankings?${historico}`,
      descripcion: "Posición, saldo y ponderación del banco en todos los cortes cargados",
    },
    {
      texto: "Desglose",
      href: `/api/exportar/subactividades?${corte}`,
      descripcion: "Saldo del banco por subactividad en este corte",
    },
  ];
}
