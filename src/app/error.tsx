"use client";

import { StateView } from "@/components/ui/states";
import { buttonCls } from "@/components/ui/primitives";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-4 py-10 md:px-6">
      <StateView state="error" action={<button className={buttonCls()} onClick={reset}>Tentar novamente</button>}>
        Ocorreu um erro ao carregar esta página. Nenhum dado foi alterado.{error.digest && <span className="mt-1 block font-mono text-2xs">ref {error.digest}</span>}
      </StateView>
    </div>
  );
}
