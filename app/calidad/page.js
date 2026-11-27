// Calidad de datos (/calidad) — cascada E1→E4, universo local válido, alertas y filas excluidas.
// Pública: cualquier perfil puede consultarla. Todo viene de lib/consultas.js (motor SQL).
import EncabezadoPagina from "@/components/EncabezadoPagina";
import EstadoVacio from "@/components/EstadoVacio";
import MensajeError from "@/components/MensajeError";
import Filtros from "@/components/Filtros";
import Paginacion from "@/components/Paginacion";
import TablaOrdenable from "@/components/TablaOrdenable";
import BotonDescarga from "@/components/BotonDescarga";
import EmbudoCascada from "./EmbudoCascada";
import { exigirPerfil } from "@/lib/auth";
import { alertas, calidad, catalogos, exclusiones, FILTROS, periodos } from "@/lib/consultas";
import { elegirPeriodo } from "@/lib/consultas-calidad";
import { formatearEntero, formatearFecha, nombreBanco } from "@/lib/formato";

export const dynamic = "force-dynamic"; // los datos cambian al cargar cortes
export const metadata = { title: "Calidad de datos" };

const POR_PAGINA = 50;

const TIPOS_ALERTA = [
  { tipo: "BANCO_NO_CATALOGADO", texto: "Banco no catalogado", ayuda: "El Codigo_Banco no existe en Bancos_ficticios.csv (integridad referencial)." },
  { tipo: "FACILIDAD_NO_CATALOGADA", texto: "Facilidad no catalogada", ayuda: "La Facilidad_Crediticia no existe en la tabla SB21 (integridad referencial)." },
  { tipo: "TARJETA_SIN_FACILIDAD_07", texto: "Tarjeta sin facilidad 07", ayuda: "Coherencia SB21: un CINU de Tarjeta debería venir con facilidad 07." },
  { tipo: "AUTOMOVIL_SIN_FACILIDAD_03", texto: "Automóvil sin facilidad 03", ayuda: "Coherencia SB21: un CINU de Automóvil debería venir con facilidad 03." },
];

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
          El reporte de calidad aparece cuando se carga al menos un archivo AT03.
        </EstadoVacio>
      </>
    );
  }

  const { lista, fecha, filtro, banco, busqueda, pagina, todas, al, ex, bancos } = datos;
  const q = todas.find((x) => x.fecha === fecha);
  // Clave única por fila (una misma fila del archivo puede tener varias alertas).
  const conClave = (filas) => filas.map((f, i) => ({ ...f, clave: `${f.archivo}-${f.fila_archivo}-${f.tipo ?? f.filtro}-${i}` }));
  const totalPaginas = Math.max(1, Math.ceil(ex.total / POR_PAGINA));
  const cuentaAlertas = Object.fromEntries(al.resumen.map((r) => [r.tipo, r.cantidad]));
  const hayAlertas = al.resumen.some((r) => r.cantidad > 0);

  const campos = [
    { nombre: "periodo", etiqueta: "Período", predeterminado: fecha, opciones: lista.map((p) => ({ valor: p.fecha, texto: formatearFecha(p.fecha) })) },
    { nombre: "filtro", etiqueta: "Motivo de exclusión", textoTodos: "Todos (E1 a E4)", opciones: FILTROS.map((f) => ({ valor: f.clave, texto: `${f.clave} · ${f.nombre}` })) },
    { nombre: "banco", etiqueta: "Banco", textoTodos: "Todos los bancos", opciones: bancos.map((b) => ({ valor: b.codigo_banco, texto: nombreBanco(b.codigo_banco, b.nombre_ficticio) })) },
  ];

  return (
    <>
      <EncabezadoPagina
        titulo="Calidad de datos"
        descripcion={`Período: ${formatearFecha(fecha)}.`}
      >
        <div className="flex flex-row flex-wrap items-start gap-2">
        <BotonDescarga href="/api/exportar/calidad" texto="Reporte de calidad" descripcion="Todos los períodos cargados." />
        <BotonDescarga href="/api/exportar/exclusiones" parametros={{ fecha }} texto="Filas excluidas" descripcion={`Todas las excluidas de ${formatearFecha(fecha)}.`} />
        </div>
      </EncabezadoPagina>

      <Filtros campos={campos} reiniciar={["pagina"]} />

      <section className="mt-6" aria-labelledby="t-cascada">
        <h2 id="t-cascada">Cascada de exclusión E1 → E4</h2>
        <p className="mb-3 text-texto-suave">
          Cada fila se evalúa en orden y recibe solo el primer filtro que incumple, así ninguna se cuenta dos veces.
        </p>
        <EmbudoCascada q={q} />
      </section>

      <section className="mt-8" aria-labelledby="t-periodos">
        <h2 id="t-periodos">Todos los períodos</h2>
        <TablaOrdenable
          titulo="Reporte de calidad por período"
          claveFila="fecha"
          filaResaltada={fecha}
          ordenInicial={{ clave: "fecha", direccion: "asc" }}
          filas={todas}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "filas_leidas", titulo: "Filas leídas", tipo: "entero" },
            { clave: "e1_duplicados", titulo: "E1 Duplicados", tipo: "entero" },
            { clave: "e2_destino_extranjero", titulo: "E2 Extranjero", tipo: "entero" },
            { clave: "e3_saldo_no_positivo", titulo: "E3 Saldo ≤ 0", tipo: "entero" },
            { clave: "e4_actividad_no_catalogada", titulo: "E4 No catalogada", tipo: "entero" },
            { clave: "universo_local_valido", titulo: "Universo válido", tipo: "entero" },
            { clave: "saldo_universo_local_valido", titulo: "Saldo del universo", tipo: "monto" },
            { clave: "cuadre_cascada", titulo: "¿Cuadra?", tipo: "texto", alinear: "centro" },
          ]}
        />
      </section>

      <section className="mt-8" aria-labelledby="t-indep">
        <h2 id="t-indep">Conteos independientes</h2>
        <p className="mb-3 text-texto-suave">
          Cada filtro contado por separado sobre todas las filas leídas. Una misma fila puede
          incumplir varios filtros, por eso estas cifras no suman al total.
        </p>
        <TablaOrdenable
          titulo="Conteos independientes por filtro"
          claveFila="fecha"
          filaResaltada={fecha}
          filas={todas}
          columnas={[
            { clave: "fecha", titulo: "Período", tipo: "fecha", alinear: "izquierda" },
            { clave: "indep_duplicados", titulo: "Indep. duplicados", tipo: "entero" },
            { clave: "indep_destino_extranjero", titulo: "Indep. extranjero", tipo: "entero" },
            { clave: "indep_saldo_no_positivo", titulo: "Indep. saldo ≤ 0", tipo: "entero" },
            { clave: "indep_actividad_no_catalogada", titulo: "Indep. no catalogada", tipo: "entero" },
          ]}
        />
      </section>

      <section className="mt-8" aria-labelledby="t-alertas">
        <h2 id="t-alertas">Alertas de integridad y coherencia</h2>
        <p className="mb-3 text-texto-suave">
          Las alertas no excluyen filas. {hayAlertas ? "Hay alertas en este período." : "Este período no tiene alertas."}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TIPOS_ALERTA.map((t) => (
            <li key={t.tipo} className="tarjeta" title={t.ayuda}>
              <p className="text-sm text-texto-suave">{t.texto}</p>
              <p className="text-2xl font-semibold tabular-nums">{formatearEntero(cuentaAlertas[t.tipo] ?? 0)}</p>
              <p className="text-xs text-texto-suave">{(cuentaAlertas[t.tipo] ?? 0) === 0 ? "Sin alertas" : "Con alertas"} · {t.ayuda}</p>
            </li>
          ))}
        </ul>
        {hayAlertas && (
          <div className="mt-4">
            <TablaOrdenable
              titulo="Detalle de alertas (máximo 500 filas)"
              claveFila="clave"
              compacta
              altoMaximo="20rem"
              filas={conClave(al.filas)}
              columnas={[
                { clave: "tipo", titulo: "Tipo", tipo: "texto" },
                { clave: "archivo", titulo: "Archivo", tipo: "texto" },
                { clave: "fila_archivo", titulo: "Fila", tipo: "entero" },
                { clave: "numero_prestamo", titulo: "Préstamo", tipo: "codigo" },
                { clave: "codigo_banco", titulo: "Banco", tipo: "codigo" },
                { clave: "valor", titulo: "Valor", tipo: "codigo" },
                { clave: "detalle", titulo: "Detalle", tipo: "texto", alinear: "izquierda" },
              ]}
            />
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="t-excluidas">
        <h2 id="t-excluidas">Filas excluidas</h2>
        <p className="mb-3 text-texto-suave">
          {formatearEntero(ex.total)} {ex.total === 1 ? "fila" : "filas"} con los filtros elegidos. La columna Fila es la línea física del archivo (la 1 es el encabezado).
        </p>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          {periodoOculto(fecha, filtro, banco)}
          <div>
            <label htmlFor="busqueda" className="etiqueta-campo">Buscar número de préstamo</label>
            <input id="busqueda" name="busqueda" defaultValue={busqueda} maxLength={40} className="control" placeholder="Parte del número" />
          </div>
          <button type="submit" className="boton boton-secundario">Buscar</button>
        </form>
        <TablaOrdenable
          titulo={`Filas excluidas de ${formatearFecha(fecha)}`}
          claveFila="clave"
          compacta
          altoMaximo="32rem"
          filas={conClave(ex.filas)}
          mensajeVacio="Ninguna fila excluida coincide con los filtros."
          columnas={[
            { clave: "archivo", titulo: "Archivo", tipo: "texto", alinear: "izquierda" },
            { clave: "fila_archivo", titulo: "Fila", tipo: "entero", ayuda: "Línea física del archivo (encabezado = 1)" },
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
