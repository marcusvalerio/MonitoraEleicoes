import Link from "next/link";
import { ChevronRight, FileCheck2, Database, Filter, Layers, ShieldCheck, Upload } from "lucide-react";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";

const LEVELS = ["Brasil", "Região", "UF", "Município", "Zona Eleitoral", "Local de Votação", "Seção Eleitoral"];
const PIPELINE = [
  { icon: Upload, label: "Arquivo bruto", desc: "CSV oficial do Portal de Dados Abertos do TSE" },
  { icon: FileCheck2, label: "Validação", desc: "Esquema, totais e checksum" },
  { icon: Layers, label: "Normalização", desc: "Entidades oficiais (UF, município, zona, seção)" },
  { icon: Database, label: "Banco", desc: "PostgreSQL com índices por localidade" },
  { icon: Filter, label: "Agregação", desc: "Somas por nível hierárquico" },
  { icon: ShieldCheck, label: "Painel", desc: "Exibição com fonte e versão" },
];

/** Explorador eleitoral — P1. Sem dados oficiais importados, nada é exibido como número. */
export function ElectionsExplorer({ path }: { path: string[] }) {
  const crumbs = ["Brasil", ...path.map(decodeURIComponent)];
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<>Eleições <Tag tone="info">P1</Tag></>} title="Explorador eleitoral" description="Resultados oficiais navegáveis do nível nacional até a seção eleitoral. Fonte única: TSE." />
      <nav aria-label="Localidade" className="flex flex-wrap items-center gap-1 text-[12.5px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-fg-3" aria-hidden />}
            <Link href={i === 0 ? "/elections" : `/elections/${path.slice(0, i).join("/")}`} className={i === crumbs.length - 1 ? "text-fg" : "text-fg-3 hover:text-fg"}>{c}</Link>
          </span>
        ))}
      </nav>
      <Panel>
        <StateView state="provider_unavailable" title="Dados oficiais ainda não importados">
          O TSE é a única fonte de resultados desta plataforma. A importação dos arquivos oficiais está prevista para a fase P1. Até lá, nenhum número eleitoral é exibido — nem mesmo fictício.
        </StateView>
      </Panel>
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Hierarquia" question="Níveis de navegação (nomenclatura oficial)">
          <ol className="space-y-1.5">
            {LEVELS.map((l, i) => (
              <li key={l} className="flex items-center gap-2 text-[12.5px]" style={{ paddingLeft: i * 12 }}>
                <span className="size-1.5 rounded-full bg-fg-3" aria-hidden />
                <span className="text-fg-2">{l}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11.5px] text-fg-3">“Colégio eleitoral” pode aparecer como termo amigável; internamente usamos zona, local e seção.</p>
        </Panel>
        <Panel title="Pipeline de importação" question="Como os arquivos oficiais chegam ao painel">
          <ol className="space-y-2.5">
            {PIPELINE.map((s, i) => (
              <li key={s.label} className="flex items-start gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-fg-3"><s.icon size={12} aria-hidden /></span>
                <span>
                  <span className="text-[12.5px] text-fg">{i + 1}. {s.label}</span>
                  <span className="block text-[11.5px] text-fg-3">{s.desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <Panel title="Indicadores previstos" question="Exibidos somente quando presentes na fonte oficial">
        <div className="flex flex-wrap gap-1.5">
          {["Eleitores aptos", "Comparecimento", "Abstenção", "Votos válidos", "Brancos", "Nulos", "Votos por candidato", "Partido", "Percentual"].map((x) => <Tag key={x}>{x}</Tag>)}
        </div>
      </Panel>
    </div>
  );
}
