// Cabecera — Barra superior con el nombre de la plataforma, el perfil actual y el menú.
// Componente de servidor: decide aquí qué secciones ve cada perfil (rutasPermitidas).
// Aspecto adoptado del frontend de Amet (AppShell.jsx + topbar.css): banda azul con LogoRadar
// y perfil, y pestañas de sección debajo; la navegación sigue siendo por rutas.
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
import LogoRadar from "./LogoRadar";
import "./topbar.css";

export default function Cabecera({ perfil }) {
  const enlaces = rutasPermitidas(perfil).map(({ ruta, etiqueta }) => ({ ruta, etiqueta }));
  const perfiles = PERFILES.map((valor) => ({ valor, nombre: NOMBRE_PERFIL[valor] }));

  return (
    <header>
      <div className="app-cabecera zona-oscura">
        <div className="contenedor app-cabecera-fila">
          <Link href="/" className="app-marca">
            <LogoRadar size={42} decorativo />
            <span>
              <span className="app-marca-titulo">Rankings de crédito bancario</span>
              <small>Por banco y actividad económica · Hackathon SBP 2026</small>
            </span>
          </Link>
          <ConmutadorPerfil perfilActual={perfil} perfiles={perfiles} />
        </div>
      </div>
      <NavegacionPrincipal enlaces={enlaces} />
    </header>
  );
}
