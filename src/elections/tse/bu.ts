/**
 * Leitor mínimo do Boletim de Urna oficial (arquivo "-bu.dat", ASN.1 DER do TSE). Extrai, para UMA eleição
 * (idEleicao), os votos por votável: número do candidato → votos; brancos = "95", nulos = "96" (códigos do TSE).
 * Nada é estimado: valores lidos do próprio boletim assinado.
 */
interface Node {
  cls: number;
  tag: number;
  cons: boolean;
  kids: Node[];
  int: number | null;
}

function parse(buf: Uint8Array, s: number, e: number, depth = 0): Node[] {
  const out: Node[] = [];
  let i = s;
  while (i < e) {
    const t = buf[i++];
    let tag = t & 31;
    if (tag === 31) {
      tag = 0;
      let c;
      do {
        c = buf[i++];
        tag = (tag << 7) | (c & 127);
      } while (c & 128);
    }
    let len = buf[i++];
    if (len & 128) {
      const n = len & 127;
      len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + buf[i++];
    }
    const cls = t >> 6;
    const cons = (t & 32) !== 0;
    let kids: Node[] = [];
    let int: number | null = null;
    if (cons) kids = parse(buf, i, i + len, depth + 1);
    else if (cls === 0 && tag === 4 && depth < 3 && len > 2 && buf[i] === 0x30) {
      // envelope: o conteúdo do BU vem como OCTET STRING com DER dentro
      try {
        kids = parse(buf, i, i + len, depth + 1);
      } catch {
        kids = [];
      }
    } else if (len <= 6 && ((cls === 0 && (tag === 2 || tag === 10)) || cls === 2)) {
      int = 0;
      for (let k = 0; k < len; k++) int = int * 256 + buf[i + k];
    }
    out.push({ cls, tag, cons, kids, int });
    i += len;
  }
  return out;
}

const isVotavel = (n: Node) => n.cons && n.kids.some((k) => k.cls === 2 && k.tag === 1 && k.int !== null) && n.kids.some((k) => k.cls === 2 && k.tag === 2 && k.int !== null);

export function readBoletim(buf: Uint8Array, electionId: number): Record<string, number> | null {
  const roots = parse(buf, 0, buf.length);
  let found: Node | null = null;
  const walk = (n: Node) => {
    if (found) return;
    if (n.cons && n.kids[0]?.cls === 0 && n.kids[0].tag === 2 && n.kids[0].int === electionId && n.kids.length >= 4) {
      found = n;
      return;
    }
    n.kids.forEach(walk);
  };
  roots.forEach(walk);
  if (!found) return null;
  const votes: Record<string, number> = {};
  const add = (k: string, v: number) => (votes[k] = (votes[k] ?? 0) + v);
  const collect = (n: Node) => {
    if (isVotavel(n)) {
      const tipo = n.kids.find((k) => k.cls === 2 && k.tag === 1)!.int!;
      const qtd = n.kids.find((k) => k.cls === 2 && k.tag === 2)!.int!;
      const id = n.kids.find((k) => k.cls === 2 && k.tag === 3);
      const codigo = id?.kids[1]?.int ?? id?.kids[0]?.int ?? null;
      if (tipo === 2) add("95", qtd);
      else if (tipo === 3) add("96", qtd);
      else if (codigo !== null) add(String(codigo), qtd);
      return;
    }
    n.kids.forEach(collect);
  };
  collect(found);
  return votes;
}
