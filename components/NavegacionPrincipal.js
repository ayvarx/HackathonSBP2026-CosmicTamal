"use client";
// NavegacionPrincipal — Menú de secciones con la sección actual marcada (aria-current).
// Estilo de pestañas ".app-tabs" del frontend de Amet (components/topbar.css).
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
    <nav aria-label="Secciones" className="app-tabs">
      <ul className="contenedor">
        {enlaces.map(({ ruta, etiqueta }) => {
          const activa = estaActiva(rutaActual, ruta);
          return (
            <li key={ruta}>
              <Link href={ruta} aria-current={activa ? "page" : undefined} className={activa ? "activa" : undefined}>
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
