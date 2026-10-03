import Link from "next/link";
import { LogIn, LogOut, Shield } from "lucide-react";
import { getAuthenticatedUser } from "@/auth/dal";
import { authEnabled } from "@/auth/server";
import { logoutAction } from "@/auth/actions";

/** Sessão na barra superior: entrar / conta (admin, trocar senha, sair). Nenhum segredo vai ao cliente. */
export async function UserMenu() {
  if (!authEnabled()) return null;
  const u = await getAuthenticatedUser();
  if (!u)
    return (
      <Link href="/login" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] text-fg-2 hover:bg-elevated hover:text-fg" data-testid="login-link">
        <LogIn size={14} aria-hidden /> <span className="hidden sm:inline">Entrar</span>
      </Link>
    );
  return (
    <details className="relative" data-testid="user-menu">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-[8px] px-2 text-[12px] text-fg-2 hover:bg-elevated" aria-label="Conta">
        <span className="flex size-6 items-center justify-center rounded-full bg-elevated font-[family-name:var(--font-display)] text-[11px] font-semibold text-fg">{u.name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate md:inline">{u.name}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 rounded-[10px] border border-border bg-surface p-1.5 text-[12.5px] shadow-xl">
        <p className="truncate px-2.5 py-1.5 text-[11.5px] text-fg-3">{u.email}</p>
        {u.isAdmin && <Link href="/admin" className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-fg-2 hover:bg-elevated hover:text-fg"><Shield size={13} aria-hidden /> Administração</Link>}
        <Link href="/avaliacao" className="block rounded-[6px] px-2.5 py-1.5 text-fg-2 hover:bg-elevated hover:text-fg">Avaliação</Link>
        <Link href="/conta/senha" className="block rounded-[6px] px-2.5 py-1.5 text-fg-2 hover:bg-elevated hover:text-fg">Trocar senha</Link>
        <form action={logoutAction}>
          <button className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-fg-2 hover:bg-elevated hover:text-fg" data-testid="logout"><LogOut size={13} aria-hidden /> Sair</button>
        </form>
      </div>
    </details>
  );
}
