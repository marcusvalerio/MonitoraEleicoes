import { StateView } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="px-4 py-10 md:px-6">
      <StateView state="no_data" title="Página não encontrada" action={<ButtonLink href="/">Voltar ao início</ButtonLink>}>
        O endereço não corresponde a nenhuma eleição ou página disponível.
      </StateView>
    </div>
  );
}
