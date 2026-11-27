"use client";
// Filtros — Selectores enlazados a la URL (?periodo=...&ranking=...&banco=...&subactividad=...).
// Al cambiar un selector se actualiza la URL y la página de servidor vuelve a consultar con
// los nuevos searchParams. Así los filtros se pueden compartir con un enlace y el botón
// "Atrás" del navegador funciona.
//
// Uso desde una página de servidor:
//   const { periodo, ranking, banco, subactividad } = await searchParams;
//   <Filtros campos={[
//     { nombre: "periodo", etiqueta: "Período",
//       opciones: periodos.map((p) => ({ valor: p, texto: formatearFecha(p) })) },
//     { nombre: "ranking", etiqueta: "Ranking", textoTodos: "Todos los rankings",
//       opciones: ORDEN_RANKINGS.map((r) => ({ valor: r, texto: nombreRanking(r) })) },
//     { nombre: "banco", etiqueta: "Banco", textoTodos: "Todos los bancos",
//       opciones: bancos.map((b) => ({ valor: b.codigo, texto: nombreBanco(b.codigo, b.nombre) })) },
//     { nombre: "subactividad", etiqueta: "Subactividad", textoTodos: "Todas", dependeDe: "ranking",
//       opciones: subactividades.map((s) => ({ valor: s.nombre, texto: nombreSubactividad(s.nombre), grupo: s.ranking })) },
//   ]} />
//
// Props:
//   campos  Lista de { nombre, etiqueta, opciones: [{ valor, texto, grupo? }], textoTodos?, dependeDe?, predeterminado? }
//     nombre:       nombre del parámetro en la URL ("periodo", "ranking", "banco", "subactividad", ...).
//     textoTodos:   si se indica, agrega una opción vacía ("Todos los bancos") que quita el filtro.
//     dependeDe:    nombre de otro campo; solo se muestran opciones cuyo `grupo` coincide con su valor
//                   (p. ej. subactividades del ranking elegido). Si el padre cambia, este se limpia.
//     predeterminado: valor que se muestra cuando la URL no trae el parámetro (p. ej. el último período).
//   reiniciar  Parámetros que se borran al cambiar un filtro. Predeterminado ["pagina"].
//   conLimpiar (bool) Muestra "Limpiar filtros". Predeterminado true.
import { Suspense, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function FiltrosInterno({ campos, reiniciar, conLimpiar }) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  const valorDe = (campo) => parametros.get(campo.nombre) ?? campo.predeterminado ?? "";

  function cambiar(campo, valor) {
    const nuevos = new URLSearchParams(parametros.toString());
    if (valor) nuevos.set(campo.nombre, valor);
    else nuevos.delete(campo.nombre);
    // Si cambia un filtro padre, se limpian sus dependientes (p. ej. ranking → subactividad).
    for (const hijo of campos.filter((c) => c.dependeDe === campo.nombre)) nuevos.delete(hijo.nombre);
    for (const nombre of reiniciar) nuevos.delete(nombre);
    const consulta = nuevos.toString();
    iniciarTransicion(() => {
      router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
    });
  }

  const hayFiltros = campos.some((c) => parametros.has(c.nombre));

  return (
    <form
      className="tarjeta mb-6 flex flex-wrap items-end gap-4"
      aria-label="Filtros"
      onSubmit={(evento) => evento.preventDefault()}
    >
      {campos.map((campo) => {
        const padre = campo.dependeDe ? campos.find((c) => c.nombre === campo.dependeDe) : null;
        const valorPadre = padre ? valorDe(padre) : "";
        const opciones = padre && valorPadre ? campo.opciones.filter((o) => o.grupo === valorPadre) : campo.opciones;
        const id = `filtro-${campo.nombre}`;
        const valor = valorDe(campo);
        return (
          <div key={campo.nombre} className="min-w-[11rem] flex-1 sm:flex-none">
            <label htmlFor={id} className="etiqueta-campo">
              {campo.etiqueta}
            </label>
            <select
              id={id}
              name={campo.nombre}
              className="control"
              value={opciones.some((o) => String(o.valor) === valor) ? valor : ""}
              onChange={(evento) => cambiar(campo, evento.target.value)}
            >
              {(campo.textoTodos || !opciones.some((o) => String(o.valor) === valor)) && (
                <option value="">{campo.textoTodos ?? "Seleccione…"}</option>
              )}
              {opciones.map((opcion) => (
                <option key={String(opcion.valor)} value={String(opcion.valor)}>
                  {opcion.texto ?? String(opcion.valor)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <div className="flex items-center gap-3 pb-1 text-sm">
        {conLimpiar && hayFiltros && (
          <Link href={ruta} scroll={false}>
            Limpiar filtros
          </Link>
        )}
        <span aria-live="polite" className="text-texto-tenue">
          {pendiente ? "Actualizando…" : ""}
        </span>
      </div>
    </form>
  );
}

/** Mientras se leen los parámetros de la URL se muestran los selectores deshabilitados. */
function FiltrosCargando({ campos }) {
  return (
    <div className="tarjeta mb-6 flex flex-wrap items-end gap-4" aria-hidden="true">
      {campos.map((campo) => (
        <div key={campo.nombre} className="min-w-[11rem]">
          <span className="etiqueta-campo">{campo.etiqueta}</span>
          <select className="control" disabled>
            <option>{campo.textoTodos ?? "…"}</option>
          </select>
        </div>
      ))}
    </div>
  );
}

export default function Filtros({ campos = [], reiniciar = ["pagina"], conLimpiar = true }) {
  return (
    <Suspense fallback={<FiltrosCargando campos={campos} />}>
      <FiltrosInterno campos={campos} reiniciar={reiniciar} conLimpiar={conLimpiar} />
    </Suspense>
  );
}
