/** Nome normalizado para casar município do TSE (maiúsculas, sem acento) com o do IBGE. */
export const normName = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
