"use client";
// Botón que abre el diálogo de impresión del navegador (también permite "Guardar como PDF").
export default function BotonImprimir() {
  return (
    <button type="button" className="boton" onClick={() => window.print()}>
      Imprimir o guardar como PDF
    </button>
  );
}
