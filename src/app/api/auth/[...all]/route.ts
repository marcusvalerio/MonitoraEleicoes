import { authEnabled, getAuth } from "@/auth/server";

/** Endpoints do provedor de autenticação (login, logout, sessão, recuperação/troca de senha). */
const handle = (req: Request) => (authEnabled() ? getAuth().then((a) => a.handler(req)) : Response.json({ error: "autenticação indisponível neste ambiente" }, { status: 503 }));
export const GET = handle;
export const POST = handle;
