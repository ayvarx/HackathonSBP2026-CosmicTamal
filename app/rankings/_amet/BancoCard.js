"use client";
// Portado del frontend de Amet: components/BancoCard.jsx
// Tarjeta de composición de un banco, dinámica:
// - las columnas muestran el saldo en cada corte cargado (cifra exacta al pasar el cursor);
// - al tocar una subactividad se resalta y se ve su peso;
// - la tarjeta se puede plegar para ver solo el resumen.
// Cambios frente a Amet: las cifras llegan como texto exacto y se formatean con lib/formato.js
// (Number solo para el alto/ancho de las barras); al pulsar la tarjeta se escribe ?banco= en la
// URL (abre BancoDetalle en el servidor) y la descarga usa las rutas /api/exportar/*.
//
// Props: posicion, banco, saldo (texto), serie [{ periodo, etiqueta, valor (texto) }],
//   partes [{ nombre, valor (texto), color }], seleccionada, hrefSeleccion, descargas [{ texto, href, descripcion }].
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aNumeroParaGrafico, formatearMonto, formatearMontoCompacto, formatearPorcentaje } from "@/lib/formato";
import { porcentajeDe, restarMontos } from "./numeros";

const millones = (texto) => formatearMontoCompacto(texto).replace(" millones", " M");
const peso = (parte, total) => {
  const p = porcentajeDe(parte, total, 1);
  return p === null ? "0.0 %" : formatearPorcentaje(p, 1);
};

export default function BancoCard({ posicion, banco, saldo, serie, partes, seleccionada, hrefSeleccion, descargas = [] }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [abierta, setAbierta] = useState(true);
  const [mes, setMes] = useState(null);
  const [parte, setParte] = useState(null);
  const pulsada = useRef(false);

  // Tras elegir esta tarjeta, se lleva la vista al detalle del banco (se dibuja sobre la cuadrícula).
  useEffect(() => {
    if (seleccionada && pulsada.current) {
      pulsada.current = false;
      document.getElementById("detalle-banco")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [seleccionada]);

  const onSelect = () => {
    pulsada.current = !seleccionada;
    iniciarTransicion(() => router.replace(hrefSeleccion, { scroll: false }));
  };

  const total = saldo; // Reconciliación 1: la suma de las subactividades es igual al saldo de la actividad.
  const max = Math.max(1, ...serie.map((s) => aNumeroParaGrafico(s.valor) ?? 0));
  const primero = serie[0]?.valor ?? "0";
  const ultimo = serie.at(-1)?.valor ?? "0";
  const variacion = serie.length > 1 ? porcentajeDe(restarMontos(ultimo, primero), primero, 1) : null;
  const sube = variacion !== null && !variacion.startsWith("-");
  const parteActiva = parte !== null ? partes[parte] : null;
  const anchoDe = (valor) => {
    const t = aNumeroParaGrafico(total) || 0;
    return t ? ((aNumeroParaGrafico(valor) ?? 0) / t) * 100 : 0;
  };

  return (
    <article
      className={`banco-card ${abierta ? "" : "plegada"} ${seleccionada ? "seleccionada" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={Boolean(seleccionada)}
      aria-busy={pendiente}
    >
      <button
        type="button"
        className="bc-cabecera"
        onClick={(e) => {
          e.stopPropagation();
          setAbierta((v) => !v);
        }}
        aria-expanded={abierta}
      >
        <span>
          <span className="bc-puesto">Puesto {posicion}</span>
          <strong className="bc-nombre">{banco}</strong>
        </span>
        <span className="bc-toggle" aria-hidden="true">{abierta ? "−" : "+"}</span>
      </button>

      <div className="bc-cifra cifra">{formatearMonto(total)}</div>
      <p className="bc-sub">{pendiente ? "Abriendo el detalle…" : "Saldo total del banco en esta actividad"}</p>

      {abierta && (
        <>
          {serie.length > 1 && (
            <div className="bc-meses">
              <div
                className="bc-columnas"
                style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}
                onMouseLeave={() => setMes(null)}
              >
                {serie.map((s, i) => (
                  <div
                    key={s.periodo}
                    className={`bc-col ${i === serie.length - 1 ? "ultimo" : ""} ${mes === i ? "activa" : ""}`}
                    onMouseEnter={() => setMes(i)}
                    onFocus={() => setMes(i)}
                    onBlur={() => setMes(null)}
                    tabIndex={0}
                  >
                    <span className="bc-col-valor">{millones(s.valor)}</span>
                    <div
                      className="bc-col-barra"
                      style={{ height: `${Math.max(6, ((aNumeroParaGrafico(s.valor) ?? 0) / max) * 64)}px`, animationDelay: `${i * 120}ms` }}
                    />
                    <span className="bc-col-fecha">{s.etiqueta}</span>
                    {mes === i && <span className="bc-tip">{s.etiqueta}: {formatearMonto(s.valor)}</span>}
                  </div>
                ))}
              </div>
              {variacion !== null && (
                <span className={`bc-variacion ${sube ? "sube" : "baja"}`}>
                  {sube ? "▲" : "▼"} {formatearPorcentaje(variacion.replace("-", ""), 1)} desde {serie[0].etiqueta}
                </span>
              )}
            </div>
          )}

          <div className="bc-partes-barra" role="img" aria-label={`Reparto de ${banco} por subactividad`}>
            {partes.map((p, i) => (
              <div
                key={p.nombre}
                className={parte === null || parte === i ? "" : "atenuada"}
                style={{ width: `${anchoDe(p.valor)}%`, background: p.color }}
                onMouseEnter={() => setParte(i)}
                onMouseLeave={() => setParte(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setParte(parte === i ? null : i);
                }}
                title={`${p.nombre}: ${formatearMonto(p.valor)}`}
              />
            ))}
          </div>
          <ul className="bc-partes">
            {partes.map((p, i) => (
              <li
                key={p.nombre}
                className={parte === i ? "activa" : parte === null ? "" : "atenuada"}
                onMouseEnter={() => setParte(i)}
                onMouseLeave={() => setParte(null)}
              >
                <i style={{ background: p.color }} />
                <span>{p.nombre}</span>
                <b>{formatearMonto(p.valor)}</b>
                <em>{peso(p.valor, total)}</em>
              </li>
            ))}
          </ul>
          {parteActiva && (
            <p className="bc-detalle">
              {parteActiva.nombre}: {formatearMonto(parteActiva.valor)} ({peso(parteActiva.valor, total)} del saldo del banco)
            </p>
          )}
        </>
      )}
      {descargas.length > 0 && (
        <div className="bc-acciones">
          {descargas.map((d) => (
            <a
              key={d.href}
              className="bc-descargar"
              href={d.href}
              download
              title={d.descripcion}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {d.texto}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
