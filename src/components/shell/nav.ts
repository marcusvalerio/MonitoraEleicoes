import { BarChart3, BookOpen, Database, LayoutDashboard, Landmark, Map, MessagesSquare, Mic2, Radio } from "lucide-react";

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
  const live = currentDebateId ? `/debates/${currentDebateId}/live` : "/debates";
  return [
    {
      label: "Acompanhar",
      items: [
        { href: "/overview", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/" || p.startsWith("/overview") },
        { href: "/debates", label: "Debates", icon: Mic2, match: (p) => p.startsWith("/debates") && !p.endsWith("/live") },
        { href: live, label: "Ao Vivo", icon: Radio, match: (p) => p.endsWith("/live") },
        { href: "/social", label: "Repercussão", icon: MessagesSquare, match: (p) => p.startsWith("/social") },
      ],
    },
    {
      label: "Explorar",
      items: [
        { href: "/elections", label: "Eleições", icon: Landmark, match: (p) => p.startsWith("/elections"), phase: "P1" },
        { href: "/map", label: "Mapa", icon: Map, match: (p) => p.startsWith("/map") },
        { href: "/analyses", label: "Análises", icon: BarChart3, match: (p) => p.startsWith("/analyses"), phase: "P2" },
      ],
    },
    {
      label: "Referência",
      items: [
        { href: "/sources", label: "Fontes", icon: Database, match: (p) => p.startsWith("/sources") },
        { href: "/methodology", label: "Metodologia", icon: BookOpen, match: (p) => p.startsWith("/methodology") },
      ],
    },
  ];
}

export const navItems = (id: string | null) => navGroups(id).flatMap((g) => g.items);
