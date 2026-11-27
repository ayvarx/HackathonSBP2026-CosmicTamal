// MensajeError — Aviso claro cuando algo falla (archivo inválido, base no disponible, etc.).
// Se anuncia a lectores de pantalla (role="alert"). Funciona en servidor y cliente.
//
// Uso:
//   <MensajeError titulo="El archivo no tiene 61 columnas"
//                 mensaje="Revise que sea un AT03 en CSV separado por comas."
//                 detalle={error.message}
//                 accion={{ href: "/admin", texto: "Volver a intentar" }} />
//
// Props:
//   titulo   (string)  Qué pasó, en lenguaje simple. Predeterminado: "No se pudo completar la operación".
//   mensaje  (string|nodo) Qué puede hacer el usuario.
//   detalle  (string)  opcional  Texto técnico; queda plegado en "Detalle técnico".
//   accion   ({ href, texto }) opcional  Enlace para continuar.
//   children (nodo)    opcional  Botones extra (p. ej. "Reintentar" en un componente cliente).
import Link from "next/link";

export default function MensajeError({
  titulo = "No se pudo completar la operación",
  mensaje,
  detalle,
  accion,
  children,
}) {
  return (
    <div
      role="alert"
      className="rounded-tarjeta border border-error-borde bg-error-fondo px-5 py-4 text-error-texto"
    >
      <p className="flex items-start gap-2 font-semibold">
        <span aria-hidden="true" className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs leading-none">
          !
        </span>
        <span>{titulo}</span>
      </p>
      {mensaje && <div className="mt-1 pl-7 text-sm text-texto">{mensaje}</div>}
      {detalle && (
        <details className="mt-2 pl-7 text-sm">
          <summary className="cursor-pointer">Detalle técnico</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-texto-suave">{detalle}</pre>
        </details>
      )}
      {(accion?.href || children) && (
        <div className="mt-3 flex flex-wrap gap-2 pl-7">
          {accion?.href && (
            <Link href={accion.href} className="boton boton-secundario">
              {accion.texto}
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
