"use client";
// Portado del frontend de Amet: components/ExportPanel.jsx (enlaza a /api/exportar/* en lugar de api.js).
import BotonDescarga from "@/components/BotonDescarga";
import "./amet-export.css";

const TIPOS = {
  rankings: { texto: "Rankings consolidados", href: "/api/exportar/rankings" },
  desglose: { texto: "Desglose por subactividad", href: "/api/exportar/subactividades" },
};

/** @param {{periodo: string, textoPeriodo: string}} props periodo = AAAAMMDD activo ("" = todos). */
export default function ExportPanel({ periodo, textoPeriodo }) {
  return (
    <div className="amet-exp">
      <div className="panel export-panel">
        <span className="eyebrow">ACCESO RÁPIDO</span>
        <h2>Exportar resultados</h2>
        <p className="helper-text">Descarga el archivo del período activo ({textoPeriodo}).</p>
        <div className="flex flex-row flex-wrap items-start gap-2">
          {Object.entries(TIPOS).map(([k, v], i) => (
            <BotonDescarga key={k} href={v.href} parametros={{ fecha: periodo }} texto={v.texto} variante={i === 0 ? "primario" : "secundario"} />
          ))}
        </div>
      </div>
    </div>
  );
}
