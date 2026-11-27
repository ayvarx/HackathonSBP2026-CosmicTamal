"use client";
// FranjaDatos — Franja fija (siempre visible al desplazarse) con la fuente, el período en
// consulta y el aviso de datos ficticios que exige la lámina 9 de la presentación.
// Estilo ".persistent-disclaimer" / ".fiction-label" del frontend de Amet (definido en globals.css).
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
const AVISO = "Datos ficticios";

const esCorte = (valor) => /^\d{8}$/.test(valor ?? "");

/** Contenido visual de la franja (sin leer la URL). */
function ContenidoFranja({ periodo, anterior, origen }) {
  let textoPeriodo = "sin cortes cargados";
  if (periodo) {
    textoPeriodo = anterior ? `${formatearFecha(anterior)} → ${formatearFecha(periodo)}` : formatearFecha(periodo);
  }
  return (
    <div className="franja-fija">
      <div className="contenedor">
        <div className="persistent-disclaimer" role="note" aria-label="Fuente y aviso de datos">
          <span>
            <b>Fuente:</b> {FUENTE}
          </span>
          <span>
            <b>Período en consulta:</b> <span className="cifra">{textoPeriodo}</span>
            {periodo && origen === "vigente" && <span> (último corte)</span>}
          </span>
          <span className="fiction-label">
            <span aria-hidden="true" className="icono-aviso">
              !
            </span>
            <span>{AVISO}</span>
          </span>
        </div>
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
