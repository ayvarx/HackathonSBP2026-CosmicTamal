// Portado del frontend de Amet: components/ExportPanel.jsx (versión nueva). Cada descarga usa
// BotonDescarga (CSV, Excel y PDF) contra /api/exportar/*.
import BotonDescarga from "@/components/BotonDescarga";
import "./amet-export.css";

const CONTENIDOS = [
  {
    id: "rankings", titulo: "Rankings por actividad", href: "/api/exportar/rankings",
    texto: "Posición, saldo, cartera total y peso de cada banco en las seis actividades.",
    icono: <path d="M5 20V10M12 20V4M19 20v-7" />,
  },
  {
    id: "desglose", titulo: "Desglose por subactividad", href: "/api/exportar/subactividades",
    texto: "Saldo de cada banco en cada subactividad, con la reclasificación SB21 aplicada.",
    icono: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l6 4" /></>,
  },
];

/** @param {{periodo: string, textoPeriodo: string}} props periodo = AAAAMMDD activo. */
export default function ExportPanel({ periodo, textoPeriodo }) {
  return (
    <div className="exportar">
      <div className="exp-grid">
        {CONTENIDOS.map((c, i) => (
          <section key={c.id} className="exp-card">
            <header className="exp-cabecera">
              <span className="exp-icono">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icono}</svg>
              </span>
              <div>
                <span className="exp-etiqueta">{textoPeriodo}</span>
                <h3>{c.titulo}</h3>
              </div>
            </header>
            <p>{c.texto}</p>
            <div className="exp-formatos flex flex-row flex-wrap items-start gap-2">
              <BotonDescarga href={c.href} parametros={{ fecha: periodo }} texto={`Descargar ${c.titulo.toLowerCase()}`} descripcion={c.texto} variante={i === 0 ? "primario" : "secundario"} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
