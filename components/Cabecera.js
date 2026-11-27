// Cabecera — Barra superior con el nombre de la plataforma, el perfil actual y el menú.
// Componente de servidor: decide aquí qué secciones ve cada perfil (rutasPermitidas).
//
// Uso (ya incluido en app/layout.js):
//   <Cabecera perfil={await obtenerPerfil()} />
//
// Props:
//   perfil (string)  'publico' | 'analista' | 'administrador'.
import Link from "next/link";
import { NOMBRE_PERFIL, PERFILES, rutasPermitidas } from "@/lib/auth";
import ConmutadorPerfil from "./ConmutadorPerfil";
import NavegacionPrincipal from "./NavegacionPrincipal";

export default function Cabecera({ perfil }) {
  const enlaces = rutasPermitidas(perfil).map(({ ruta, etiqueta }) => ({ ruta, etiqueta }));
  const perfiles = PERFILES.map((valor) => ({ valor, nombre: NOMBRE_PERFIL[valor] }));

  return (
    <header>
      <div className="zona-oscura bg-primario text-sobre-primario">
        <div className="contenedor flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3 text-sobre-primario no-underline">
            {/* Marca neutra: tres barras de un ranking (no es el logotipo de ninguna entidad) */}
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30" className="shrink-0">
              <rect x="0.5" y="0.5" width="29" height="29" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.5" />
              <rect x="7" y="16" width="4" height="8" fill="currentColor" />
              <rect x="13" y="11" width="4" height="13" fill="currentColor" />
              <rect x="19" y="6" width="4" height="18" fill="currentColor" />
            </svg>
            <span className="leading-tight">
              <span className="block text-base font-semibold">Rankings de crédito bancario</span>
              <span className="block text-xs text-sobre-primario-suave">
                Por banco y actividad económica · Hackathon SBP 2026
              </span>
            </span>
          </Link>
          <div className="flex flex-col items-start gap-1 md:items-end">
            <ConmutadorPerfil perfilActual={perfil} perfiles={perfiles} />
          </div>
        </div>
      </div>
      <NavegacionPrincipal enlaces={enlaces} />
    </header>
  );
}
