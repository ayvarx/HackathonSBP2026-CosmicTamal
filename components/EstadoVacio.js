// EstadoVacio — Mensaje cuando no hay datos que mostrar (sin cortes cargados, filtros sin resultados...).
// Funciona en componentes de servidor y de cliente.
//
// Uso:
//   <EstadoVacio titulo="Aún no hay cortes cargados"
//                accion={{ href: "/admin", texto: "Ir a Administración" }}>
//     Cargue un archivo AT03 para calcular los rankings.
//   </EstadoVacio>
//
// Props:
//   titulo   (string)  Frase corta que explica qué falta. Predeterminado: "No hay datos para mostrar".
//   children (nodo)    Explicación y qué puede hacer el usuario.
//   accion   ({ href, texto }) opcional  Enlace a la acción sugerida.
import Link from "next/link";

export default function EstadoVacio({ titulo = "No hay datos para mostrar", children, accion }) {
  return (
    <section className="tarjeta flex flex-col items-start gap-2 border-dashed px-6 py-8" aria-live="polite">
      <h2 className="text-base font-semibold">{titulo}</h2>
      {children && <div className="max-w-prose text-sm text-texto-suave">{children}</div>}
      {accion?.href && (
        <Link href={accion.href} className="boton boton-secundario mt-2">
          {accion.texto}
        </Link>
      )}
    </section>
  );
}
