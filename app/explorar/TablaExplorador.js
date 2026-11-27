"use client";
// Tabla tipo hoja de cálculo del Explorador: filtros por columna (menú con embudo), búsqueda
// global, orden por encabezado (Mayús = orden secundario), columnas visibles, totales exactos
// y descarga de lo filtrado. El filtrado y orden vienen de lib/explorador.js (los mismos que
// usa la ruta de descarga). El estado se refleja en la URL (?datos=&f=).
import { useEffect, useMemo, useRef, useState } from "react";
import BotonDescarga from "@/components/BotonDescarga";
import {
  aplicarExplorador,
  codificarEstado,
  columnasVisibles,
  CONJUNTOS_EXPLORADOR,
  ESTADO_VACIO,
  hayFiltros,
  limpiarNumero,
  mostrarValor,
  normalizar,
  OPERADORES_NUMERO,
  OPERADORES_TEXTO,
  sumarExacto,
  TIPOS_NUMERICOS,
  valorTexto,
} from "@/lib/explorador";
import { formatearEntero, formatearFecha, formatearMonto, nombreRanking } from "@/lib/formato";

// Encabezados legibles en pantalla; el archivo exportado conserva los nombres originales.
const ETIQUETAS = {
  Posicion: "Posición", Codigo_Banco: "Código de banco", Saldo_Actividad: "Saldo de la actividad",
  Total_Cartera_Local_Valida: "Cartera local válida", Ponderacion_Pct: "Ponderación %", Operaciones_Validas: "Operaciones válidas",
  Fecha_Anterior: "Período anterior", Fecha_Actual: "Período actual", Posicion_Anterior: "Posición anterior",
  Posicion_Actual: "Posición actual", Cambio_Posicion: "Cambio de posición", Saldo_Anterior: "Saldo anterior",
  Saldo_Actual: "Saldo actual", Var_Saldo: "Variación de saldo", Var_Saldo_Pct: "Variación %",
  Cambio_De_Lider: "Cambio de líder", Fila_Archivo: "Fila del archivo", Numero_Prestamo: "Número de préstamo",
  Tipo_Actividad: "Tipo de actividad",
};
const etiqueta = (c) => ETIQUETAS[c.encabezado] ?? c.encabezado;

const LOTE = 300; // filas que se pintan de una vez
const MAX_DISTINTOS = 200; // con más valores distintos no se ofrece la lista de casillas

function etiquetaValor(valor, tipo) {
  if (valor === "") return "(vacío)";
  if (tipo === "periodo") return `${formatearFecha(valor)} (${valor})`;
  return mostrarValor(valor, tipo);
}

function describirFiltro(c, f) {
  const partes = [];
  if (f.v) partes.push(f.v.length <= 3 ? f.v.map((v) => etiquetaValor(v, c.tipo)).join(", ") : `${f.v.length} valores`);
  if (f.t) partes.push(`${OPERADORES_TEXTO[f.op]} «${f.t}»`);
  if (f.n === "entre") partes.push(`entre ${f.a ?? "…"} y ${f.b ?? "…"}`);
  else if (f.n) partes.push(`${OPERADORES_NUMERO[f.n]} ${f.a}`);
  return `${etiqueta(c)}: ${partes.join(" · ")}`;
}

export default function TablaExplorador({ conjunto, filas, estadoInicial }) {
  const definicion = CONJUNTOS_EXPLORADOR[conjunto];
  const [estado, setEstado] = useState(estadoInicial ?? ESTADO_VACIO);
  const [limite, setLimite] = useState(LOTE);
  const [menu, setMenu] = useState(null); // { campo, top, left } | { campo: "__columnas", ... }
  const marcoRef = useRef(null);

  const visibles = useMemo(() => columnasVisibles(conjunto, estado), [conjunto, estado]);
  const resultado = useMemo(() => aplicarExplorador(filas, conjunto, estado), [filas, conjunto, estado]);
  const f = codificarEstado(estado);

  // Refleja el estado en la URL sin recargar (enlace para compartir).
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("datos", conjunto);
    if (f) url.searchParams.set("f", f);
    else url.searchParams.delete("f");
    window.history.replaceState(null, "", url);
  }, [conjunto, f]);

  const actualizar = (cambio) => {
    setEstado((e) => ({ ...e, ...cambio(e) }));
    setLimite(LOTE);
  };

  const fijarFiltro = (campo, filtro) =>
    actualizar((e) => {
      const x = { ...e.x };
      const limpio = Object.fromEntries(Object.entries(filtro || {}).filter(([, v]) => v !== undefined && v !== ""));
      if (limpio.t === undefined) delete limpio.op;
      if (limpio.n && !limpio.a && !limpio.b) delete limpio.n;
      if (!limpio.n) { delete limpio.a; delete limpio.b; }
      if (Object.keys(limpio).length) x[campo] = limpio;
      else delete x[campo];
      return { x };
    });

  const ordenar = (campo, dir, agregar) =>
    actualizar((e) => {
      const actual = e.o.find((p) => p[0] === campo);
      const nuevaDir = dir ?? (actual?.[1] === "a" ? "d" : actual?.[1] === "d" ? null : "a");
      const resto = agregar ? e.o.filter((p) => p[0] !== campo) : [];
      return { o: nuevaDir ? [...resto, [campo, nuevaDir]] : resto };
    });

  const abrirMenu = (campo, boton) => {
    if (menu?.campo === campo) return setMenu(null);
    const r = boton.getBoundingClientRect();
    const ancho = 288;
    setMenu({ campo, boton, top: r.bottom + 4, left: Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) });
  };

  const totales = useMemo(() => {
    const t = {};
    for (const c of visibles) if (c.sumable) t[c.campo] = sumarExacto(resultado.map((r) => r[c.campo]));
    return t;
  }, [visibles, resultado]);

  const fichas = Object.entries(estado.x).map(([campo, filtro]) => ({
    campo,
    texto: describirFiltro(definicion.columnas.find((c) => c.campo === campo), filtro),
  }));
  const conFiltros = hayFiltros(estado);
  const nombreOrden = (campo) => {
    const i = estado.o.findIndex((p) => p[0] === campo);
    return i === -1 ? null : { dir: estado.o[i][1], n: estado.o.length > 1 ? i + 1 : null };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="etiqueta-campo">Buscar en todas las columnas</span>
          <input
            type="search"
            className="control"
            value={estado.q}
            onChange={(e) => {
              const q = e.target.value;
              actualizar(() => ({ q }));
            }}
            placeholder="Banco, código, ranking, monto…"
          />
        </label>
        <button
          type="button"
          className="boton boton-secundario"
          aria-haspopup="true"
          aria-expanded={menu?.campo === "__columnas"}
          onClick={(e) => abrirMenu("__columnas", e.currentTarget)}
        >
          Columnas ({visibles.length}/{definicion.columnas.length}) <span aria-hidden="true" className="text-xs">▾</span>
        </button>
        <button
          type="button"
          className="boton boton-secundario"
          disabled={!conFiltros && estado.o.length === 0}
          onClick={() => actualizar(() => ({ q: "", x: {}, o: [] }))}
        >
          Limpiar filtros
        </button>
        <BotonDescarga
          href="/api/exportar/explorador"
          parametros={{ datos: conjunto, f }}
          texto={conFiltros ? "Descargar lo filtrado" : "Descargar"}
          variante="primario"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="font-semibold text-texto">
          {formatearEntero(resultado.length)} de {formatearEntero(filas.length)} filas
        </span>
        {estado.q && (
          <Ficha texto={`Búsqueda: «${estado.q}»`} onQuitar={() => actualizar(() => ({ q: "" }))} />
        )}
        {fichas.map((x) => (
          <Ficha key={x.campo} texto={x.texto} onQuitar={() => fijarFiltro(x.campo, null)} />
        ))}
        {estado.o.length > 0 && (
          <span className="text-texto-tenue">
            Orden:{" "}
            {estado.o
              .map(([campo, dir]) => `${etiqueta(definicion.columnas.find((c) => c.campo === campo))} ${dir === "a" ? "↑" : "↓"}`)
              .join(", ")}
          </span>
        )}
      </div>

      <div ref={marcoRef} className="max-h-[70vh] overflow-auto rounded-md border border-borde-fuerte bg-superficie" tabIndex={0} aria-label="Tabla de datos con desplazamiento">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-30 border-r border-b border-borde-fuerte bg-[#e3f1e1] px-2 py-1.5 text-right text-xs font-semibold text-texto-tenue">
                #
              </th>
              {visibles.map((c) => {
                const orden = nombreOrden(c.campo);
                const filtrada = Boolean(estado.x[c.campo]);
                const numerica = TIPOS_NUMERICOS.has(c.tipo);
                return (
                  <th
                    key={c.campo}
                    scope="col"
                    aria-sort={orden && estado.o.length === 1 ? (orden.dir === "a" ? "ascending" : "descending") : undefined}
                    className={`sticky top-0 z-20 border-r border-b border-borde-fuerte px-1 py-1 align-bottom font-semibold whitespace-nowrap ${filtrada ? "bg-[#cfe8cb]" : "bg-[#e3f1e1]"}`}
                  >
                    <div className={`flex items-center gap-1 ${numerica ? "justify-end" : ""}`}>
                      <button
                        type="button"
                        className="rounded px-1 py-0.5 text-left text-texto hover:text-primario-oscuro hover:underline"
                        title="Ordenar (Mayús + clic: orden secundario)"
                        onClick={(e) => ordenar(c.campo, undefined, e.shiftKey)}
                      >
                        {etiqueta(c)}
                        {orden && (
                          <span className="ml-1 text-primario" aria-hidden="true">
                            {orden.dir === "a" ? "▲" : "▼"}
                            {orden.n && <sup>{orden.n}</sup>}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Filtrar ${etiqueta(c)}`}
                        aria-haspopup="dialog"
                        aria-expanded={menu?.campo === c.campo}
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded border ${filtrada ? "border-primario bg-primario text-white" : "border-borde-fuerte bg-white text-texto-suave hover:border-primario hover:text-primario"}`}
                        onClick={(e) => abrirMenu(c.campo, e.currentTarget)}
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="currentColor">
                          <path d="M1.5 2h13l-5 6.2V13l-3 1.5V8.2z" />
                        </svg>
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {resultado.slice(0, limite).map((fila, i) => (
              <tr key={i} className={i % 2 ? "bg-[#f6fbf5]" : "bg-white"}>
                <td className={`sticky left-0 z-10 border-r border-b border-borde px-2 py-1 text-right text-xs text-texto-tenue tabular-nums ${i % 2 ? "bg-[#eef7ec]" : "bg-[#f4faf3]"}`}>
                  {i + 1}
                </td>
                {visibles.map((c) => {
                  const numerica = TIPOS_NUMERICOS.has(c.tipo);
                  const v = valorTexto(fila[c.campo]);
                  return (
                    <td
                      key={c.campo}
                      title={c.tipo === "periodo" ? v : undefined}
                      className={`border-r border-b border-borde px-2 py-1 whitespace-nowrap ${numerica ? "text-right tabular-nums" : ""} ${c.campo === "motivo" ? "max-w-md truncate" : ""}`}
                    >
                      {c.campo === "ranking" ? nombreRanking(v) : mostrarValor(v, c.tipo)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {resultado.length === 0 && (
              <tr>
                <td colSpan={visibles.length + 1} className="px-4 py-8 text-center text-texto-suave">
                  Ninguna fila cumple los filtros.{" "}
                  <button type="button" className="font-semibold text-primario underline" onClick={() => actualizar(() => ({ q: "", x: {} }))}>
                    Quitar filtros
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {resultado.length > 0 && Object.keys(totales).length > 0 && (
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 border-t-2 border-r border-primario bg-primario-suave px-2 py-1.5 text-xs font-bold text-primario-oscuro">
                  Σ
                </td>
                {visibles.map((c, idx) => (
                  <td
                    key={c.campo}
                    className={`sticky bottom-0 z-20 border-t-2 border-r border-primario bg-primario-suave px-2 py-1.5 font-semibold whitespace-nowrap text-primario-oscuro ${c.sumable ? "text-right tabular-nums" : ""}`}
                  >
                    {c.sumable
                      ? c.tipo === "monto"
                        ? formatearMonto(totales[c.campo])
                        : formatearEntero(totales[c.campo])
                      : idx === 0
                        ? "Total"
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {resultado.length > limite && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
          Se muestran {formatearEntero(limite)} de {formatearEntero(resultado.length)} filas (los totales y la descarga incluyen todas).
          <button type="button" className="boton boton-secundario" onClick={() => setLimite((l) => l + LOTE * 3)}>
            Mostrar más
          </button>
          <button type="button" className="boton boton-secundario" onClick={() => setLimite(resultado.length)}>
            Mostrar todas
          </button>
        </div>
      )}

      {menu && (
        <MenuFlotante menu={menu} onCerrar={() => setMenu(null)}>
          {menu.campo === "__columnas" ? (
            <MenuColumnas
              columnas={definicion.columnas}
              ocultas={estado.h}
              onCambiar={(h) => actualizar(() => ({ h }))}
            />
          ) : (
            <MenuFiltro
              key={menu.campo}
              columna={definicion.columnas.find((c) => c.campo === menu.campo)}
              filas={filas}
              filtro={estado.x[menu.campo] || {}}
              orden={nombreOrden(menu.campo)?.dir}
              onFiltro={(fl) => fijarFiltro(menu.campo, fl)}
              onOrden={(dir) => ordenar(menu.campo, dir, false)}
            />
          )}
        </MenuFlotante>
      )}
    </div>
  );
}

function Ficha({ texto, onQuitar }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#9fcf98] bg-primario-suave py-0.5 pr-1 pl-3 text-xs font-medium text-primario-oscuro">
      <span className="truncate">{texto}</span>
      <button type="button" onClick={onQuitar} aria-label={`Quitar filtro ${texto}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[#cfe8cb]">
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

function MenuFlotante({ menu, onCerrar, children }) {
  const ref = useRef(null);
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });
  useEffect(() => {
    const boton = menu.boton;
    const alPulsar = (e) => {
      if (e.key === "Escape") {
        cerrarRef.current();
        boton?.focus();
      }
    };
    const alClic = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !boton?.contains(e.target)) cerrarRef.current();
    };
    document.addEventListener("keydown", alPulsar);
    document.addEventListener("mousedown", alClic);
    ref.current?.querySelector("input, select, button")?.focus();
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.removeEventListener("mousedown", alClic);
    };
  }, [menu]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Opciones de columna"
      style={{ top: Math.min(menu.top, window.innerHeight - 120), left: menu.left }}
      className="fixed z-50 flex max-h-[70vh] w-72 flex-col gap-3 overflow-auto rounded-md border border-borde-fuerte bg-superficie p-3 text-sm shadow-xl"
    >
      {children}
    </div>
  );
}

function MenuColumnas({ columnas, ocultas, onCambiar }) {
  const set = new Set(ocultas);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-semibold">Columnas visibles</legend>
      {columnas.map((c) => (
        <label key={c.campo} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-primario-suave">
          <input
            type="checkbox"
            className="accent-[#106003]"
            checked={!set.has(c.campo)}
            disabled={!set.has(c.campo) && columnas.length - set.size <= 1}
            onChange={(e) => onCambiar(e.target.checked ? ocultas.filter((h) => h !== c.campo) : [...ocultas, c.campo])}
          />
          {etiqueta(c)}
        </label>
      ))}
      <button type="button" className="mt-1 self-start text-xs font-semibold text-primario underline" onClick={() => onCambiar([])}>
        Mostrar todas
      </button>
    </fieldset>
  );
}

function MenuFiltro({ columna, filas, filtro, orden, onFiltro, onOrden }) {
  const numerica = TIPOS_NUMERICOS.has(columna.tipo);
  const [busqueda, setBusqueda] = useState("");
  const [modo, setModo] = useState(filtro.n || "ge");
  const distintos = useMemo(() => {
    if (numerica) return null;
    const s = new Set(filas.map((r) => valorTexto(r[columna.campo])));
    if (s.size > MAX_DISTINTOS) return null;
    return [...s].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [filas, columna, numerica]);
  const conTexto = !numerica && columna.tipo !== "periodo" && columna.tipo !== "sino";

  const elegidos = new Set(filtro.v ?? distintos ?? []);
  const listados = distintos?.filter((v) => normalizar(etiquetaValor(v, columna.tipo)).includes(normalizar(busqueda))) ?? [];
  const todosListadosElegidos = listados.every((v) => elegidos.has(v));
  const fijarValores = (nuevos) => {
    const lista = distintos.filter((v) => nuevos.has(v));
    onFiltro({ ...filtro, v: lista.length === distintos.length ? undefined : lista });
  };
  const id = `filtro-${columna.campo}`;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{etiqueta(columna)}</span>
        <div className="flex gap-1">
          <button type="button" aria-pressed={orden === "a"} className={`rounded border px-2 py-0.5 text-xs ${orden === "a" ? "border-primario bg-primario text-white" : "border-borde-fuerte"}`} onClick={() => onOrden(orden === "a" ? null : "a")}>
            {numerica ? "0→9" : "A→Z"}
          </button>
          <button type="button" aria-pressed={orden === "d"} className={`rounded border px-2 py-0.5 text-xs ${orden === "d" ? "border-primario bg-primario text-white" : "border-borde-fuerte"}`} onClick={() => onOrden(orden === "d" ? null : "d")}>
            {numerica ? "9→0" : "Z→A"}
          </button>
        </div>
      </div>

      {conTexto && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-op`} className="text-xs font-semibold text-texto-suave">Condición de texto</label>
          <div className="flex gap-1">
            <select id={`${id}-op`} className="control w-32 px-1 py-1 text-xs" value={filtro.op || "c"} onChange={(e) => onFiltro({ ...filtro, op: e.target.value })}>
              {Object.entries(OPERADORES_TEXTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input aria-label="Texto a buscar" className="control min-w-0 flex-1 px-2 py-1 text-xs" value={filtro.t || ""} onChange={(e) => onFiltro({ ...filtro, t: e.target.value, op: filtro.op || "c" })} />
          </div>
        </div>
      )}

      {numerica && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-n`} className="text-xs font-semibold text-texto-suave">Condición numérica</label>
          <select id={`${id}-n`} className="control px-1 py-1 text-xs" value={modo} onChange={(e) => { setModo(e.target.value); onFiltro({ ...filtro, n: e.target.value, b: e.target.value === "entre" ? filtro.b : undefined }); }}>
            {Object.entries(OPERADORES_NUMERO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <CampoNumero etiqueta={modo === "entre" ? "Mínimo" : "Valor"} valor={filtro.a} onCambio={(a) => onFiltro({ ...filtro, n: modo, a })} />
            {modo === "entre" && (
              <>
                <span aria-hidden="true">–</span>
                <CampoNumero etiqueta="Máximo" valor={filtro.b} onCambio={(b) => onFiltro({ ...filtro, n: modo, b })} />
              </>
            )}
          </div>
        </div>
      )}

      {distintos && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-texto-suave">Valores</span>
          {distintos.length > 8 && (
            <input type="search" aria-label="Buscar valores" placeholder="Buscar…" className="control px-2 py-1 text-xs" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          )}
          <div className="max-h-56 overflow-auto rounded border border-borde p-1">
            <label className="flex items-center gap-2 rounded px-1 py-0.5 font-semibold hover:bg-primario-suave">
              <input
                type="checkbox"
                className="accent-[#106003]"
                checked={listados.length > 0 && todosListadosElegidos}
                onChange={() => {
                  const s = new Set(elegidos);
                  listados.forEach((v) => (todosListadosElegidos ? s.delete(v) : s.add(v)));
                  fijarValores(s);
                }}
              />
              (Seleccionar todo)
            </label>
            {listados.map((v) => (
              <label key={v} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-primario-suave">
                <input
                  type="checkbox"
                  className="accent-[#106003]"
                  checked={elegidos.has(v)}
                  onChange={() => {
                    const s = new Set(elegidos);
                    if (s.has(v)) s.delete(v);
                    else s.add(v);
                    fijarValores(s);
                  }}
                />
                <span className="truncate">{etiquetaValor(v, columna.tipo)}</span>
              </label>
            ))}
            {listados.length === 0 && <p className="px-1 py-1 text-xs text-texto-tenue">Sin coincidencias.</p>}
          </div>
        </div>
      )}

      <button type="button" className="boton boton-secundario self-start" disabled={Object.keys(filtro).length === 0} onClick={() => onFiltro(null)}>
        Quitar filtro de esta columna
      </button>
    </>
  );
}

function CampoNumero({ etiqueta, valor, onCambio }) {
  const [texto, setTexto] = useState(valor ?? "");
  return (
    <input
      aria-label={etiqueta}
      placeholder={etiqueta}
      inputMode="decimal"
      className="control min-w-0 flex-1 px-2 py-1 text-right text-xs tabular-nums"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onCambio(limpiarNumero(e.target.value) || undefined);
      }}
    />
  );
}
