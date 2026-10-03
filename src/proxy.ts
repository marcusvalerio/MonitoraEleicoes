import { NextResponse, type NextRequest } from "next/server";

/**
 * Debates fora do produto: toda rota de debate/repercussão leva à apuração oficial (o código permanece, reversível).
 * Somente redirecionamento — nenhuma checagem de autenticação aqui (essa fica na camada de acesso, no servidor).
 */
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const to = p === "/overview" ? "/" : "/apuracao";
  return NextResponse.redirect(new URL(to, req.url), 307);
}

export const config = {
  matcher: ["/overview", "/debates/:path*", "/ao-vivo/:path+", "/social/:path*", "/map/:path*", "/analyses/:path*", "/admin/debates/:path*", "/api/debates/:path*"],
};
