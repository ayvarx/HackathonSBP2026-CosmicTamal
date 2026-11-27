// Formulario del reporte personalizado. Es un formulario GET normal: al enviarlo, la página
// de servidor lee la selección de la URL y muestra la vista previa. No necesita JavaScript.
// Sin marcar nada en un grupo = todos; por eso, sin selección, todo aparece marcado.

function Grupo({ titulo, nombre, opciones, seleccionados }) {
  const todos = seleccionados.length === 0;
  return (
    <fieldset className="min-w-0">
      <legend className="etiqueta-campo mb-2">{titulo}</legend>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-2">
        {opciones.map((o) => (
          <label key={o.valor} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[#106003]" name={nombre} value={o.valor} defaultChecked={todos || seleccionados.includes(o.valor)} />
            {o.texto}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function FormularioPersonalizado({ periodos, rankings, bancos, columnas, seleccion }) {
  return (
    <form method="get" action="/reportes" className="tarjeta">
      <input type="hidden" name="vista" value="1" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Grupo titulo="Períodos" nombre="fechas" opciones={periodos} seleccionados={seleccion.fechas} />
        <Grupo titulo="Rankings" nombre="rankings" opciones={rankings} seleccionados={seleccion.rankings} />
        <Grupo titulo="Bancos" nombre="bancos" opciones={bancos} seleccionados={seleccion.bancos} />
        <Grupo
          titulo="Columnas"
          nombre="columnas"
          opciones={columnas}
          seleccionados={seleccion.columnas.map((c) => columnas.find((k) => k.campo === c || k.valor === c)?.valor ?? c)}
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="submit" className="boton">Ver vista previa</button>
        <a href="/reportes" className="boton boton-secundario">Restablecer</a>
      </div>
    </form>
  );
}
