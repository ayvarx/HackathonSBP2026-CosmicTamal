// Bitácora (/admin/bitacora) — Registro de operaciones: qué archivo se cargó, cuándo, con qué
// perfil y con qué resultado. También guarda los intentos rechazados (perfil sin permiso,
// archivos inválidos) y cada cambio de parámetro.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import Filtros from "@/components/Filtros";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil } from "@/lib/auth";
import { bitacoraAdmin, operacionesBitacora } from "@/lib/consultas-admin";
import { formatearFechaHora } from "@/lib/formato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bitácora" };

// Nombres legibles de las operaciones que registra la plataforma.
const NOMBRE_OPERACION = {
  carga_corte: "Carga de corte",
  reemplazo_corte: "Reemplazo de corte",
  validacion_corte: "Validación de corte",
  eliminar_corte: "Eliminación de corte",
  parametro: "Cambio de parámetro",
  carga_catalogo: "Carga de catálogo",
};

const LIMITE = 300;

export default async function PaginaBitacora({ searchParams }) {
  await exigirPerfil("administrador");
  const { operacion, resultado } = await searchParams;
  const operaciones = await operacionesBitacora();
  const filtroOperacion = operaciones.includes(operacion) ? operacion : undefined;
  const filtroResultado = ["ok", "error"].includes(resultado) ? resultado : undefined;
  const registros = await bitacoraAdmin({ operacion: filtroOperacion, resultado: filtroResultado, limite: LIMITE });

  // La hora se muestra en hora de Panamá; el número (N.º) permite ordenar cronológicamente.
  const filas = registros.map((r) => ({
    ...r,
    // Espacios no separables: la fecha y la hora no se parten en varias líneas.
    momento_texto: formatearFechaHora(r.momento).replace(/ /g, "\u00a0"),
    operacion_texto: NOMBRE_OPERACION[r.operacion] ?? r.operacion,
    resultado_texto: r.resultado === "ok" ? "Correcto" : "Error",
  }));

  return (
    <>
      <EncabezadoPagina titulo="Bitácora de operaciones" />
      <Filtros
        campos={[
          {
            nombre: "operacion",
            etiqueta: "Operación",
            textoTodos: "Todas las operaciones",
            opciones: operaciones.map((o) => ({ valor: o, texto: NOMBRE_OPERACION[o] ?? o })),
          },
          {
            nombre: "resultado",
            etiqueta: "Resultado",
            textoTodos: "Todos",
            opciones: [
              { valor: "ok", texto: "Correcto" },
              { valor: "error", texto: "Error" },
            ],
          },
        ]}
      />
      <TablaOrdenable
        titulo={`${filas.length} registro(s)`}
        columnas={[
          { clave: "id", titulo: "N.º", tipo: "entero" },
          { clave: "momento_texto", titulo: "Fecha y hora", ordenable: false },
          { clave: "perfil", titulo: "Perfil" },
          { clave: "operacion_texto", titulo: "Operación" },
          { clave: "resultado_texto", titulo: "Resultado" },
          { clave: "detalle", titulo: "Detalle", ordenable: false },
          { clave: "duracion_ms", titulo: "Duración (ms)", tipo: "entero" },
        ]}
        filas={filas}
        claveFila="id"
        ordenInicial={{ clave: "id", direccion: "desc" }}
        mensajeVacio="No hay operaciones registradas con estos filtros."
        compacta
      />
    </>
  );
}
