// Administración (/admin) — Cargar un corte y ver los cortes cargados (solo Administrador).
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
      <EncabezadoPagina titulo="Administración de cortes" />

      <section aria-labelledby="titulo-carga" className="mb-8">
        <h2 id="titulo-carga" className="mb-3">Cargar o actualizar un corte</h2>
        <FormularioCarga periodosCargados={cortes.map((c) => c.fecha)} />
      </section>

      <section aria-labelledby="titulo-cortes">
        <h2 id="titulo-cortes" className="mb-3">Cortes cargados ({cortes.length})</h2>
        {cortes.length === 0 ? (
          <EstadoVacio titulo="Aún no hay cortes cargados">
            Cargue el primer archivo con el formulario de arriba.
          </EstadoVacio>
        ) : (
          <div className="marco-tabla" role="region" aria-label="Cortes cargados" tabIndex={0}>
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Archivo</th>
                  <th scope="col" className="num">Filas leídas</th>
                  <th scope="col" className="num">Préstamos válidos</th>
                  <th scope="col" className="num">Saldo válido</th>
                  <th scope="col" className="whitespace-nowrap">Cargado</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Huella</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => (
                  <tr key={c.fecha}>
                    <td className="whitespace-nowrap font-semibold">{formatearFecha(c.fecha)}</td>
                    <td className="codigo whitespace-nowrap">{c.archivo ?? "—"}</td>
                    <td className="num">{formatearEntero(c.filas_leidas)}</td>
                    <td className="num">{formatearEntero(c.universo_local_valido)}</td>
                    <td className="num">{formatearMonto(c.saldo_universo_local_valido)}</td>
                    <td className="whitespace-nowrap">{formatearFechaHora(c.cargado_en)}</td>
                    <td className="whitespace-nowrap">{c.perfil ?? "—"}</td>
                    <td className="codigo whitespace-nowrap">{c.huella ?? "—"}</td>
                    <td>
                      <div className="flex flex-nowrap items-start justify-end gap-2">
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
