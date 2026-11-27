"use client";
// Descarga de movimientos con la casilla "Incluir columnas Significativo y Motivo"
// (agrega extendido=1 a la dirección de descarga).
import { useState } from "react";
import BotonDescarga from "@/components/BotonDescarga";

export default function DescargaMovimientos({ parametros, descripcion }) {
  const [extendido, setExtendido] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <BotonDescarga
        href="/api/exportar/movimientos"
        parametros={{ ...parametros, ...(extendido ? { extendido: 1 } : {}) }}
        texto="Descargar movimientos"
        descripcion={descripcion}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={extendido} onChange={(e) => setExtendido(e.target.checked)} />
        Incluir columnas Significativo y Motivo
      </label>
    </div>
  );
}
