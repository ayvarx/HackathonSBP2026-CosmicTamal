"use client";
// Paginacion — Enlaces "Anterior / 1 2 3 … / Siguiente" que cambian ?pagina= en la URL
// y conservan los demás filtros. La página de servidor lee `pagina` de searchParams y
// consulta solo ese tramo (LIMIT/OFFSET), útil para listas largas como las filas excluidas.
//
// Uso desde una página de servidor:
//   const pagina = Math.max(1, Number((await searchParams).pagina) || 1);
//   <Paginacion paginaActual={pagina} totalPaginas={Math.ceil(total / 50)} totalFilas={total} porPagina={50} />
//
// Props:
//   paginaActual (number)  Página que se está mostrando (desde 1).
//   totalPaginas (number)  Cantidad total de páginas. Si es 1 o menos, no se muestra nada.
//   totalFilas   (number)  opcional  Para el texto "Mostrando 51–100 de 3,200".
//   porPagina    (number)  opcional  Filas por página (necesario junto con totalFilas).
//   parametro    (string)  Nombre del parámetro en la URL. Predeterminado "pagina".
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { formatearEntero } from "@/lib/formato";

/** Números a mostrar: siempre la primera, la última y dos vecinas de la actual; "…" en los huecos. */
function paginasVisibles(actual, total) {
  const conjunto = new Set([1, total, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= total));
  const ordenadas = [...conjunto].sort((a, b) => a - b);
  const resultado = [];
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1] > 1) resultado.push("…");
    resultado.push(n);
  });
  return resultado;
}

function PaginacionInterna({ paginaActual, totalPaginas, totalFilas, porPagina, parametro }) {
  const ruta = usePathname();
  const parametros = useSearchParams();

  const enlace = (n) => {
    const nuevos = new URLSearchParams(parametros.toString());
    if (n <= 1) nuevos.delete(parametro);
    else nuevos.set(parametro, String(n));
    const consulta = nuevos.toString();
    return consulta ? `${ruta}?${consulta}` : ruta;
  };

  const actual = Math.min(Math.max(1, paginaActual), totalPaginas);
  const desde = totalFilas && porPagina ? (actual - 1) * porPagina + 1 : null;
  const hasta = desde ? Math.min(actual * porPagina, totalFilas) : null;

  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      {desde ? (
        <p className="text-texto-suave">
          Mostrando {formatearEntero(desde)}–{formatearEntero(hasta)} de {formatearEntero(totalFilas)}
        </p>
      ) : (
        <span />
      )}
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {actual > 1 ? (
            <Link className="boton boton-secundario" href={enlace(actual - 1)} scroll={false}>
              Anterior
            </Link>
          ) : (
            <span className="boton boton-secundario" aria-disabled="true">Anterior</span>
          )}
        </li>
        {paginasVisibles(actual, totalPaginas).map((n, i) =>
          n === "…" ? (
            <li key={`hueco-${i}`} className="px-1 text-texto-tenue" aria-hidden="true">…</li>
          ) : (
            <li key={n}>
              {n === actual ? (
                <span className="boton" aria-current="page">
                  <span className="solo-lector">Página </span>
                  {n}
                </span>
              ) : (
                <Link className="boton boton-secundario" href={enlace(n)} scroll={false}>
                  <span className="solo-lector">Página </span>
                  {n}
                </Link>
              )}
            </li>
          )
        )}
        <li>
          {actual < totalPaginas ? (
            <Link className="boton boton-secundario" href={enlace(actual + 1)} scroll={false}>
              Siguiente
            </Link>
          ) : (
            <span className="boton boton-secundario" aria-disabled="true">Siguiente</span>
          )}
        </li>
      </ul>
    </nav>
  );
}

export default function Paginacion({ paginaActual = 1, totalPaginas = 1, totalFilas, porPagina, parametro = "pagina" }) {
  if (!totalPaginas || totalPaginas <= 1) return null;
  return (
    <Suspense fallback={null}>
      <PaginacionInterna
        paginaActual={Number(paginaActual) || 1}
        totalPaginas={totalPaginas}
        totalFilas={totalFilas}
        porPagina={porPagina}
        parametro={parametro}
      />
    </Suspense>
  );
}
