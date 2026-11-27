// PiePagina — Pie común: una línea discreta con la fuente y el perfil actual (el aviso de datos
// ficticios lo muestra solo la franja superior fija).
// Componente de servidor (ya incluido en app/layout.js).
//
// Props:
//   perfil (string)  Perfil actual, para recordarlo al pie.
import { NOMBRE_PERFIL } from "@/lib/auth";
import LogoRadar from "./LogoRadar";

export default function PiePagina({ perfil }) {
  return (
    <footer className="pie-radar mt-12">
      <div className="contenedor flex flex-col gap-2 py-4 text-xs text-texto-tenue md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl">
          <span className="font-semibold text-texto-suave">Fuente:</span> Datos AT03 sintéticos · Hackathon SBP 2026
        </p>
        <p className="flex items-center gap-2 md:justify-end md:text-right">
          <LogoRadar size={20} decorativo />
          <span>
            Perfil actual: <span className="font-semibold">{NOMBRE_PERFIL[perfil]}</span>
          </span>
        </p>
      </div>
    </footer>
  );
}
