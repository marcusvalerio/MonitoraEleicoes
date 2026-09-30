/**
 * Guardas editoriais: termos que o produto nunca deve produzir automaticamente.
 * Usado em testes e na revisão de textos gerados pelo sistema.
 */
export const FORBIDDEN_EDITORIAL_PATTERNS: RegExp[] = [
  /melhor candidat/i,
  /pior candidat/i,
  /venceu o debate/i,
  /ganhou o debate/i,
  /quem ganhou/i,
  /vencedor/i,
  /mais popular/i,
  /vote em/i,
  /previs[ãa]o de vit[óo]ria/i,
  /fez o candidato ganhar/i,
];

export function violatesEditorialPolicy(text: string): RegExp | null {
  return FORBIDDEN_EDITORIAL_PATTERNS.find((re) => re.test(text)) ?? null;
}
