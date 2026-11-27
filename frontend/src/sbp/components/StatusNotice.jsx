export default function StatusNotice({ type = "info", children, onRetry }) {
  return (
    <div className={`notice notice--${type}`} role={type === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onRetry && <button className="text-button" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}
