// EncabezadoPagina — Título (h1), descripción y acciones de cada pantalla, siempre en el mismo lugar.
// Servidor y cliente.
//
// Uso:
//   <EncabezadoPagina titulo="Rankings" descripcion="Posición de cada banco por actividad económica.">
//     <BotonDescarga href="/api/exportar/rankings" texto="Descargar rankings" />
//   </EncabezadoPagina>
//
// Props:
//   titulo      (string)  Título de la pantalla (único h1 de la página).
//   descripcion (string|nodo)  opcional  Una o dos frases sobre qué muestra la pantalla.
//   children    (nodo)    opcional  Acciones a la derecha (descargas, botones).
export default function EncabezadoPagina({ titulo, descripcion, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-borde pb-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-3xl text-texto-suave">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-start gap-2">{children}</div>}
    </div>
  );
}
