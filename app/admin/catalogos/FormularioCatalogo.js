"use client";
// Reemplaza un catálogo completo desde un CSV (con el mismo encabezado que el archivo original
// de datos/). La ruta /api/admin/catalogos exige el perfil Administrador y valida el archivo;
// si es válido, recalcula los rankings con el catálogo nuevo.
import { useState } from "react";
import { useRouter } from "next/navigation";
import MensajeError from "@/components/MensajeError";

const OPCIONES = [
  { valor: "bancos", texto: "Bancos ficticios", encabezado: "Codigo_Banco,Nombre_Ficticio,Tipo_Licencia" },
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
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="etiqueta-campo" htmlFor="tipo-catalogo">Catálogo</label>
          <select id="tipo-catalogo" className="control" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {OPCIONES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta-campo" htmlFor="archivo-catalogo">Archivo CSV</label>
          <input id="archivo-catalogo" type="file" accept=".csv,text/csv" className="control" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <p className="text-xs text-texto-tenue">
        Encabezado exigido: <code>{opcion.encabezado}</code>. Se reemplaza el catálogo completo y se recalculan todos los
        períodos. Si el archivo tiene errores, no se cambia nada.
      </p>
      <div>
        <button type="submit" className="boton boton-secundario" disabled={!archivo || estado.tipo === "procesando"}>
          {estado.tipo === "procesando" ? "Reemplazando…" : "Reemplazar catálogo y recalcular"}
        </button>
      </div>
      <div aria-live="polite">
        {estado.tipo === "ok" && (
          <p className="rounded-tarjeta border border-exito-borde bg-exito-fondo px-4 py-3 text-sm font-semibold">{estado.mensaje}</p>
        )}
        {estado.tipo === "error" && <MensajeError titulo="No se reemplazó el catálogo" mensaje={estado.mensaje} />}
      </div>
    </form>
  );
}
