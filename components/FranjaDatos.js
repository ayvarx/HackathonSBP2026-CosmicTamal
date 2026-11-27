"use client";
// FranjaDatos — Franja fija (siempre visible al desplazarse) con la fuente, el período en
// consulta y el aviso de datos ficticios que exige la lámina 9 de la presentación.
//
// El período se toma de la URL si la pantalla lo filtra (?periodo=AAAAMMDD; en comparaciones
// también ?anterior=AAAAMMDD). Si la URL no lo trae, se muestra el último corte cargado
// (prop periodoVigente, que el layout obtiene del servidor).
//
// Uso (ya incluido en app/layout.js):
//   <FranjaDatos periodoVigente="20260930" />
//
// Props:
//   periodoVigente (string AAAAMMDD | null)  Último corte disponible; null si no hay cortes.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { formatearFecha } from "@/lib/formato";

const FUENTE = "Datos AT03 sintéticos · Hackathon SBP 2026";
const AVISO = "Datos ficticios: no representan al sistema bancario panameño · Uso informativo, no es opinión formal de la SBP";

const esCorte = (valor) => /^\d{8}$/.test(valor ?? "");

/** Contenido visual de la franja (sin leer la URL). */
function ContenidoFranja({ periodo, anterior, origen }) {
  let textoPeriodo = "sin cortes cargados";
  if (periodo) {
    textoPeriodo = anterior ? `${formatearFecha(anterior)} → ${formatearFecha(periodo)}` : formatearFecha(periodo);
  }
  return (
    <div className="sticky top-0 z-30 border-y border-aviso-borde bg-aviso-fondo text-aviso-texto">
      <div className="contenedor flex flex-col gap-x-6 gap-y-1 py-2 text-[0.8rem] leading-snug lg:flex-row lg:items-center">
        <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-0.5">
          <span>
            <span className="font-semibold">Fuente:</span> {FUENTE}
          </span>
          <span>
            <span className="font-semibold">Período en consulta:</span>{" "}
            <span className="cifra">{textoPeriodo}</span>
            {periodo && origen === "vigente" && <span> (último corte)</span>}
          </span>
        </p>
        <p className="flex items-start gap-2 font-semibold lg:ml-auto">
          <span
            aria-hidden="true"
            className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-current text-[0.65rem] leading-none"
          >
            !
          </span>
          <span>{AVISO}</span>
        </p>
      </div>
    </div>
  );
}

function FranjaConUrl({ periodoVigente }) {
  const parametros = useSearchParams();
  const periodoUrl = parametros.get("periodo");
  const anteriorUrl = parametros.get("anterior");
  if (esCorte(periodoUrl)) {
    return <ContenidoFranja periodo={periodoUrl} anterior={esCorte(anteriorUrl) ? anteriorUrl : null} origen="url" />;
  }
  return <ContenidoFranja periodo={esCorte(periodoVigente) ? periodoVigente : null} origen="vigente" />;
}

export default function FranjaDatos({ periodoVigente = null }) {
  const vigente = esCorte(periodoVigente) ? periodoVigente : null;
  return (
    <Suspense fallback={<ContenidoFranja periodo={vigente} origen="vigente" />}>
      <FranjaConUrl periodoVigente={vigente} />
    </Suspense>
  );
}
