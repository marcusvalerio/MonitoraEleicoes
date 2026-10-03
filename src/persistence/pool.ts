import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";

/**
 * Pool PostgreSQL (Neon, WebSocket na porta 443) para o que exige transação interativa: autenticação e
 * operações com RLS (SET LOCAL ROLE + contexto de sessão). Demais leituras seguem no driver HTTP (db.ts).
 * Atrás de proxy HTTPS (ambiente de desenvolvimento em contêiner), o WebSocket usa o agente do proxy.
 */
let configured = false;
async function configure() {
  if (configured) return;
  configured = true;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy && !process.env.VERCEL) {
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = new HttpsProxyAgent(proxy);
    neonConfig.webSocketConstructor = class extends WebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols, { agent });
      }
    } as unknown as typeof WebSocket;
  } else neonConfig.webSocketConstructor = WebSocket;
}

const pools = new Map<string, Pool>();
export async function getPool(url: string | undefined, varName = "DATABASE_URL"): Promise<Pool> {
  if (!url) throw new Error(`${varName} não definida`);
  await configure();
  let p = pools.get(url);
  if (!p) pools.set(url, (p = new Pool({ connectionString: url, max: 4 })));
  return p;
}
