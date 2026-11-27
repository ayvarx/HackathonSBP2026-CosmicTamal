// Selector de perfil (/perfil) — tres tarjetas con lo que puede hacer cada perfil y la matriz
// de permisos completa. No pide contraseña: el reto acepta un selector de perfil
// (entregable 8). La restricción real se aplica en el servidor (lib/auth.js).
import EncabezadoPagina from "@/components/EncabezadoPagina";
import MensajeError from "@/components/MensajeError";
import {
  alcanzaPerfil,
  DESCRIPCION_PERFIL,
  NOMBRE_PERFIL,
  obtenerPerfil,
  PERFILES,
  permisosDe,
  PERMISOS,
  rutaInternaSegura,
} from "@/lib/auth";
import { cambiarPerfil } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil" };

export default async function PaginaPerfil({ searchParams }) {
  const perfilActual = await obtenerPerfil();
  const { volver, error } = await searchParams;
  const destino = rutaInternaSegura(typeof volver === "string" ? volver : "", "/");

  return (
    <>
      <EncabezadoPagina
        titulo="Elegir perfil"
        descripcion="Seleccione con qué perfil desea usar la plataforma. Cada perfil incluye todo lo del anterior y suma opciones propias."
      />

      {error && (
        <div className="mb-6">
          <MensajeError titulo="Perfil no reconocido" mensaje="Elija uno de los tres perfiles disponibles." />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PERFILES.map((perfil) => {
          const esActual = perfil === perfilActual;
          const permisos = permisosDe(perfil);
          return (
            <section
              key={perfil}
              aria-labelledby={`perfil-${perfil}`}
              className={`tarjeta flex flex-col gap-3 ${esActual ? "border-2 border-primario" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`perfil-${perfil}`}>{NOMBRE_PERFIL[perfil]}</h2>
                {esActual && <span className="etiqueta">Perfil actual</span>}
              </div>
              <p className="text-sm text-texto-suave">{DESCRIPCION_PERFIL[perfil]}</p>
              <ul className="flex-1 space-y-1 text-sm">
                {permisos.map((p) => (
                  <li key={p.clave} className="flex gap-2">
                    <span aria-hidden="true" className="text-primario">
                      ✓
                    </span>
                    <span className={p.propio ? "font-semibold" : undefined}>{p.descripcion}</span>
                  </li>
                ))}
              </ul>
              <form action={cambiarPerfil}>
                <input type="hidden" name="perfil" value={perfil} />
                <input type="hidden" name="volver" value={destino} />
                <button type="submit" className={esActual ? "boton boton-secundario w-full justify-center" : "boton w-full justify-center"}>
                  {esActual ? `Seguir como ${NOMBRE_PERFIL[perfil]}` : `Usar perfil ${NOMBRE_PERFIL[perfil]}`}
                </button>
              </form>
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-texto-tenue">En negrita, las opciones propias de cada perfil; el resto se hereda del perfil anterior.</p>

      <section className="mt-10" aria-labelledby="titulo-matriz">
        <h2 id="titulo-matriz" className="mb-1">
          Matriz de permisos
        </h2>
        <p className="mb-3 text-sm text-texto-suave">
          Se verifica en el servidor en cada página, acción y descarga: ocultar un enlace no es la única protección.
        </p>
        <div className="marco-tabla">
          <table className="tabla-datos">
            <caption className="solo-lector">Permisos por perfil</caption>
            <thead>
              <tr>
                <th scope="col">Opción</th>
                {PERFILES.map((perfil) => (
                  <th key={perfil} scope="col" className="centro">
                    {NOMBRE_PERFIL[perfil]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISOS).map(([clave, regla]) => (
                <tr key={clave}>
                  <th scope="row" className="font-normal text-left">
                    {regla.descripcion}
                  </th>
                  {PERFILES.map((perfil) => (
                    <td key={perfil} className="centro">
                      {alcanzaPerfil(perfil, regla.minimo) ? "Sí" : <span className="text-texto-tenue">No</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
