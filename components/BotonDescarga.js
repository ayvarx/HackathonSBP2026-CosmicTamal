// BotonDescarga — Botón que despliega las tres descargas de una ruta de exportación:
// CSV, Excel (XLSX) y PDF (la ruta recibe ?formato=csv|xlsx|pdf). Servidor y cliente.
// Usa <details>/<summary> (accesible con teclado, sin JavaScript) y cada opción es un <a download>
// normal (no <Link>) para que el navegador descargue el archivo sin precargarlo.
// El contenedor es inline-flex: varios botones seguidos quedan en fila.
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
//   formato     (string)  Predeterminado "CSV"; formato que se lista primero en el menú.
//   descripcion (string)  opcional  Qué contiene el archivo (se muestra al abrir el menú y como ayuda).
//   variante    ("primario" | "secundario")  Predeterminado "secundario".
const OPCIONES = [
  { clave: "csv", texto: "CSV" },
  { clave: "xlsx", texto: "Excel (XLSX)" },
  { clave: "pdf", texto: "PDF" },
];

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
  const base = consulta.size ? `${href}${href.includes("?") ? "&" : "?"}${consulta}` : href;
  // CSV sin parámetro: la misma dirección de siempre (idéntica a la clave de control).
  const destino = (clave) => (clave === "csv" ? base : `${base}${base.includes("?") ? "&" : "?"}formato=${clave}`);
  const preferido = String(formato || "").toLowerCase();
  const opciones = [...OPCIONES].sort((a, b) => (b.clave === preferido) - (a.clave === preferido));

  return (
    <details className="relative inline-flex shrink-0 align-top">
      <summary
        className={`${variante === "primario" ? "boton" : "boton boton-secundario"} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        title={descripcion || undefined}
      >
        <span aria-hidden="true">↓</span>
        {texto}
        <span className="text-xs font-normal opacity-80">(CSV · XLSX · PDF)</span>
        <span aria-hidden="true" className="text-xs">▾</span>
      </summary>
      <div className="absolute left-0 top-full z-40 mt-1 flex min-w-full w-max max-w-xs flex-col rounded-md border border-borde bg-superficie p-1 shadow-lg">
        {opciones.map((o) => (
          <a
            key={o.clave}
            href={destino(o.clave)}
            download
            className="rounded px-3 py-2 text-sm font-medium text-texto no-underline hover:bg-primario-suave focus-visible:bg-primario-suave"
          >
            <span aria-hidden="true">↓ </span>
            {o.texto}
          </a>
        ))}
        {descripcion && <span className="border-t border-borde-suave px-3 pt-2 pb-1 text-xs text-texto-tenue">{descripcion}</span>}
      </div>
    </details>
  );
}
