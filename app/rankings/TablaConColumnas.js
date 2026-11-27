"use client";
// TablaConColumnas — Envuelve TablaOrdenable con un menú "Columnas" (casillas) para mostrar u
// ocultar columnas. La preferencia vive en el estado del cliente.
//
// Props: las de TablaOrdenable, más
//   ocultasInicial  [clave] columnas ocultas al cargar.
//   fijas           [clave] columnas que no se pueden ocultar.
import { useState } from "react";
import TablaOrdenable from "@/components/TablaOrdenable";

export default function TablaConColumnas({ columnas = [], ocultasInicial = [], fijas = [], ...resto }) {
  const [ocultas, setOcultas] = useState(() => new Set(ocultasInicial));

  function alternar(clave) {
    setOcultas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(clave)) nuevas.delete(clave);
      else nuevas.add(clave);
      return nuevas;
    });
  }

  const visibles = columnas.filter((c) => !ocultas.has(c.clave));

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <details className="relative">
          <summary className="boton cursor-pointer select-none text-sm">Columnas</summary>
          <fieldset className="tarjeta absolute right-0 z-20 mt-1 w-64 space-y-1 text-sm shadow-lg">
            <legend className="sr-only">Mostrar u ocultar columnas</legend>
            {columnas.map((c) => (
              <label key={c.clave} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!ocultas.has(c.clave)}
                  disabled={fijas.includes(c.clave)}
                  onChange={() => alternar(c.clave)}
                />
                {c.titulo}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      <TablaOrdenable columnas={visibles} {...resto} />
    </div>
  );
}
