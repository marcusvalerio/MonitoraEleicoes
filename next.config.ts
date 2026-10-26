import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { authInterrupts: true },
  // Foco do produto: apuração e eleições (atuais e anteriores). Notícias, redes e pesquisas saem da navegação.
  async redirects() {
    return ["/", "/overview", "/noticias", "/monitoramento", "/social", "/pesquisas"].map((source) => ({ source, destination: "/apuracao", permanent: false }));
  },
};

export default nextConfig;
