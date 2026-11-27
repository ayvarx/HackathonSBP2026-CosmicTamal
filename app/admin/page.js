// Administración (/admin) — Cargar un corte AT03 y ver el estado de los cortes cargados.
// Solo Administrador: se exige en el servidor antes de leer cualquier dato.
// La carga real la hace la ruta /api/admin/cortes (que vuelve a comprobar el perfil).
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import { exigirPerfil } from "@/lib/auth";
import { cortesCargados } from "@/lib/consultas-admin";
import { formatearEntero, formatearFecha, formatearFechaHora, formatearMonto } from "@/lib/formato";
import FormularioCarga from "./FormularioCarga";
import BotonEliminarCorte from "./BotonEliminarCorte";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Administración" };

export default async function PaginaAdmin() {
  // Cargar cortes y cambiar parámetros es exclusivo del Administrador (entregable 8).
  await exigirPerfil("administrador");
  const cortes = await cortesCargados();

  return (
    <>
      <EncabezadoPagina
        titulo="Administración de cortes AT03"
        descripcion="Cargue un nuevo corte mensual: se valida, se guarda, los rankings se recalculan solos y se muestra qué cambió frente al período anterior. Sin editar código."
      />

      <section aria-labelledby="titulo-carga" className="mb-8">
        <h2 id="titulo-carga" className="mb-3">Cargar o actualizar un corte</h2>
        <FormularioCarga periodosCargados={cortes.map((c) => c.fecha)} />
      </section>

      <section aria-labelledby="titulo-cortes">
        <h2 id="titulo-cortes" className="mb-3">Cortes cargados</h2>
        {cortes.length === 0 ? (
          <EstadoVacio titulo="Aún no hay cortes cargados">
            Use el formulario de arriba para cargar el primer archivo AT03 (por ejemplo{" "}
            <code>AT03_sintetico_202607.csv</code>). También puede sembrar la base desde la terminal con{" "}
            <code>npm run db:seed</code>.
          </EstadoVacio>
        ) : (
          <div className="marco-tabla" role="region" aria-label="Cortes cargados" tabIndex={0}>
            <table className="tabla-datos">
              <caption>
                {cortes.length} período(s) cargado(s). Cada fila del archivo se asigna al período de su columna Fecha.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Archivo</th>
                  <th scope="col" className="num">Filas leídas</th>
                  <th scope="col" className="num">Universo local válido</th>
                  <th scope="col" className="num">Saldo del universo válido</th>
                  <th scope="col">Cargado (hora de Panamá)</th>
                  <th scope="col">Perfil</th>
                  <th scope="col" title="Primeros 12 caracteres del SHA-256 del archivo, para trazabilidad">Huella</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => (
                  <tr key={c.fecha}>
                    <td>
                      <span className="font-semibold">{formatearFecha(c.fecha)}</span>
                      <span className="codigo block text-xs text-texto-tenue">{c.fecha}</span>
                    </td>
                    <td className="codigo">{c.archivo ?? "—"}</td>
                    <td className="num">{formatearEntero(c.filas_leidas)}</td>
                    <td className="num">{formatearEntero(c.universo_local_valido)}</td>
                    <td className="num">{formatearMonto(c.saldo_universo_local_valido)}</td>
                    <td>{formatearFechaHora(c.cargado_en)}</td>
                    <td>{c.perfil ?? "—"}</td>
                    <td className="codigo">{c.huella ?? "—"}</td>
                    <td>
                      <div className="flex flex-wrap items-start gap-2">
                        <Link href={`/admin/resumen?periodo=${c.fecha}`} className="boton boton-secundario">
                          Qué cambió
                        </Link>
                        <BotonEliminarCorte fecha={c.fecha} etiqueta={formatearFecha(c.fecha)} filas={c.filas_leidas} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
