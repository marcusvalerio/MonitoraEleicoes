import { Activity, BarChart3, BookOpen, Database, LayoutDashboard, Map, MessagesSquare, Mic2, Radio } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Activity;
  match: (path: string) => boolean;
  phase?: "P1" | "P2";
}

export function navItems(currentDebateId: string | null): NavItem[] {
  const live = currentDebateId ? `/debates/${currentDebateId}/live` : "/debates";
  return [
    { href: "/overview", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/" || p.startsWith("/overview") },
    { href: "/debates", label: "Debates", icon: Mic2, match: (p) => p.startsWith("/debates") && !p.endsWith("/live") },
    { href: live, label: "Ao Vivo", icon: Radio, match: (p) => p.endsWith("/live") },
    { href: "/social", label: "Repercussão", icon: MessagesSquare, match: (p) => p.startsWith("/social"), phase: "P1" },
    { href: "/elections", label: "Eleições", icon: Map, match: (p) => p.startsWith("/elections"), phase: "P1" },
    { href: "/analyses", label: "Análises", icon: BarChart3, match: (p) => p.startsWith("/analyses"), phase: "P2" },
    { href: "/sources", label: "Fontes", icon: Database, match: (p) => p.startsWith("/sources") },
    { href: "/methodology", label: "Metodologia", icon: BookOpen, match: (p) => p.startsWith("/methodology") },
  ];
}
