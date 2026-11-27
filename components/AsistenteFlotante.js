"use client";
// components/AsistenteFlotante.js — Bolita flotante que abre el chat del asistente de IA.
// El asistente responde con las cifras YA calculadas por el motor (ver app/api/asistente).
// El historial vive solo en memoria de este componente.
import { useEffect, useRef, useState } from "react";
import "./asistente.css";

const SUGERENCIAS = [
  { texto: "¿Quién lidera cada ranking?" },
  { texto: "¿Qué cambió entre agosto y septiembre?", soloAnalista: true },
  { texto: "¿Cuántas filas se excluyeron y por qué?" },
  { texto: "¿Qué banco tiene mayor ponderación en Consumo?" },
];

/** Icono de asistente: globo de diálogo con una chispa, dibujado en línea. */
function IconoAsistente({ tamano = 26 }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12.5c0 3.9-3.6 7-8 7-1.1 0-2.2-.2-3.1-.6L4.5 20l1.2-3.3C4.6 15.5 4 14 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      <path d="M12 8.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Markdown mínimo y seguro: todo se pinta con elementos React (texto escapado).
// ---------------------------------------------------------------------

/** Negritas (**x**) y código (`x`) dentro de una línea. */
function enLinea(texto, base) {
  const partes = String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${base}-${i}`}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={`${base}-${i}`} className="asis-codigo">{p.slice(1, -1)}</code>;
    return p;
  });
}

const celdas = (linea) => linea.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const esSeparadorTabla = (linea) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

function Markdown({ texto }) {
  const lineas = String(texto).replace(/\r/g, "").split("\n");
  const bloques = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    const k = `b${i}`;
    if (!linea.trim()) { i++; continue; }
    // Tabla: fila de encabezado + separador
    if (linea.includes("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const cab = celdas(linea);
      const filas = [];
      i += 2;
      while (i < lineas.length && lineas[i].includes("|") && lineas[i].trim()) { filas.push(celdas(lineas[i])); i++; }
      bloques.push(
        <div key={k} className="asis-tabla-envoltura">
          <table className="asis-tabla">
            <thead><tr>{cab.map((c, j) => <th key={j}>{enLinea(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{filas.map((f, r) => <tr key={r}>{f.map((c, j) => <td key={j}>{enLinea(c, `${k}${r}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Listas
    const vineta = /^\s*[-*•]\s+/;
    const numero = /^\s*\d+[.)]\s+/;
    if (vineta.test(linea) || numero.test(linea)) {
      const ordenada = numero.test(linea);
      const patron = ordenada ? numero : vineta;
      const items = [];
      while (i < lineas.length && patron.test(lineas[i])) { items.push(lineas[i].replace(patron, "")); i++; }
      const Lista = ordenada ? "ol" : "ul";
      bloques.push(<Lista key={k} className={ordenada ? "asis-ol" : "asis-ul"}>{items.map((t, j) => <li key={j}>{enLinea(t, `${k}${j}`)}</li>)}</Lista>);
      continue;
    }
    // Títulos → párrafo en negrita
    const titulo = linea.match(/^\s*#{1,6}\s+(.*)$/);
    if (titulo) { bloques.push(<p key={k} className="asis-titulo">{enLinea(titulo[1], k)}</p>); i++; continue; }
    // Párrafo: líneas seguidas con salto de línea
    const parrafo = [];
    while (i < lineas.length && lineas[i].trim() && !vineta.test(lineas[i]) && !numero.test(lineas[i]) && !/^\s*#/.test(lineas[i])
      && !(lineas[i].includes("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1]))) {
      parrafo.push(lineas[i]); i++;
    }
    bloques.push(<p key={k}>{parrafo.map((t, j) => <span key={j}>{j > 0 && <br />}{enLinea(t, `${k}${j}`)}</span>)}</p>);
  }
  return <>{bloques}</>;
}

// ---------------------------------------------------------------------

export default function AsistenteFlotante({ perfil = "publico" }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]); // [{rol, texto}]
  const [entrada, setEntrada] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [error, setError] = useState("");
  const controlRef = useRef(null);
  const listaRef = useRef(null);
  const entradaRef = useRef(null);
  const botonRef = useRef(null);

  const sugerencias = SUGERENCIAS.filter((s) => !s.soloAnalista || perfil === "analista" || perfil === "administrador");

  // Foco al abrir; al cerrar vuelve a la bolita.
  useEffect(() => {
    if (abierto) entradaRef.current?.focus();
  }, [abierto]);

  // Desplaza al final mientras llega el texto.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [mensajes, respondiendo]);

  // Al desmontar, corta cualquier respuesta en curso.
  useEffect(() => () => controlRef.current?.abort(), []);

  function cerrar() {
    setAbierto(false);
    requestAnimationFrame(() => botonRef.current?.focus());
  }

  function detener() {
    controlRef.current?.abort();
  }

  function nuevaConversacion() {
    detener();
    setMensajes([]);
    setError("");
    setEntrada("");
    entradaRef.current?.focus();
  }

  async function enviar(textoPregunta) {
    const texto = String(textoPregunta ?? entrada).trim();
    if (!texto || respondiendo) return;
    setError("");
    setEntrada("");
    const historial = [...mensajes, { rol: "usuario", texto }];
    setMensajes([...historial, { rol: "asistente", texto: "" }]);
    setRespondiendo(true);
    const control = new AbortController();
    controlRef.current = control;
    let acumulado = "";
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial.slice(-12) }),
        signal: control.signal,
      });
      if (!r.ok || !r.body) {
        let mensaje = "No se pudo obtener respuesta.";
        try {
          const datos = await r.json();
          mensaje = datos.error && datos.mensaje ? datos.mensaje : datos.error || datos.mensaje || mensaje;
        } catch { /* sin JSON */ }
        throw new Error(mensaje);
      }
      const lector = r.body.getReader();
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        const parcial = acumulado;
        setMensajes((prev) => [...prev.slice(0, -1), { rol: "asistente", texto: parcial }]);
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "Error de conexión.");
    } finally {
      // Si no llegó texto, se quita la burbuja vacía del asistente.
      if (!acumulado) setMensajes((prev) => (prev.at(-1)?.rol === "asistente" && !prev.at(-1).texto ? prev.slice(0, -1) : prev));
      setRespondiendo(false);
      controlRef.current = null;
    }
  }

  function alTeclear(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  function alTeclearPanel(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      cerrar();
    }
  }

  const ultimo = mensajes.at(-1);
  const escribiendo = respondiendo && (!ultimo || ultimo.rol !== "asistente" || !ultimo.texto);

  return (
    <>
      {!abierto && (
        <button ref={botonRef} type="button" className="asis-bolita" aria-label="Abrir asistente" title="Asistente" onClick={() => setAbierto(true)}>
          <IconoAsistente />
        </button>
      )}

      {abierto && (
        <section className="asis-panel" role="dialog" aria-modal="false" aria-labelledby="asis-titulo" onKeyDown={alTeclearPanel}>
          <header className="asis-cabecera">
            <span className="asis-cabecera-icono"><IconoAsistente tamano={20} /></span>
            <h2 id="asis-titulo" className="asis-cabecera-titulo">Asistente</h2>
            {mensajes.length > 0 && (
              <button type="button" className="asis-boton-texto" onClick={nuevaConversacion}>Nueva conversación</button>
            )}
            <button type="button" className="asis-cerrar" aria-label="Cerrar asistente" onClick={cerrar}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div ref={listaRef} className="asis-lista" aria-live="polite" aria-busy={respondiendo}>
            {mensajes.length === 0 && (
              <div className="asis-sugerencias">
                {sugerencias.map((s) => (
                  <button key={s.texto} type="button" className="asis-ficha" onClick={() => enviar(s.texto)}>{s.texto}</button>
                ))}
              </div>
            )}
            {mensajes.map((m, i) =>
              m.rol === "usuario" ? (
                <div key={i} className="asis-burbuja asis-usuario">{m.texto}</div>
              ) : m.texto ? (
                <div key={i} className="asis-burbuja asis-respuesta"><Markdown texto={m.texto} /></div>
              ) : null,
            )}
            {escribiendo && <div className="asis-escribiendo" role="status">escribiendo…</div>}
            {error && <div className="asis-error" role="alert">{error}</div>}
          </div>

          <form className="asis-formulario" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <textarea
              ref={entradaRef}
              className="asis-entrada"
              rows={1}
              maxLength={2000}
              placeholder="Pregunte sobre los datos…"
              aria-label="Pregunta para el asistente"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={alTeclear}
            />
            {respondiendo ? (
              <button type="button" className="asis-enviar asis-detener" onClick={detener}>Detener</button>
            ) : (
              <button type="submit" className="asis-enviar" disabled={!entrada.trim()}>Enviar</button>
            )}
          </form>
          <p className="asis-pie">Responde con las cifras calculadas por la plataforma.</p>
        </section>
      )}
    </>
  );
}
