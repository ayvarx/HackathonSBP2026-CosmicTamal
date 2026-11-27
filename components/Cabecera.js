// Cabecera — Barra superior con el nombre de la plataforma, el perfil actual y el menú.
// Componente de servidor: decide aquí qué secciones ve cada perfil (rutasPermitidas).
// Aspecto adoptado del frontend de Amet (AppShell.jsx + topbar.css): banda verde con LogoAnimado
// y perfil, y pestañas de sección debajo; la navegación sigue siendo por rutas.
//
// Uso (ya incluido en app/layout.js):
//   <Cabecera perfil={await obtenerPerfil()} />
//
// Props:
//   perfil (string)  'publico' | 'analista' | 'administrador'.
import Link from "next/link";
import { NOMBRE_PERFIL, rutasPermitidas } from "@/lib/auth";
import ConmutadorPerfil from "./ConmutadorPerfil";
import NavegacionPrincipal from "./NavegacionPrincipal";
import LogoAnimado from "./LogoAnimado";
import { cookies } from "next/headers";
import { COOKIE_USUARIO } from "@/lib/usuarios";
import "./topbar.css";

export default async function Cabecera({ perfil }) {
  // Nombre de la cuenta (solo informativo; los permisos salen de la cookie de perfil firmada).
  const usuario = (await cookies()).get(COOKIE_USUARIO)?.value || null;
  const enlaces = rutasPermitidas(perfil).map(({ ruta, etiqueta }) => ({ ruta, etiqueta }));

  return (
    <header>
      <div className="app-cabecera zona-oscura">
        <div className="contenedor app-cabecera-fila">
          <Link href="/" className="app-marca">
            <span className="app-logo"><LogoAnimado size={46} decorativo id="la-cabecera" /></span>
            <span>
              <span className="app-marca-titulo">Rankings de crédito bancario</span>
              <small>Por banco y actividad económica · Hackathon SBP 2026</small>
            </span>
          </Link>
          <ConmutadorPerfil nombrePerfil={NOMBRE_PERFIL[perfil]} perfil={perfil} usuario={usuario} />
        </div>
      </div>
      <NavegacionPrincipal enlaces={enlaces} />
    </header>
  );
}
