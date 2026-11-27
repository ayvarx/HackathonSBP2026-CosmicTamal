// NotaFuente — Pie de cada pantalla de rankings con la fuente y el período (lámina 9). El aviso
// de datos ficticios lo muestra solo la franja superior fija.
// Componente de servidor.
//
// Props:
//   fecha    (string AAAAMMDD)  Período mostrado.
//   anterior (string AAAAMMDD | null)  Período con el que se compara (opcional).
import { FUENTE } from "@/lib/consultas";
import { formatearFecha } from "@/lib/formato";

export default function NotaFuente({ fecha, anterior }) {
  return (
    <aside className="mt-10 border-t border-borde pt-4 text-xs text-texto-tenue" aria-label="Fuente y período de los datos">
      <p>{FUENTE}</p>
      {fecha && (
        <p className="mt-1">
          Período: <span className="cifra">{formatearFecha(fecha)} (Fecha = {fecha})</span>
          {anterior && (
            <>
              {" "}· comparado con <span className="cifra">{formatearFecha(anterior)} ({anterior})</span>
            </>
          )}
          .
        </p>
      )}
    </aside>
  );
}
