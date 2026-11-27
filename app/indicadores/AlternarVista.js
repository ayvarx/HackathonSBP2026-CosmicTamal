"use client";
// AlternarVista — muestra el gráfico o la tabla del mismo bloque, nunca los dos a la vez.
// El botón cambia entre "Ver como tabla" y "Ver gráfico".
import { useState } from "react";

export default function AlternarVista({ grafico, tabla }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" className="boton boton-secundario" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>
      {verTabla ? tabla : grafico}
    </div>
  );
}
