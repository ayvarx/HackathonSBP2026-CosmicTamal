"use client";
// Portado del frontend de Amet: components/RankingsPage.jsx (pestaña «Composición»)
// Una tarjeta por banco con su saldo, su evolución en los cortes cargados y el reparto por
// subactividad, con buscador por nombre. El detalle del banco elegido (BancoDetalle, de
// servidor) llega ya armado en la prop `detalle` y se dibuja sobre la cuadrícula.
//
// Props: tarjetas [props de BancoCard + codigo], detalle (nodo o null).
import { useState } from "react";
import BancoCard from "./BancoCard";
import "./rankings.css";

export default function TarjetasBancos({ tarjetas, detalle }) {
  const [busqueda, setBusqueda] = useState("");
  const texto = busqueda.trim().toLowerCase();
  const visibles = tarjetas.filter((t) => !texto || t.banco.toLowerCase().includes(texto) || t.codigo.includes(texto));

  return (
    <div className="rk-amet rk-contenido">
      <div className="rk-sub-head">
        <label className="field buscador">
          <span>Buscar banco</span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o código del banco" />
        </label>
      </div>
      {detalle}
      {!visibles.length && <p className="empty-inline">Ningún banco coincide con la búsqueda.</p>}
      <div className="bancos-grid">
        {visibles.map(({ codigo, ...props }) => (
          <BancoCard key={codigo} {...props} />
        ))}
      </div>
    </div>
  );
}
