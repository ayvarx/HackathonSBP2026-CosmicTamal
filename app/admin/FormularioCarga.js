"use client";
// Formulario para subir un corte AT03 (CSV). Envía el archivo a /api/admin/cortes, que
// comprueba el perfil en el servidor, valida con lib/ingesta.js y, si todo está bien,
// carga y recalcula. Al terminar abre automáticamente "Qué cambió con este corte".
//
// El archivo se comprime con gzip en el navegador (CompressionStream) antes de enviarlo:
// el corte de septiembre pesa ~11 MB y comprimido viaja en ~3 MB (el servidor acepta hasta 64 MB).
import { useState } from "react";
import { useRouter } from "next/navigation";
import MensajeError from "@/components/MensajeError";
import { formatearEntero, formatearFecha } from "@/lib/formato";

/** Comprime el archivo con gzip si el navegador lo permite; si no, lo envía tal cual. */
async function comprimir(archivo) {
  if (typeof CompressionStream === "undefined") return { cuerpo: archivo, nombre: archivo.name };
  const flujo = archivo.stream().pipeThrough(new CompressionStream("gzip"));
  return { cuerpo: await new Response(flujo).blob(), nombre: `${archivo.name}.gz` };
}

function ListaErrores({ errores = [], total = 0 }) {
  if (!errores.length) return null;
  return (
    <div className="mt-2">
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {errores.map((e, i) => (
          <li key={i}>
            {e.fila ? <span className="font-semibold">Fila {e.fila}: </span> : null}
            {e.mensaje}
          </li>
        ))}
      </ul>
      {total > errores.length && (
        <p className="mt-1 text-xs text-texto-suave">
          Se muestran {errores.length} de {formatearEntero(total)} errores. Corrija estos y vuelva a intentarlo.
        </p>
      )}
    </div>
  );
}

export default function FormularioCarga({ periodosCargados = [] }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState(null);
  const [reemplazar, setReemplazar] = useState(false);
  const [estado, setEstado] = useState({ tipo: "inicial" });

  // Aviso previo (solo orientativo): el nombre del archivo sugiere un período ya cargado.
  const sugerido = /(\d{6})/.exec(archivo?.name ?? "")?.[1];
  const posibleRepetido = sugerido && periodosCargados.find((p) => p.startsWith(sugerido));

  async function enviar(modo, forzarReemplazo = false) {
    if (!archivo) {
      setEstado({ tipo: "error", titulo: "Seleccione un archivo", mensaje: "Elija primero el CSV AT03 que quiere cargar." });
      return;
    }
    const conReemplazo = forzarReemplazo || reemplazar;
    setEstado({ tipo: "procesando", modo });
    try {
      const { cuerpo, nombre } = await comprimir(archivo);
      const datos = new FormData();
      datos.append("archivo", cuerpo, nombre);
      datos.append("nombre", archivo.name);
      datos.append("reemplazar", conReemplazo ? "si" : "no");
      datos.append("modo", modo);
      const respuesta = await fetch("/api/admin/cortes", { method: "POST", body: datos });
      const r = await respuesta.json().catch(() => null);

      if (!r) {
        setEstado({ tipo: "error", titulo: "Respuesta inesperada del servidor", mensaje: `El servidor respondió con el código ${respuesta.status}. Intente de nuevo.` });
      } else if (respuesta.status === 403) {
        setEstado({ tipo: "error", titulo: "Acceso restringido", mensaje: r.mensaje, enlacePerfil: true });
      } else if (respuesta.status === 409) {
        setEstado({ tipo: "conflicto", mensaje: r.mensaje, periodos: r.periodos ?? [] });
      } else if (respuesta.status === 422) {
        setEstado({
          tipo: "invalido",
          titulo: modo === "validar" ? "El archivo no es válido" : "El archivo no es válido: no se cargó nada",
          errores: r.errores ?? [],
          total: r.totalErrores ?? 0,
        });
      } else if (!respuesta.ok || !r.ok) {
        setEstado({ tipo: "error", titulo: "No se pudo completar la operación", mensaje: r.mensaje ?? `Código ${respuesta.status}.` });
      } else if (modo === "validar") {
        setEstado({ tipo: "valido", filas: r.filas, periodos: r.periodos ?? [], advertencias: r.advertencias ?? [] });
      } else {
        // Carga correcta: se abre el resumen del período más reciente del archivo.
        const periodo = r.periodos.at(-1);
        const anterior = r.resumen?.anterior;
        const consulta = new URLSearchParams({ periodo, cargado: "1", archivo: r.archivo, segundos: (r.duracion_ms / 1000).toFixed(1) });
        if (anterior) consulta.set("anterior", anterior);
        if (r.reemplazado) consulta.set("reemplazado", "1");
        setEstado({ tipo: "cargado", periodos: r.periodos });
        router.push(`/admin/resumen?${consulta}`);
        router.refresh();
      }
    } catch (error) {
      setEstado({ tipo: "error", titulo: "No se pudo conectar con el servidor", mensaje: "Revise que la aplicación siga en ejecución e intente de nuevo.", detalle: String(error?.message ?? error) });
    }
  }

  const procesando = estado.tipo === "procesando";

  return (
    <form
      className="tarjeta flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar(evento.nativeEvent.submitter?.value === "validar" ? "validar" : "cargar");
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="min-w-0 flex-1">
        <label className="etiqueta-campo" htmlFor="archivo-corte">
          Archivo AT03 (CSV)
        </label>
        <input
          id="archivo-corte"
          type="file"
          accept=".csv,text/csv"
          className="control"
          disabled={procesando}
          onChange={(evento) => {
            setArchivo(evento.target.files?.[0] ?? null);
            setEstado({ tipo: "inicial" });
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <button type="submit" value="cargar" className="boton" disabled={procesando || !archivo}>
          Validar, cargar y recalcular
        </button>
        <button type="submit" value="validar" className="boton boton-secundario" disabled={procesando || !archivo}>
          Solo validar
        </button>
      </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={reemplazar}
          disabled={procesando}
          onChange={(evento) => setReemplazar(evento.target.checked)}
        />
        <span>Reemplazar el período si ya está cargado</span>
      </label>

      {posibleRepetido && !reemplazar && (
        <p className="text-sm text-texto-suave">
          Aviso: el nombre del archivo sugiere {formatearFecha(posibleRepetido)}, que ya está cargado. Si quiere
          sustituirlo, marque «Reemplazar».
        </p>
      )}

      <div aria-live="polite">
        {procesando && (
          <p className="rounded-tarjeta border border-borde bg-superficie-alt px-4 py-3 text-sm">
            <span className="font-semibold">Procesando «{archivo?.name}»…</span>{" "}
            {estado.modo === "validar" ? "Validando el archivo." : "Puede tardar unos segundos."}
          </p>
        )}

        {estado.tipo === "cargado" && (
          <p className="rounded-tarjeta border border-exito-borde bg-exito-fondo px-4 py-3 text-sm">
            <span className="font-semibold">Corte cargado.</span> Abriendo el resumen de {estado.periodos.map((p) => formatearFecha(p)).join(", ")}…
          </p>
        )}

        {estado.tipo === "valido" && (
          <div className="rounded-tarjeta border border-exito-borde bg-exito-fondo px-4 py-3 text-sm">
            <p className="font-semibold">
              Archivo válido: {formatearEntero(estado.filas)} filas del período{" "}
              {estado.periodos.map((p) => `${formatearFecha(p)} (${p})`).join(", ")}.
            </p>
            <p className="mt-1">Todavía no se guardó nada. Pulse «Validar, cargar y recalcular» para cargarlo.</p>
            {estado.advertencias.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {estado.advertencias.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </div>
        )}

        {estado.tipo === "invalido" && (
          <MensajeError
            titulo={estado.titulo}
            mensaje={
              <>
                <p>Los datos que ya estaban cargados no se modificaron. Corrija el archivo y vuelva a intentarlo.</p>
                <ListaErrores errores={estado.errores} total={estado.total} />
              </>
            }
          />
        )}

        {estado.tipo === "conflicto" && (
          <MensajeError titulo="Ese período ya está cargado" mensaje={estado.mensaje}>
            <button type="button" className="boton" onClick={() => enviar("cargar", true)}>
              Reemplazar el período con este archivo
            </button>
          </MensajeError>
        )}

        {estado.tipo === "error" && (
          <MensajeError
            titulo={estado.titulo}
            mensaje={estado.mensaje}
            detalle={estado.detalle}
            accion={estado.enlacePerfil ? { href: "/perfil", texto: "Cambiar de perfil" } : undefined}
          />
        )}
      </div>
    </form>
  );
}
