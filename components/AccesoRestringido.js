// AccesoRestringido — Pantalla que explica por qué no se puede entrar a una sección y cómo
// cambiar de perfil. La muestra /acceso-restringido, adonde redirige exigirPerfil().
// Componente de servidor.
//
// Props:
//   perfilActual (string)  Perfil del visitante.
//   requiere     (string)  Perfil mínimo de la sección.
//   desde        (string)  opcional  Ruta a la que intentó entrar (p. ej. "/admin").
import Link from "next/link";
import { alcanzaPerfil, NOMBRE_PERFIL, rutaDe } from "@/lib/auth";

export default function AccesoRestringido({ perfilActual, requiere, desde }) {
  const seccion = desde ? rutaDe(desde) : null;
  const nombreSeccion = seccion ? `«${seccion.etiqueta}»` : "Esta sección";
  const yaAlcanza = alcanzaPerfil(perfilActual, requiere);
  const volver = desde || "/";

  return (
    <section className="tarjeta mx-auto max-w-2xl px-6 py-8" aria-labelledby="titulo-acceso">
      <h1 id="titulo-acceso">Acceso restringido</h1>
      <p className="mt-3">
        {nombreSeccion} está disponible para el perfil <strong>{NOMBRE_PERFIL[requiere]}</strong>
        {requiere !== "administrador" && " o superior"}. Su perfil actual es{" "}
        <strong>{NOMBRE_PERFIL[perfilActual]}</strong>.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {yaAlcanza ? (
          <Link href={volver} className="boton">
            Continuar a {seccion?.etiqueta ?? "la sección"}
          </Link>
        ) : (
          <Link href="/login" className="boton">
            Cambiar de perfil
          </Link>
        )}
        <Link href="/" className="boton boton-secundario">
          Ir al Panel
        </Link>
      </div>
    </section>
  );
}
