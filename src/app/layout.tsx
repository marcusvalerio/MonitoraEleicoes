import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { getCurrentDebate } from "@/services/debates";
import { getRepository } from "@/repository";

/** Identidade Eleições 2026: General Sans (títulos/cargos), Clash Grotesk (números), Geist Sans (interface). */
const generalSans = localFont({
  src: [
    { path: "./fonts/general-sans-500.woff2", weight: "500" },
    { path: "./fonts/general-sans-600.woff2", weight: "600" },
    { path: "./fonts/general-sans-700.woff2", weight: "700" },
  ],
  variable: "--font-general",
  display: "swap",
});
const clashGrotesk = localFont({
  src: [
    { path: "./fonts/clash-grotesk-500.woff2", weight: "500" },
    { path: "./fonts/clash-grotesk-600.woff2", weight: "600" },
    { path: "./fonts/clash-grotesk-700.woff2", weight: "700" },
  ],
  variable: "--font-clash",
  display: "swap",
});

/**
 * Todas as páginas dependem do perfil de dados (DATA_MODE) resolvido em TEMPO DE EXECUÇÃO.
 * Pré-renderização estática congelaria o perfil do build e misturaria demo com dados reais.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Monitora Eleições", template: "%s · Monitora Eleições" },
  description: "O que foi dito. O que repercutiu. O que os dados mostram. Inteligência eleitoral baseada em dados oficiais.",
};

export const viewport: Viewport = { themeColor: "#0A0A0B", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const debate = await getCurrentDebate();
  const status = await (await getRepository()).getDataStatus();
  return (
    <html lang="pt-BR" className={`${generalSans.variable} ${clashGrotesk.variable} ${GeistSans.variable}`}>
      <body>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-elevated focus:px-3 focus:py-2">
          Pular para o conteúdo
        </a>
        <div className="flex min-h-dvh">
          <Sidebar currentDebateId={debate?.status === "live" ? debate.id : null} />
          <div className="flex min-w-0 flex-1 flex-col">
            <OfflineBanner />
            <Topbar debate={debate} status={status} />
            <main id="conteudo" className="flex-1 pb-20 lg:pb-0">
              {children}
            </main>
          </div>
        </div>
        <MobileNav currentDebateId={debate?.status === "live" ? debate.id : null} />
      </body>
    </html>
  );
}
