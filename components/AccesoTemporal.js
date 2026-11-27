// AccesoTemporal — Login TEMPORAL (mientras se integra el definitivo): título de la plataforma
// y tres botones, uno por vista. Cada botón fija la cookie de perfil con la acción de servidor
// cambiarPerfil (firma HMAC en lib/auth.js) y lleva al Panel ("/").
// Se usa en app/login/page.js y app/perfil/page.js.
import { cambiarPerfil } from "@/app/perfil/acciones";
import LogoRadar from "./LogoRadar";

const VISTAS = [
  { valor: "publico", nombre: "Público" },
  { valor: "analista", nombre: "Analista" },
  { valor: "administrador", nombre: "Administrador" },
];

export default function AccesoTemporal() {
  return (
    <section aria-labelledby="titulo-acceso" className="mx-auto flex max-w-xl flex-col items-center gap-8 py-10 text-center">
      <div className="flex flex-col items-center gap-3">
        <LogoRadar size={64} decorativo />
        <h1 id="titulo-acceso">Rankings de crédito bancario</h1>
      </div>
      <div className="grid w-full gap-4">
        {VISTAS.map((vista) => (
          <form key={vista.valor} action={cambiarPerfil}>
            <input type="hidden" name="perfil" value={vista.valor} />
            <input type="hidden" name="volver" value="/" />
            <button type="submit" className="boton w-full justify-center py-4 text-lg">
              {vista.nombre}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
