// Explorador de datos (/explorar) — tabla tipo hoja de cálculo con filtros por columna,
// orden, columnas visibles y descarga de lo filtrado. Perfil Analista o superior.
// Estado en la URL: ?datos=rankings|subactividades|movimientos|exclusiones&f=<JSON> (ver lib/explorador.js).
import Link from "next/link";
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import { exigirPerfil } from "@/lib/auth";
import { FUENTE } from "@/lib/consultas";
import { CLAVES_CONJUNTO, CONJUNTOS_EXPLORADOR, conjuntoValido, leerEstado } from "@/lib/explorador";
import { cargarConjunto } from "./datos";
import TablaExplorador from "./TablaExplorador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explorador de datos" };

const ENCABEZADO = {
  titulo: "Explorador de datos",
  descripcion: "Filtre, ordene y descargue cualquier conjunto de datos como en una hoja de cálculo.",
};

export default async function PaginaExplorar({ searchParams }) {
  const perfil = await exigirPerfil("analista");
  const sp = await searchParams;
  const unico = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const conjunto = conjuntoValido(unico(sp?.datos));
  const estado = leerEstado(unico(sp?.f), conjunto);

  let datos;
  try {
    datos = await cargarConjunto(conjunto);
  } catch (e) {
    console.error("Error al cargar el explorador:", e);
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <MensajeError titulo="No se pudieron cargar los datos" mensaje="Intente de nuevo en unos segundos; si persiste, avise al administrador." />
      </>
    );
  }

  if (datos.fechas.length === 0) {
    return (
      <>
        <EncabezadoPagina {...ENCABEZADO} />
        <EstadoVacio
          titulo="Aún no hay cortes cargados"
          accion={perfil === "administrador" ? { href: "/admin", texto: "Ir a Administración para cargar un corte" } : undefined}
        >
          Cuando se cargue un corte AT03 podrá explorar aquí los rankings, subactividades, movimientos y filas excluidas.
        </EstadoVacio>
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina {...ENCABEZADO} />
      <nav aria-label="Conjunto de datos" className="mb-4 flex flex-wrap gap-1 border-b border-borde">
        {CLAVES_CONJUNTO.map((clave) => {
          const activo = clave === conjunto;
          return (
            <Link
              key={clave}
              href={`/explorar?datos=${clave}`}
              aria-current={activo ? "page" : undefined}
              className={`-mb-px rounded-t-md border px-4 py-2 text-sm font-semibold no-underline ${
                activo
                  ? "border-borde border-b-superficie bg-superficie text-primario"
                  : "border-transparent text-texto-suave hover:bg-primario-suave hover:text-primario-oscuro"
              }`}
            >
              {CONJUNTOS_EXPLORADOR[clave].etiqueta}
            </Link>
          );
        })}
      </nav>
      <TablaExplorador key={conjunto} conjunto={conjunto} filas={datos.filas} estadoInicial={estado} />
      <p className="mt-4 text-xs text-texto-tenue">{FUENTE}</p>
    </>
  );
}
