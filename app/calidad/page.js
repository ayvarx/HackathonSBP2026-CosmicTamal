// Calidad de datos (/calidad) — reporte E1→E4 por período, conteos independientes, alertas y filas excluidas.
// Pública: cualquier perfil puede consultarla. Datos de lib/consultas.js.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import Filtros from "@/components/Filtros";
import Paginacion from "@/components/Paginacion";
import TablaOrdenable from "@/components/TablaOrdenable";
import BotonDescarga from "@/components/BotonDescarga";
import CalidadPage from "./_amet/CalidadPage";
import { exigirPerfil } from "@/lib/auth";
import { alertas, calidad, catalogos, exclusiones, FILTROS, periodos } from "@/lib/consultas";
import { elegirPeriodo } from "@/lib/consultas-calidad";
import { formatearEntero, formatearFecha, nombreBanco } from "@/lib/formato";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Calidad de datos" };

const POR_PAGINA = 50;

const TIPOS_ALERTA = {
  BANCO_NO_CATALOGADO: "Banco no catalogado",
  FACILIDAD_NO_CATALOGADA: "Facilidad no catalogada",
  TARJETA_SIN_FACILIDAD_07: "Tarjeta sin facilidad 07",
  AUTOMOVIL_SIN_FACILIDAD_03: "Automóvil sin facilidad 03",
};

// Quita la tarjeta envolvente de Filtros para que los selectores queden en la fila del título.
// Tablas sin saltos de línea en fechas ni cifras, con celdas más estrechas.
const SIN_CORTE = "w-full [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2";
const SIN_TARJETA = "[&_.tarjeta]:m-0 [&_.tarjeta]:border-0 [&_.tarjeta]:bg-transparent [&_.tarjeta]:p-0 [&_.tarjeta]:shadow-none [&_select]:min-w-[13rem]";

export default async function PaginaCalidad({ searchParams }) {
  await exigirPerfil("publico");
  const sp = await searchParams;
  const un = (v) => (Array.isArray(v) ? v[0] : v) || "";

  let datos;
  try {
    const lista = await periodos();
    const fecha = elegirPeriodo(lista, un(sp.periodo));
    if (!fecha) datos = { vacio: true };
    else {
      const filtro = FILTROS.some((f) => f.clave === un(sp.filtro)) ? un(sp.filtro) : "";
      const banco = un(sp.banco);
      const busqueda = un(sp.busqueda).trim().slice(0, 40);
      const pagina = Math.max(1, Number.parseInt(un(sp.pagina), 10) || 1);
      const [todas, al, ex, cat] = await Promise.all([
        calidad(),
        alertas(fecha),
        exclusiones({ fecha, filtro: filtro || undefined, banco: banco || undefined, busqueda: busqueda || undefined, pagina, tamano: POR_PAGINA }),
        catalogos(),
      ]);
      datos = { lista, fecha, filtro, banco, busqueda, pagina, todas, al, ex, bancos: cat.bancos };
    }
  } catch (e) {
    return (
      <>
        <EncabezadoPagina titulo="Calidad de datos" />
        <MensajeError titulo="No se pudo leer la calidad de datos" mensaje="La base de datos no respondió. Revise que esté disponible y vuelva a intentarlo." detalle={String(e?.message ?? e)} />
      </>
    );
  }

  if (datos.vacio) {
    return (
      <>
        <EncabezadoPagina titulo="Calidad de datos" />
        <EstadoVacio titulo="Todavía no hay cortes cargados" accion={{ href: "/admin", texto: "Cargar un corte (administrador)" }}>
          Carga un corte para ver su calidad de datos.
        </EstadoVacio>
      </>
    );
  }

  const { lista, fecha, filtro, banco, busqueda, pagina, todas, al, ex, bancos } = datos;
  const q = todas.find((x) => x.fecha === fecha);
  // Clave única por fila (una misma fila del archivo puede aparecer con varios motivos).
  const conClave = (filas) => filas.map((f, i) => ({ ...f, clave: `${f.archivo}-${f.fila_archivo}-${f.filtro}-${i}` }));
  const totalPaginas = Math.max(1, Math.ceil(ex.total / POR_PAGINA));
  const resumenAlertas = al.resumen
    .filter((r) => Number(r.cantidad) > 0)
    .map((r) => ({ tipo: r.tipo, texto: TIPOS_ALERTA[r.tipo] ?? r.tipo, cantidad: Number(r.cantidad) }));
  const totalAlertas = resumenAlertas.reduce((s, r) => s + r.cantidad, 0);

  const campoPeriodo = [
    { nombre: "periodo", etiqueta: "Período", predeterminado: fecha, opciones: lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) })) },
  ];
  const camposExcluidas = [
    { nombre: "filtro", etiqueta: "Motivo", textoTodos: "Todos (E1 a E4)", opciones: FILTROS.map((f) => ({ valor: f.clave, texto: `${f.clave} · ${f.nombre}` })) },
    { nombre: "banco", etiqueta: "Banco", textoTodos: "Todos los bancos", opciones: bancos.map((b) => ({ valor: b.codigo_banco, texto: nombreBanco(b.codigo_banco, b.nombre_ficticio) })) },
  ];

  return (
    <>
      <EncabezadoPagina titulo="Calidad de datos">
        <div className={SIN_TARJETA}>
          <Filtros campos={campoPeriodo} reiniciar={["pagina"]} conLimpiar={false} />
        </div>
        <BotonDescarga href="/api/exportar/calidad" texto="Reporte de calidad" />
      </EncabezadoPagina>

      <section aria-label="Resumen de calidad">
        <CalidadPage q={q} totalAlertas={totalAlertas} />
      </section>

      <section className="mt-8" aria-labelledby="t-periodos">
        <h2 id="t-periodos" className="mb-3">Reporte de calidad por período</h2>
        <div className={SIN_CORTE}>
        <TablaOrdenable
          claveFila="fecha"
          compacta
          filaResaltada={fecha}
          ordenInicial={{ clave: "fecha", direccion: "asc" }}
          filas={todas}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "filas_leidas", titulo: "Leídas", tipo: "entero" },
            { clave: "e1_duplicados", titulo: "E1", tipo: "entero" },
            { clave: "e2_destino_extranjero", titulo: "E2", tipo: "entero" },
            { clave: "e3_saldo_no_positivo", titulo: "E3", tipo: "entero" },
            { clave: "e4_actividad_no_catalogada", titulo: "E4", tipo: "entero" },
            { clave: "universo_local_valido", titulo: "Universo", tipo: "entero" },
            { clave: "saldo_universo_local_valido", titulo: "Saldo", tipo: "monto" },
            { clave: "cuadre_cascada", titulo: "Cuadra", tipo: "texto", alinear: "centro" },
          ]}
        />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="t-indep">
        <h2 id="t-indep" className="mb-3">Conteos independientes</h2>
        <div className={SIN_CORTE}>
        <TablaOrdenable
          claveFila="fecha"
          compacta
          filaResaltada={fecha}
          filas={todas}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "indep_duplicados", titulo: "Duplicados", tipo: "entero" },
            { clave: "indep_destino_extranjero", titulo: "Extranjero", tipo: "entero" },
            { clave: "indep_saldo_no_positivo", titulo: "Saldo ≤ 0", tipo: "entero" },
            { clave: "indep_actividad_no_catalogada", titulo: "No catalogada", tipo: "entero" },
          ]}
        />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="t-alertas">
        <h2 id="t-alertas" className="mb-3">Alertas de integridad y coherencia</h2>
        {totalAlertas === 0 ? (
          <p className="text-texto-suave">Sin alertas de integridad ni de coherencia en este período.</p>
        ) : (
          <TablaOrdenable
            claveFila="tipo"
            compacta
            filas={resumenAlertas}
            columnas={[
              { clave: "texto", titulo: "Tipo", tipo: "texto", alinear: "izquierda" },
              { clave: "cantidad", titulo: "Cantidad", tipo: "entero" },
            ]}
          />
        )}
      </section>

      <section className="mt-8" aria-labelledby="t-excluidas">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <h2 id="t-excluidas" className="m-0">Filas excluidas</h2>
            <div className={SIN_TARJETA}>
              <Filtros campos={camposExcluidas} reiniciar={["pagina"]} conLimpiar={false} />
            </div>
            <form method="get" className="flex flex-wrap items-end gap-2">
              {periodoOculto(fecha, filtro, banco)}
              <div>
                <label htmlFor="busqueda" className="etiqueta-campo">Número de préstamo</label>
                <input id="busqueda" name="busqueda" defaultValue={busqueda} maxLength={40} className="control" placeholder="Parte del número" />
              </div>
              <button type="submit" className="boton boton-secundario">Buscar</button>
            </form>
          </div>
          <BotonDescarga href="/api/exportar/exclusiones" parametros={{ fecha }} texto="Filas excluidas" />
        </div>
        <TablaOrdenable
          titulo={`${formatearEntero(ex.total)} ${ex.total === 1 ? "fila excluida" : "filas excluidas"}`}
          claveFila="clave"
          compacta
          filas={conClave(ex.filas)}
          mensajeVacio="Ninguna fila excluida coincide con los filtros."
          columnas={[
            { clave: "archivo", titulo: "Archivo", tipo: "texto", alinear: "izquierda" },
            { clave: "fila_archivo", titulo: "Fila", tipo: "entero" },
            { clave: "numero_prestamo", titulo: "Préstamo", tipo: "codigo" },
            { clave: "filtro", titulo: "Filtro", tipo: "codigo", alinear: "centro" },
            { clave: "motivo", titulo: "Motivo", tipo: "texto", alinear: "izquierda" },
            { clave: "codigo_banco", titulo: "Banco", tipo: "codigo" },
            { clave: "destino", titulo: "Destino", tipo: "codigo", alinear: "centro" },
            { clave: "saldo", titulo: "Saldo", tipo: "monto_signo" },
            { clave: "tipo_actividad", titulo: "Tipo actividad", tipo: "codigo" },
          ]}
        />
        <Paginacion paginaActual={pagina} totalPaginas={totalPaginas} totalFilas={ex.total} porPagina={POR_PAGINA} />
      </section>
    </>
  );
}

// Campos ocultos para que la búsqueda conserve el período y los demás filtros.
function periodoOculto(fecha, filtro, banco) {
  return (
    <>
      <input type="hidden" name="periodo" value={fecha} />
      {filtro && <input type="hidden" name="filtro" value={filtro} />}
      {banco && <input type="hidden" name="banco" value={banco} />}
    </>
  );
}
