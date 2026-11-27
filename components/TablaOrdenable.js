"use client";
// TablaOrdenable — Tabla de datos que se ordena al hacer clic en el encabezado.
// Las cifras se alinean a la derecha con números tabulares y los montos se ordenan
// comparando el TEXTO decimal exacto (compararDecimales), nunca con punto flotante.
//
// Uso desde una página de servidor (todas las props son datos serializables):
//   <TablaOrdenable
//     titulo="Ranking CONSTRUCCION · septiembre de 2026"
//     columnas={[
//       { clave: "Posicion", titulo: "Posición", tipo: "entero" },
//       { clave: "Banco", titulo: "Banco", enlace: "/rankings?banco={Codigo_Banco}" },
//       { clave: "Saldo_Actividad", titulo: "Saldo", tipo: "monto" },
//       { clave: "Ponderacion_Pct", titulo: "Ponderación", tipo: "porcentaje", decimales: 4 },
//       { clave: "Cambio_Posicion", titulo: "Movimiento", tipo: "movimiento" },
//     ]}
//     filas={filas}
//     claveFila="Codigo_Banco"
//     ordenInicial={{ clave: "Posicion", direccion: "asc" }}
//     filaResaltada="105"
//     filaTotal={{ Banco: "Total", Saldo_Actividad: "123456.78" }} />
//
// Props:
//   columnas     Lista de { clave, titulo, tipo?, decimales?, alinear?, ordenable?, enlace?, ayuda?, formato? }
//     tipo: "texto" (predeterminado) | "codigo" | "entero" | "monto" | "monto_signo" | "porcentaje"
//           | "movimiento" (Cambio_Posicion con flecha) | "fecha" (AAAAMMDD) | "ranking" | "subactividad"
//     decimales: para "porcentaje" (predeterminado 4).
//     alinear: "izquierda" | "derecha" | "centro" (por defecto, derecha para cifras).
//     ordenable: false para desactivar el orden en esa columna.
//     enlace: plantilla de URL con {campo}, p. ej. "/rankings?banco={Codigo_Banco}".
//     ayuda: texto corto que se muestra al pasar el mouse sobre el encabezado (title).
//     formato: función (valor, fila) => nodo. SOLO si la tabla se usa desde otro componente
//              cliente (las funciones no pueden viajar desde el servidor).
//   filas        Lista de objetos (los montos como texto decimal, tal como vienen de SQL).
//   claveFila    Campo que identifica cada fila (p. ej. "Codigo_Banco"); si falta se usa el índice.
//   ordenInicial { clave, direccion: "asc" | "desc" } opcional.
//   filaResaltada Valor (o lista de valores) de claveFila a resaltar, p. ej. el banco elegido.
//   filaTotal    Objeto opcional que se muestra fijo al pie (no se ordena), p. ej. totales.
//   titulo       Texto del <caption> (describe la tabla para lectores de pantalla).
//   mensajeVacio Texto si no hay filas. Predeterminado: "No hay datos para los filtros seleccionados."
//   compacta     (bool) Menos relleno por celda.
//   altoMaximo   (string CSS) opcional, p. ej. "28rem": SOLO si se pasa, la tabla se desplaza con
//                encabezado fijo; sin él se ven todas las filas.
import { useMemo, useState } from "react";
import Link from "next/link";
import IndicadorMovimiento from "./IndicadorMovimiento";
import {
  compararDecimales,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  formatearPorcentaje,
  nombreRanking,
  nombreSubactividad,
  SIN_DATO,
} from "@/lib/formato";

// Tipos que se ordenan como número exacto y se alinean a la derecha.
const TIPOS_NUMERICOS = new Set(["entero", "monto", "monto_signo", "porcentaje", "movimiento"]);

function esVacio(valor) {
  return valor === null || valor === undefined || valor === "" || valor === "NA";
}

/** Texto o elemento que se muestra en la celda según el tipo de columna. */
function contenidoCelda(columna, fila) {
  const valor = fila[columna.clave];
  if (typeof columna.formato === "function") return columna.formato(valor, fila);
  if (esVacio(valor)) return columna.tipo === "movimiento" ? <IndicadorMovimiento valor={null} /> : SIN_DATO;
  switch (columna.tipo) {
    case "entero":
      return formatearEntero(valor);
    case "monto":
      return formatearMonto(valor);
    case "monto_signo":
      return formatearMonto(valor, { signo: true });
    case "porcentaje":
      return formatearPorcentaje(valor, columna.decimales ?? 4);
    case "movimiento":
      return <IndicadorMovimiento valor={valor} compacto />;
    case "fecha":
      return formatearFecha(valor);
    case "ranking":
      return nombreRanking(valor);
    case "subactividad":
      return nombreSubactividad(valor);
    default:
      return String(valor);
  }
}

/** Reemplaza {campo} en la plantilla de enlace con los valores de la fila. */
function armarEnlace(plantilla, fila) {
  return plantilla.replace(/\{(\w+)\}/g, (_, campo) => encodeURIComponent(fila[campo] ?? ""));
}

function claseAlineacion(columna, esEncabezado = false) {
  const alinear = columna.alinear ?? (TIPOS_NUMERICOS.has(columna.tipo) ? "derecha" : "izquierda");
  const clases = [];
  if (alinear === "derecha") clases.push("num");
  if (alinear === "centro") clases.push("centro");
  if (columna.tipo === "codigo" && !esEncabezado) clases.push("codigo");
  // Nombres de banco y similares en una sola línea (no se parten en dos o tres renglones).
  if (!TIPOS_NUMERICOS.has(columna.tipo) && /banco|nombre|entidad/i.test(`${columna.clave} ${columna.titulo ?? ""}`)) clases.push("sin-corte");
  return clases.join(" ");
}

/** Comparador según el tipo: exacto para cifras, alfabético en español para textos. */
function comparar(columna, va, vb) {
  if (TIPOS_NUMERICOS.has(columna.tipo)) return compararDecimales(va, vb);
  return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
}

export default function TablaOrdenable({
  columnas = [],
  filas = [],
  claveFila,
  ordenInicial = null,
  filaResaltada,
  filaTotal,
  titulo,
  mensajeVacio = "No hay datos para los filtros seleccionados.",
  compacta = false,
  altoMaximo,
}) {
  const [orden, setOrden] = useState(ordenInicial);

  const filasOrdenadas = useMemo(() => {
    const columna = orden && columnas.find((c) => c.clave === orden.clave);
    if (!columna) return filas;
    const signo = orden.direccion === "desc" ? -1 : 1;
    return [...filas].sort((a, b) => {
      const va = a[columna.clave];
      const vb = b[columna.clave];
      // Las celdas vacías van siempre al final, sin importar la dirección.
      if (esVacio(va) || esVacio(vb)) return Number(esVacio(va)) - Number(esVacio(vb));
      return comparar(columna, va, vb) * signo;
    });
  }, [filas, columnas, orden]);

  const resaltadas = new Set((Array.isArray(filaResaltada) ? filaResaltada : [filaResaltada]).filter((v) => v != null).map(String));

  function alternarOrden(columna) {
    setOrden((actual) => {
      if (actual?.clave === columna.clave) {
        return { clave: columna.clave, direccion: actual.direccion === "asc" ? "desc" : "asc" };
      }
      // Las cifras empiezan de mayor a menor (lo habitual al ver saldos); los textos de A a Z.
      return { clave: columna.clave, direccion: TIPOS_NUMERICOS.has(columna.tipo) ? "desc" : "asc" };
    });
  }

  return (
    <div
      className="marco-tabla"
      style={altoMaximo ? { maxHeight: altoMaximo, overflowY: "auto" } : undefined}
      role="region"
      aria-label={titulo ?? "Tabla de datos"}
      tabIndex={0}
    >
      <table className={`tabla-datos ${compacta ? "tabla-compacta" : ""}`}>
        {titulo && <caption>{titulo}</caption>}
        <thead>
          <tr>
            {columnas.map((columna) => {
              const activa = orden?.clave === columna.clave;
              const ariaSort = activa ? (orden.direccion === "asc" ? "ascending" : "descending") : "none";
              const ordenable = columna.ordenable !== false;
              return (
                <th
                  key={columna.clave}
                  scope="col"
                  className={claseAlineacion(columna, true)}
                  aria-sort={ordenable ? ariaSort : undefined}
                  title={columna.ayuda}
                >
                  {ordenable ? (
                    <button type="button" className="boton-orden" onClick={() => alternarOrden(columna)}>
                      {columna.titulo}
                      <span className="flecha-orden" aria-hidden="true">
                        {activa ? (orden.direccion === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                      <span className="solo-lector">
                        {activa
                          ? `, ordenado ${orden.direccion === "asc" ? "de menor a mayor" : "de mayor a menor"}`
                          : ", ordenar"}
                      </span>
                    </button>
                  ) : (
                    columna.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filasOrdenadas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length || 1} className="py-6 text-center text-texto-suave">
                {mensajeVacio}
              </td>
            </tr>
          ) : (
            filasOrdenadas.map((fila, indice) => {
              const clave = claveFila ? String(fila[claveFila]) : String(indice);
              const resaltada = claveFila && resaltadas.has(clave);
              return (
                <tr key={clave} className={resaltada ? "fila-resaltada" : undefined}>
                  {columnas.map((columna) => {
                    const contenido = contenidoCelda(columna, fila);
                    return (
                      <td key={columna.clave} className={claseAlineacion(columna)}>
                        {columna.enlace && !esVacio(fila[columna.clave]) ? (
                          <Link href={armarEnlace(columna.enlace, fila)}>{contenido}</Link>
                        ) : (
                          contenido
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
        {filaTotal && filasOrdenadas.length > 0 && (
          <tfoot>
            <tr>
              {columnas.map((columna) => (
                <td key={columna.clave} className={claseAlineacion(columna)}>
                  {esVacio(filaTotal[columna.clave]) ? "" : contenidoCelda({ ...columna, formato: undefined }, filaTotal)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
