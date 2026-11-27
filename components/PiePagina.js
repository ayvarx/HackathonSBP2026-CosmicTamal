// PiePagina — Pie común: repite la fuente y el aviso, y explica el alcance del prototipo.
// Componente de servidor (ya incluido en app/layout.js).
//
// Props:
//   perfil (string)  Perfil actual, para recordarlo al pie.
import { NOMBRE_PERFIL } from "@/lib/auth";
import LogoRadar from "./LogoRadar";

export default function PiePagina({ perfil }) {
  return (
    <footer className="pie-radar mt-12">
      <div className="contenedor flex flex-col gap-2 py-6 text-xs text-texto-tenue md:flex-row md:justify-between">
        <div className="max-w-2xl space-y-1">
          <p>
            <span className="font-semibold text-texto-suave">Fuente:</span> Datos AT03 sintéticos · Hackathon SBP 2026.
          </p>
          <p>Datos ficticios</p>
        </div>
        <p className="flex items-start gap-2 md:justify-end md:text-right">
          <LogoRadar size={20} decorativo />
          <span>
            Perfil actual: <span className="font-semibold">{NOMBRE_PERFIL[perfil]}</span>
          </span>
        </p>
      </div>
    </footer>
  );
}
