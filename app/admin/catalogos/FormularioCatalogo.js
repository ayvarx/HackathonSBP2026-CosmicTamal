"use client";
// Reemplaza un catálogo completo desde un CSV (POST /api/admin/catalogos) y recalcula.
import { useState } from "react";
import { useRouter } from "next/navigation";
import MensajeError from "@/components/MensajeError";

const OPCIONES = [
  { valor: "bancos", texto: "Bancos", encabezado: "Codigo_Banco,Nombre_Ficticio,Tipo_Licencia" },
  { valor: "cinu", texto: "Catálogo CINU / SB109", encabezado: "Codigo_CINU,Descripcion,Macroactividad_Reto,Subactividad_Reto,Codigo_SB08_Referencia" },
  { valor: "sb21", texto: "Tabla SB21 simplificada", encabezado: "Codigo,Descripcion,Uso_en_reto" },
];

export default function FormularioCatalogo() {
  const router = useRouter();
  const [tipo, setTipo] = useState("bancos");
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState({ tipo: "inicial" });
  const opcion = OPCIONES.find((o) => o.valor === tipo);

  async function enviar(evento) {
    evento.preventDefault();
    if (!archivo) return;
    setEstado({ tipo: "procesando" });
    try {
      const datos = new FormData();
      datos.append("tipo", tipo);
      datos.append("archivo", archivo, archivo.name);
      const respuesta = await fetch("/api/admin/catalogos", { method: "POST", body: datos });
      const r = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !r?.ok) {
        setEstado({ tipo: "error", mensaje: r?.mensaje ?? `El servidor respondió con el código ${respuesta.status}.` });
        return;
      }
      setEstado({ tipo: "ok", mensaje: `Catálogo «${opcion.texto}» reemplazado con ${r.filas} filas. Los rankings se recalcularon.` });
      router.refresh();
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo conectar con el servidor. Intente de nuevo." });
    }
  }

  return (
    <form className="tarjeta flex flex-col gap-3" onSubmit={enviar}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="md:w-64">
          <label className="etiqueta-campo" htmlFor="tipo-catalogo">Catálogo</label>
          <select id="tipo-catalogo" className="control" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {OPCIONES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label className="etiqueta-campo" htmlFor="archivo-catalogo">Archivo CSV</label>
          <input id="archivo-catalogo" type="file" accept=".csv,text/csv" className="control" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </div>
        <button type="submit" className="boton boton-secundario md:ml-auto" disabled={!archivo || estado.tipo === "procesando"}>
          {estado.tipo === "procesando" ? "Reemplazando…" : "Reemplazar y recalcular"}
        </button>
      </div>
      <p className="text-xs text-texto-tenue">
        Columnas: <code>{opcion.encabezado}</code>
      </p>
      <div aria-live="polite">
        {estado.tipo === "ok" && (
          <p className="rounded-tarjeta border border-exito-borde bg-exito-fondo px-4 py-3 text-sm font-semibold">{estado.mensaje}</p>
        )}
        {estado.tipo === "error" && <MensajeError titulo="No se reemplazó el catálogo" mensaje={estado.mensaje} />}
      </div>
    </form>
  );
}
