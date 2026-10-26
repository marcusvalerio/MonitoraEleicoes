import { Columns2, Flag, Users, BookOpen, Database, Landmark, Radio, Map } from "lucide-react";

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
      label: "Apuração",
      items: [
        { href: "/apuracao", label: "Ao vivo", icon: Radio, match: (p) => (p.startsWith("/apuracao") && !p.startsWith("/apuracao/explorar")) || p.startsWith("/ao-vivo") },
        { href: "/apuracao/explorar", label: "Explorar", icon: Map, match: (p) => p.startsWith("/apuracao/explorar") },
      ],
    },
    {
      label: "Eleições",
      items: [
        { href: "/eleicoes", label: "Eleições", icon: Landmark, match: (p) => p.startsWith("/eleicoes") },
        { href: "/candidatos", label: "Candidatos", icon: Users, match: (p) => p.startsWith("/candidato") },
        { href: "/partidos", label: "Partidos", icon: Flag, match: (p) => p.startsWith("/partido") },
        { href: "/comparar", label: "Comparar", icon: Columns2, match: (p) => p.startsWith("/comparar") },
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
export const MOBILE_PRIMARY = ["Ao vivo", "Explorar", "Eleições", "Comparar"];

export const navItems = (id: string | null) => navGroups(id).flatMap((g) => g.items);
