// Página 404 en español, con salida clara hacia el Panel.
import EstadoVacio from "@/components/EstadoVacio";

export const metadata = { title: "Página no encontrada" };

export default function NoEncontrada() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4">Página no encontrada</h1>
      <EstadoVacio titulo="La dirección no existe o cambió" accion={{ href: "/", texto: "Ir al Panel" }}>
        Revise la dirección o use el menú superior para elegir una sección.
      </EstadoVacio>
    </div>
  );
}
