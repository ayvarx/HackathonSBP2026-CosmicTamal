// Catálogos (/admin/catalogos) — Bancos, actividades CINU/SB109 y facilidades SB21.
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
      <EncabezadoPagina titulo="Catálogos de referencia" />

      <section aria-labelledby="titulo-bancos" className="mb-8">
        <h2 id="titulo-bancos" className="mb-3">Bancos ({bancos.length})</h2>
        <TablaOrdenable
          columnas={[
            { clave: "codigo_banco", titulo: "Código", tipo: "codigo" },
            { clave: "nombre_ficticio", titulo: "Banco" },
            { clave: "tipo_licencia", titulo: "Licencia" },
          ]}
          filas={bancos}
          claveFila="codigo_banco"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-cinu" className="mb-8">
        <h2 id="titulo-cinu" className="mb-3">Actividades CINU / SB109 ({cinu.length})</h2>
        <TablaOrdenable
          columnas={[
            { clave: "codigo_cinu", titulo: "Código CINU", tipo: "codigo" },
            { clave: "descripcion", titulo: "Descripción" },
            { clave: "macroactividad_reto", titulo: "Ranking", tipo: "ranking" },
            { clave: "subactividad_reto", titulo: "Subactividad", tipo: "subactividad" },
            { clave: "codigo_sb08_referencia", titulo: "Código SB08", tipo: "codigo" },
          ]}
          filas={cinu}
          claveFila="codigo_cinu"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-sb21">
        <h2 id="titulo-sb21" className="mb-3">Facilidades SB21 ({sb21.length})</h2>
        <TablaOrdenable
          columnas={[
            { clave: "codigo", titulo: "Código", tipo: "codigo" },
            { clave: "descripcion", titulo: "Descripción" },
            { clave: "uso_en_reto", titulo: "Uso" },
          ]}
          filas={sb21}
          claveFila="codigo"
          compacta
        />
      </section>

      <section aria-labelledby="titulo-actualizar" className="mt-8">
        <h2 id="titulo-actualizar" className="mb-3">Actualizar un catálogo</h2>
        <FormularioCatalogo />
      </section>
    </>
  );
}
