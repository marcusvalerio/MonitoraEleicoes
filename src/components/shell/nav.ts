import { Activity, ClipboardList, Columns2, Flag, Users, BookOpen, Database, LayoutDashboard, Landmark, Radio } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Radio;
  match: (path: string) => boolean;
  phase?: "P1" | "P2";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function navGroups(currentDebateId: string | null): NavGroup[] {
  void currentDebateId;
  return [
    {
      label: "Acompanhar",
      items: [
        { href: "/", label: "Visão geral", icon: LayoutDashboard, match: (p) => p === "/" || p.startsWith("/overview") },
        { href: "/apuracao", label: "Ao vivo", icon: Radio, match: (p) => p.startsWith("/apuracao") || p.startsWith("/ao-vivo") },
      ],
    },
    {
      label: "Eleições",
      items: [
        { href: "/eleicoes", label: "Eleições", icon: Landmark, match: (p) => p.startsWith("/eleicoes") },
        { href: "/candidatos", label: "Candidatos", icon: Users, match: (p) => p.startsWith("/candidato") },
        { href: "/partidos", label: "Partidos", icon: Flag, match: (p) => p.startsWith("/partido") },
        { href: "/pesquisas", label: "Pesquisas", icon: ClipboardList, match: (p) => p.startsWith("/pesquisas") },
        { href: "/comparar", label: "Comparar", icon: Columns2, match: (p) => p.startsWith("/comparar") },
      ],
    },
    {
      label: "Conversação",
      items: [
        { href: "/monitoramento", label: "Redes", icon: Activity, match: (p) => p.startsWith("/monitoramento") },
      ],
    },
    {
      label: "Referência",
      items: [
        { href: "/fontes", label: "Fontes", icon: Database, match: (p) => p.startsWith("/fontes") || p.startsWith("/sources") },
        { href: "/metodologia", label: "Metodologia", icon: BookOpen, match: (p) => p.startsWith("/metodologia") || p.startsWith("/methodology") },
      ],
    },
  ];
}

/** Itens fixos da barra inferior no mobile (o restante fica no menu/gaveta). */
export const MOBILE_PRIMARY = ["Visão geral", "Ao vivo", "Eleições", "Redes"];

export const navItems = (id: string | null) => navGroups(id).flatMap((g) => g.items);
