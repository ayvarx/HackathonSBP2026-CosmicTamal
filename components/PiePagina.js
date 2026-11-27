// PiePagina — Pie común: repite la fuente y el aviso, y explica el alcance del prototipo.
// Componente de servidor (ya incluido en app/layout.js).
//
// Props:
//   perfil (string)  Perfil actual, para recordarlo al pie.
import { NOMBRE_PERFIL } from "@/lib/auth";

export default function PiePagina({ perfil }) {
  return (
    <footer className="mt-12 border-t border-borde bg-superficie">
      <div className="contenedor flex flex-col gap-2 py-6 text-xs text-texto-tenue md:flex-row md:justify-between">
        <div className="max-w-2xl space-y-1">
          <p>
            <span className="font-semibold text-texto-suave">Fuente:</span> Datos AT03 sintéticos · Hackathon SBP 2026.
            Rankings calculados desde los archivos de corte con los catálogos CINU/SB109, SB21 y de bancos suministrados.
          </p>
          <p>
            Datos ficticios: no representan al sistema bancario panameño. Uso informativo, no es opinión formal de la
            Superintendencia de Bancos de Panamá.
          </p>
        </div>
        <p className="md:text-right">
          Prototipo académico · Perfil actual: <span className="font-semibold">{NOMBRE_PERFIL[perfil]}</span>
        </p>
      </div>
    </footer>
  );
}
