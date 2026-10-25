import { describe, expect, it } from "vitest";
import { listZip, readZipMember } from "./zip";
import { MEMBER_RE } from "./photos";

// ZIP gerado com Python zipfile: um membro deflate (foto) e um stored.
const ZIP = Buffer.from("UEsDBBQAAAAIAAAAIQAONxMwCgAAAC8BAAAXAAAARkJSMjgwMDAyNTQyNTQ4X2Rpdi5qcGf7f+N/4iggGgAAUEsDBBQAAAAAAAAAIQBH3dx5AgAAAAIAAAALAAAAbGVpYS1tZS50eHRva1BLAQIUAxQAAAAIAAAAIQAONxMwCgAAAC8BAAAXAAAAAAAAAAAAAACAAQAAAABGQlIyODAwMDI1NDI1NDhfZGl2LmpwZ1BLAQIUAxQAAAAAAAAAIQBH3dx5AgAAAAIAAAALAAAAAAAAAAAAAACAAT8AAABsZWlhLW1lLnR4dFBLBQYAAAAAAgACAH4AAABqAAAAAAA=", "base64");

describe("leitor de ZIP do pacote de fotos", () => {
  it("lista membros e extrai deflate e stored byte a byte", () => {
    const ms = listZip(ZIP);
    expect(ms.map((m) => m.name)).toEqual(["FBR280002542548_div.jpg", "leia-me.txt"]);
    const foto = readZipMember(ZIP, ms[0]);
    expect(foto.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(foto.length).toBe(303);
    expect(readZipMember(ZIP, ms[1]).toString()).toBe("ok");
    expect(MEMBER_RE.exec(ms[0].name)?.[2]).toBe("280002542548");
  });
  it("recusa arquivo que não é ZIP", () => {
    expect(() => listZip(Buffer.alloc(64))).toThrow();
  });
});
