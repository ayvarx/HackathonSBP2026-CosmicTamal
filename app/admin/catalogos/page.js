// Catálogos (/admin/catalogos) — Consulta de los catálogos de referencia que usa el motor:
// bancos ficticios, CINU/SB109 (actividad → ranking y subactividad) y SB21 (facilidades).
// Toda clasificación sale de aquí (requisito R3): nunca de datos del cliente.
import EncabezadoPagina from "@/components/EncabezadoPagina";
import TablaOrdenable from "@/components/TablaOrdenable";
import { exigirPerfil } from "@/lib/auth";
import { catalogos } from "@/lib/consultas";
import FormularioCatalogo from "./FormularioCatalogo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catálogos" };

export default async function PaginaCatalogos() {
  await exigirPerfil("administrador");
  const { bancos, cinu, sb21 } = await catalogos();

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogos de referencia"
        descripcion="Catálogos con los que el motor clasifica cada préstamo. Se cargan desde la carpeta datos/ al instalar; el catálogo CINU/SB109 está congelado y es la única versión válida."
      />

      <section aria-labelledby="titulo-bancos" className="mb-8">
        <h2 id="titulo-bancos" className="mb-1">Bancos ficticios ({bancos.length})</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Un Codigo_Banco que no esté aquí se reporta como alerta de calidad, pero no excluye la fila.
        </p>
        <TablaOrdenable
          titulo="Bancos_ficticios.csv"
          columnas={[
            { clave: "codigo_banco", titulo: "Codigo_Banco", tipo: "codigo" },
            { clave: "nombre_ficticio", titulo: "Nombre_Ficticio" },
            { clave: "tipo_licencia", titulo: "Tipo_Licencia" },
          ]}
          filas={bancos}
          claveFila="codigo_banco"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-cinu" className="mb-8">
        <h2 id="titulo-cinu" className="mb-1">Catálogo CINU / SB109 ({cinu.length} actividades)</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Llave de cruce: AT03.Tipo_Actividad = Codigo_CINU. Codigo_SB08_Referencia es solo referencial (el código 2103
          se repite en dos subactividades). Un Tipo_Actividad que no esté aquí se excluye en el filtro E4.
        </p>
        <TablaOrdenable
          titulo="Catalogo_CINU_SB109_reto.csv"
          columnas={[
            { clave: "codigo_cinu", titulo: "Codigo_CINU", tipo: "codigo" },
            { clave: "descripcion", titulo: "Descripcion" },
            { clave: "macroactividad_reto", titulo: "Macroactividad_Reto (ranking)", tipo: "ranking" },
            { clave: "subactividad_reto", titulo: "Subactividad_Reto", tipo: "subactividad" },
            { clave: "codigo_sb08_referencia", titulo: "Codigo_SB08_Referencia", tipo: "codigo" },
          ]}
          filas={cinu}
          claveFila="codigo_cinu"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-sb21">
        <h2 id="titulo-sb21" className="mb-1">Tabla SB21 simplificada ({sb21.length} facilidades)</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Regla especial de CONSUMO: un préstamo con CINU de Crédito personal y facilidad 07 (tarjeta de crédito) se
          reclasifica a la subactividad Tarjeta. Una facilidad que no esté aquí se reporta como alerta de calidad.
        </p>
        <TablaOrdenable
          titulo="Tabla_SB21_simplificada.csv"
          columnas={[
            { clave: "codigo", titulo: "Codigo", tipo: "codigo" },
            { clave: "descripcion", titulo: "Descripcion" },
            { clave: "uso_en_reto", titulo: "Uso_en_reto" },
          ]}
          filas={sb21}
          claveFila="codigo"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-actualizar" className="mt-8">
        <h2 id="titulo-actualizar" className="mb-1">Actualizar un catálogo</h2>
        <p className="mb-3 text-sm text-texto-suave">
          Solo si la Superintendencia publica una nueva versión. Para el reto, los catálogos de datos/ son los oficiales.
        </p>
        <FormularioCatalogo />
      </section>
    </>
  );
}
