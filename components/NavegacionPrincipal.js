"use client";
// NavegacionPrincipal — Menú de secciones con la sección actual marcada (aria-current).
// Recibe SOLO los enlaces que el perfil puede ver; ese filtro lo hace el servidor (Cabecera)
// con rutasPermitidas(perfil). Ocultar enlaces es comodidad: el control real está en cada página.
//
// Props:
//   enlaces  Lista de { ruta, etiqueta }.
import Link from "next/link";
import { usePathname } from "next/navigation";

function estaActiva(rutaActual, ruta) {
  if (ruta === "/") return rutaActual === "/";
  return rutaActual === ruta || rutaActual.startsWith(ruta + "/");
}

export default function NavegacionPrincipal({ enlaces }) {
  const rutaActual = usePathname() ?? "/";
  return (
    <nav aria-label="Secciones" className="border-b border-borde bg-superficie">
      <ul className="contenedor flex gap-1 overflow-x-auto">
        {enlaces.map(({ ruta, etiqueta }) => {
          const activa = estaActiva(rutaActual, ruta);
          return (
            <li key={ruta} className="shrink-0">
              <Link
                href={ruta}
                aria-current={activa ? "page" : undefined}
                className={`-mb-px inline-block border-b-[3px] px-3 py-3 text-sm no-underline ${
                  activa
                    ? "border-primario font-semibold text-primario"
                    : "border-transparent text-texto-suave hover:border-borde-fuerte hover:text-texto"
                }`}
              >
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
