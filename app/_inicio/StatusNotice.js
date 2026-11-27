// Portado del frontend de Amet: components/StatusNotice.jsx
// Aviso breve (info, éxito, advertencia o error). Componente de servidor: en lugar del
// callback onRetry de Amet recibe un enlace opcional { href, texto }.
import Link from "next/link";
import "./inicio.css";

export default function StatusNotice({ type = "info", children, accion }) {
  return (
    <div className={`notice notice--${type}`} role={type === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {accion && (
        <Link className="text-button" href={accion.href}>
          {accion.texto}
        </Link>
      )}
    </div>
  );
}
