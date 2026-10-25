import { inflateRawSync } from "node:zlib";

/**
 * Leitor mínimo de ZIP (diretório central) para extrair UM membro de um pacote oficial já baixado em memória.
 * Suporta "stored" (0) e "deflate" (8) — o que o TSE publica. Sem dependências; sem ZIP64.
 */
export interface ZipMember {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export function listZip(buf: Buffer): ZipMember[] {
  // fim do diretório central: assinatura 0x06054b50 nos últimos 64 KiB + 22 bytes
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("ZIP inválido (sem diretório central)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipMember[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP inválido (entrada do diretório)");
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    out.push({
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
      name: buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readZipMember(buf: Buffer, m: ZipMember): Buffer {
  const h = m.localOffset;
  if (buf.readUInt32LE(h) !== 0x04034b50) throw new Error("ZIP inválido (cabeçalho local)");
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  const data = buf.subarray(start, start + m.compressedSize);
  if (m.method === 0) return Buffer.from(data);
  if (m.method === 8) return inflateRawSync(data, { maxOutputLength: Math.max(m.size, 1) * 2 + 1024 });
  throw new Error(`método de compressão não suportado: ${m.method}`);
}
