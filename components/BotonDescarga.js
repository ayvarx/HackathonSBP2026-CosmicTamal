// BotonDescarga — Enlace a una ruta de exportación (route.js que devuelve un CSV). Servidor y cliente.
// Es un <a> normal (no <Link>) para que el navegador descargue el archivo sin precargarlo.
//
// Uso:
//   <BotonDescarga href="/api/exportar/rankings"
//                  parametros={{ periodo: "20260930", ranking: "CONSTRUCCION" }}
//                  texto="Descargar rankings"
//                  descripcion="Columnas del entregable 2: Fecha, Ranking, Posicion, ..." />
//
// Props:
//   href        (string)  Ruta de la exportación.
//   parametros  (objeto)  opcional  Se agregan como ?clave=valor (se omiten los vacíos).
//   texto       (string)  Predeterminado "Descargar".
//   formato     (string)  Predeterminado "CSV"; se muestra junto al texto.
//   descripcion (string)  opcional  Qué contiene el archivo (se muestra debajo).
//   variante    ("primario" | "secundario")  Predeterminado "secundario".
export default function BotonDescarga({
  href,
  parametros,
  texto = "Descargar",
  formato = "CSV",
  descripcion,
  variante = "secundario",
}) {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros ?? {})) {
    if (valor !== undefined && valor !== null && valor !== "") consulta.set(clave, String(valor));
  }
  const destino = consulta.size ? `${href}${href.includes("?") ? "&" : "?"}${consulta}` : href;

  return (
    <div className="inline-flex flex-col gap-1">
      <a href={destino} download className={variante === "primario" ? "boton" : "boton boton-secundario"}>
        <span aria-hidden="true">↓</span>
        {texto}
        {formato && <span className="text-xs font-normal opacity-80">({formato})</span>}
      </a>
      {descripcion && <span className="max-w-xs text-xs text-texto-tenue">{descripcion}</span>}
    </div>
  );
}
