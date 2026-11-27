"use client";
// AlternarVista — Sección con su título h2, sus acciones a la derecha y un conmutador
// Tabla / Gráfico: el mismo dato se muestra de una sola forma a la vez.
//
// Props: id, titulo, acciones (nodo), tabla (nodo), grafico (nodo opcional).
import { useState } from "react";

export default function AlternarVista({ id, titulo, acciones, tabla, grafico }) {
  const [modo, setModo] = useState("tabla");
  const opciones = [
    { clave: "tabla", texto: "Tabla" },
    { clave: "grafico", texto: "Gráfico" },
  ];

  return (
    <section aria-labelledby={id} className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id}>{titulo}</h2>
        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
          {grafico && (
            <div role="group" aria-label="Forma de ver los datos" className="inline-flex overflow-hidden rounded-lg border border-borde">
              {opciones.map((o) => (
                <button
                  key={o.clave}
                  type="button"
                  onClick={() => setModo(o.clave)}
                  aria-pressed={modo === o.clave}
                  className={`px-3 py-1.5 text-sm font-semibold ${modo === o.clave ? "bg-primario text-white" : "bg-superficie text-texto-suave"}`}
                >
                  {o.texto}
                </button>
              ))}
            </div>
          )}
          {acciones}
        </div>
      </div>
      {grafico && modo === "grafico" ? grafico : tabla}
    </section>
  );
}
