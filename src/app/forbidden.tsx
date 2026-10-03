import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center" data-testid="forbidden">
      <ShieldX size={28} className="text-fg-3" aria-hidden />
      <p className="mt-4 font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[0.16em] text-fg-3">403 · ACESSO NEGADO</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[22px] font-semibold text-fg">Você não tem acesso a esta área.</h1>
      <p className="mt-2 text-[13px] text-fg-2">O acesso é concedido pela administração da plataforma, por campanha e por papel.</p>
      <Link href="/" className="mt-6 text-[12.5px] text-fg-2 underline hover:text-fg">Voltar ao início</Link>
    </div>
  );
}
