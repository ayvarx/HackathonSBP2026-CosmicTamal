"use client";
// Pantalla de error común: si una página falla (p. ej. la base de datos no responde),
// el usuario ve un mensaje claro en español y puede reintentar sin perder la cabecera.
import { useEffect } from "react";
import MensajeError from "@/components/MensajeError";

export default function ErrorDePagina({ error, retry: reintentar }) {
  useEffect(() => {
    // Queda en la consola del navegador para diagnóstico; al usuario no se le muestra la traza.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4">No se pudo mostrar esta pantalla</h1>
      <MensajeError
        titulo="Ocurrió un error al preparar la información"
        mensaje="Puede reintentar. Si el problema continúa, verifique que la base de datos esté disponible y que haya cortes cargados."
        detalle={error?.digest ? `Referencia del error: ${error.digest}` : undefined}
        accion={{ href: "/", texto: "Ir al Panel" }}
      >
        {/* retry() vuelve a pedir los datos al servidor y redibuja la sección */}
        <button type="button" className="boton" onClick={() => reintentar()}>
          Reintentar
        </button>
      </MensajeError>
    </div>
  );
}
