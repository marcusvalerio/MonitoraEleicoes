import { describe, expect, it } from "vitest";
import { hasVerifiableClaim } from "./relevance";

// Casos reais da validação RJ (docs/VALIDATION-RJ-2026-09-29.md) + casos gerais.
describe("afirmação verificável · metodologia v2", () => {
  it.each([
    "Meu nome é André Marinho. O número é 30. Faz o M de mudança",
    "vote 22 para governador, 22 para Flávio Bolsonaro",
    "Olha, domingo você vai lá e crava 10",
    "É 50 para governador e Lula",
    "enganaram a população em 2018, elegendo um novo, e em 2022 também",
    "No próximo dia 4, no domingo, você decide",
  ])("NÃO é afirmação verificável: %s", (t) => expect(hasVerifiableClaim(t)).toBe(false));

  it.each([
    "A inflação está em torno de 4,5 por cento",
    "Vamos criar 2 milhões de vagas por ano",
    "uma linha de 50 bilhões de reais",
    "o Rio dos mesmos de sempre, que tiveram 13 anos e não resolveram",
    "Ruas afirmou ter feito obras em 73 municípios",
    "mais de 40 mil mortes violentas",
    "adicional de R$ 150 por criança",
    "reduzir a fila para no máximo 45 dias",
  ])("É afirmação verificável: %s", (t) => expect(hasVerifiableClaim(t)).toBe(true));
});
