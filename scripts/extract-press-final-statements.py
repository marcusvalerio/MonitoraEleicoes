#!/usr/bin/env python3
"""
Extrai, de forma reprodutível, as CONSIDERAÇÕES FINAIS transcritas literalmente pela imprensa
(Manchete Rio, 30/09/2026) do debate da TV Globo para o governo do RJ (29/09/2026).

Uso: python3 scripts/extract-press-final-statements.py <arquivo.html> > transcript.json
- Não reescreve o texto: apenas junta os parágrafos de cada fala e remove as aspas externas.
- Não atribui horários (a fonte não informa): start/end ficam ausentes.
"""
import hashlib, html, json, re, sys

src = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
blocks = re.findall(r"<(p|h[1-6])[^>]*>(.*?)</\1>", src, re.S)
paras = []
for b in blocks:  # quebras <br> separam título e nome do orador
    for line in re.split(r"<br\s*/?>|\n", b[1]):
        t = html.unescape(re.sub(r"<[^>]+>", "", line)).strip()
        if t:
            paras.append(t)
start = paras.index("Considerações finais")
SPEAKERS = ["André Marinho", "Douglas Ruas", "Eduardo Paes", "William Siri", "Anthony Garotinho"]
out, cur, buf = [], None, []

def flush():
    if cur and buf:
        text = " ".join(buf).strip()
        text = re.sub(r"^“", "", text)
        text = re.sub(r"”\.?$", "", text).strip()
        out.append({"speaker": cur, "block": "Considerações finais", "text": text})

for p in paras[start + 1 :]:
    if p in SPEAKERS:
        flush(); cur, buf = p, []
        continue
    if cur is None:
        continue
    if not p.startswith("“") and not buf:
        break
    buf.append(p)
    if p.endswith("”.") or p.endswith("”"):
        flush(); cur, buf = None, []
flush()
json.dump({"source_sha256": hashlib.sha256(src.encode()).hexdigest(), "segments": out}, sys.stdout, ensure_ascii=False, indent=2)
