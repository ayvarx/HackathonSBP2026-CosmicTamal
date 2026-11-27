// NotaFuente — Pie de cada pantalla de rankings con la fuente, el período y el aviso de datos
// ficticios (lámina 9). La franja superior ya los muestra; aquí se repiten junto a las cifras
// para que una captura de pantalla de la tabla nunca quede sin su contexto.
// Componente de servidor.
//
// Props:
//   fecha    (string AAAAMMDD)  Período mostrado.
//   anterior (string AAAAMMDD | null)  Período con el que se compara (opcional).
import { AVISO_DATOS_FICTICIOS, FUENTE } from "@/lib/consultas";
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
          . Cifras calculadas por el motor SQL con aritmética decimal exacta; montos con 2 decimales.
        </p>
      )}
      <p className="mt-1 font-semibold">{AVISO_DATOS_FICTICIOS}</p>
    </aside>
  );
}
