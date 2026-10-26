import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { getCurrentDebate } from "@/services/debates";
import { getRepository } from "@/repository";
import { intelSql } from "@/services/intelligence";

/** Identidade Eleições 2026: Geist (títulos e números, Vercel) e Inter (texto corrido, Google Fonts — arquivo local, sem rede no build). */
const inter = localFont({
  src: [{ path: "./fonts/inter-latin-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
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

export const viewport: Viewport = { themeColor: "#07080b", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const debate = await getCurrentDebate();
  const status = await (await getRepository()).getDataStatus();
  const official = !!(await intelSql().catch(() => null));
  return (
    <html lang="pt-BR" className={`${inter.variable} ${GeistSans.variable}`}>
      <body>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-elevated focus:px-3 focus:py-2">
          Pular para o conteúdo
        </a>
        <div className="flex min-h-dvh">
          <Sidebar currentDebateId={debate?.status === "live" ? debate.id : null} />
          <div className="flex min-w-0 flex-1 flex-col">
            <OfflineBanner />
            <Topbar debate={debate} status={status} official={official} />
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
