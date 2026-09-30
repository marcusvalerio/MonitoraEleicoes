import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Inter, Sora } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { getCurrentDebate } from "@/services/debates";
import { getRepository } from "@/repository";

const familjen = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-familjen", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/**
 * Todas as páginas dependem do perfil de dados (DATA_MODE) resolvido em TEMPO DE EXECUÇÃO.
 * Pré-renderização estática congelaria o perfil do build e misturaria demo com dados reais.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Monitora Eleições", template: "%s · Monitora Eleições" },
  description: "O que foi dito. O que repercutiu. O que os dados mostram. Plataforma de inteligência eleitoral e acompanhamento de debates.",
};

export const viewport: Viewport = { themeColor: "#0A0A0B", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const debate = await getCurrentDebate();
  const status = (await getRepository()).getDataStatus();
  return (
    <html lang="pt-BR" className={`${familjen.variable} ${sora.variable} ${inter.variable}`}>
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
