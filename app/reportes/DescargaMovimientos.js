"use client";
// Descarga de movimientos con la casilla "Con significativo y motivo"
// (agrega extendido=1 a la dirección de descarga).
import { useState } from "react";
import BotonDescarga from "@/components/BotonDescarga";

export default function DescargaMovimientos({ parametros }) {
  const [extendido, setExtendido] = useState(false);
  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      <BotonDescarga
        href="/api/exportar/movimientos"
        parametros={{ ...parametros, ...(extendido ? { extendido: 1 } : {}) }}
        texto="Movimientos"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-[#106003]" checked={extendido} onChange={(e) => setExtendido(e.target.checked)} />
        Con significativo y motivo
      </label>
    </div>
  );
}
