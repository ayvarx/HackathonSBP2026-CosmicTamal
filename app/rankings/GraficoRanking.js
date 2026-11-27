"use client";
// GraficoRanking — Barras horizontales del ranking (un banco por barra, en orden de posición).
// Es un componente cliente porque responde al clic: al pulsar una barra se selecciona ese
// banco (se escribe ?banco= en la URL) y la página de servidor vuelve a consultar.
//
// Dinero: la barra usa un Number solo para su largo; el tooltip muestra el TEXTO exacto
// que viene del motor SQL, formateado con lib/formato.js.
//
// Props (todas serializables desde la página de servidor):
//   barras     [{ codigo, etiqueta, saldo (texto), posicion, ponderacion (texto) }] en orden de posición.
//   resaltado  Código del banco seleccionado (o "").
//   rutaBase   URL de la pantalla con los filtros actuales SIN banco, p. ej. "/rankings?periodo=...&ranking=...".
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Grafico, { COLORES_GRAFICO, COLOR_RESALTADO } from "@/components/Grafico";
import { aNumeroParaGrafico, formatearMonto, formatearPorcentaje } from "@/lib/formato";

export default function GraficoRanking({ barras, resaltado, rutaBase }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const opcion = {
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: barras.map((b) => `${b.posicion}. ${b.etiqueta}`) },
    tooltip: {
      trigger: "item",
      confine: true,
      // Se arma el texto con la cifra exacta (no con el Number de la barra).
      formatter: (p) =>
        `<strong>${p.data.etiqueta}</strong><br/>Posición ${p.data.posicion}<br/>` +
        `Saldo: ${formatearMonto(p.data.texto)}<br/>Ponderación: ${formatearPorcentaje(p.data.ponderacion)}`,
    },
    series: [
      {
        type: "bar",
        cursor: "pointer",
        data: barras.map((b) => ({
          value: aNumeroParaGrafico(b.saldo),
          texto: b.saldo,
          etiqueta: b.etiqueta,
          posicion: b.posicion,
          ponderacion: b.ponderacion,
          codigo: b.codigo,
          // El banco elegido se pinta con el color de resaltado; si hay uno elegido, los demás se atenúan.
          itemStyle: {
            color: b.codigo === resaltado ? COLOR_RESALTADO : COLORES_GRAFICO[0],
            opacity: resaltado && b.codigo !== resaltado ? 0.55 : 1,
          },
        })),
      },
    ],
  };

  // Clic en una barra: elige ese banco; clic en el banco ya elegido: lo quita.
  const eventos = {
    click: (p) => {
      const codigo = p?.data?.codigo;
      if (!codigo) return;
      const destino = codigo === resaltado ? rutaBase : `${rutaBase}&banco=${encodeURIComponent(codigo)}`;
      iniciarTransicion(() => router.replace(destino, { scroll: false }));
    },
  };

  return (
    <div>
      <Grafico
        opcion={opcion}
        altura={Math.max(320, barras.length * 34)}
        formatoValor="monto"
        eventos={eventos}
      />
      <p className="mt-1 text-xs text-texto-tenue" aria-live="polite">
        {pendiente ? "Actualizando…" : "Pulse una barra para ver ese banco."}
      </p>
    </div>
  );
}
