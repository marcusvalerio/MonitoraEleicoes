import { Activity, ClipboardList, Columns2, Flag, Users, BookOpen, Database, LayoutDashboard, Landmark, Vote, Map, MessagesSquare, Mic2, Radio } from "lucide-react";

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
        { href: "/ao-vivo", label: "Ao vivo", icon: Radio, match: (p) => p.startsWith("/ao-vivo") || p.endsWith("/live") },
        { href: "/debates", label: "Debates", icon: Mic2, match: (p) => p.startsWith("/debates") && !p.endsWith("/live") },
      ],
    },
    {
      label: "Eleições",
      items: [
        { href: "/apuracao", label: "Apuração", icon: Vote, match: (p) => p.startsWith("/apuracao") },
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
        { href: "/social", label: "Repercussão de debates", icon: MessagesSquare, match: (p) => p.startsWith("/social") },
        { href: "/map", label: "Mapa da repercussão", icon: Map, match: (p) => p.startsWith("/map") },
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
