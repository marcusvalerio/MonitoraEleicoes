import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** "Ao vivo" agora é a apuração oficial (debates fora da navegação). */
export default function AoVivoIndex() {
  redirect("/apuracao");
}
