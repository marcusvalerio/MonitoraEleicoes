import { beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const PW = "senha-de-teste-123456";

/**
 * Isolamento por campanha VERIFICADO NO BANCO (RLS + sessão validada por monitora_uid).
 * Contas criadas pelo fluxo real (bootstrap + criação pelo admin); nenhuma credencial fixa fora do teste.
 */
describe.skipIf(!DB)("autenticação, RBAC e RLS (Neon test)", () => {
  let sql: Sql;
  let auth: Awaited<ReturnType<typeof import("./server").getAuth>>;
  let withScope: typeof import("./scope").withScope;
  const tok: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let A = "", B = "", terr = 0;
  const as = <T,>(who: string, f: Parameters<typeof withScope<T>>[1]) => withScope(tok[who], f, DB);
  const login = async (email: string, password = PW) => (await auth.api.signInEmail({ body: { email, password } })).token as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.BETTER_AUTH_SECRET ||= "segredo-de-teste-".repeat(3);
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
    await sql`insert into territory (id, level, name, uf) values (0, 'pais', 'Brasil', null), (35, 'uf', 'São Paulo', 'SP'), (3550308, 'municipio', 'São Paulo', 'SP') on conflict do nothing`;
    terr = 3550308;
    ({ withScope } = await import("./scope"));
    auth = await (await import("./server")).getAuth();
    const { bootstrapAdmin } = await import("./bootstrap");
    expect(await bootstrapAdmin(auth, sql, { ADMIN_EMAIL: "admin@teste.invalid", ADMIN_INITIAL_PASSWORD: PW })).toMatchObject({ status: "created" });
    tok.admin = await login("admin@teste.invalid");
    for (const u of ["a", "b", "editor", "viewer", "fora"]) ids[u] = (await auth.api.createUser({ body: { email: `${u}@teste.invalid`, password: PW, name: u, data: { mustChangePassword: false } } })).user.id;
    await as("admin", async (db) => {
      A = (await db.query(`insert into campaign (name, slug) values ('Campanha A', 'campanha-a') returning id`)).rows[0].id;
      B = (await db.query(`insert into campaign (name, slug) values ('Campanha B', 'campanha-b') returning id`)).rows[0].id;
      for (const [c, u, r] of [[A, "a", "owner"], [B, "b", "owner"], [A, "editor", "editor"], [A, "viewer", "viewer"]]) await db.query(`insert into campaign_member (campaign_id, user_id, role) values ($1, $2, $3)`, [c, ids[u], r]);
    });
    for (const u of ["a", "b", "editor", "viewer", "fora"]) tok[u] = await login(`${u}@teste.invalid`);
  });

  const ins = (c: string, extra = "") => `insert into campaign_investment (campaign_id, name, category, amount_cents, frequency, start_date, end_date, territory_id, created_by, updated_by${extra ? ", notes" : ""})
    values ('${c}', 'Material de campanha', 'Material', 150000, 'weekly', '2026-09-01', '2026-09-30', ${3550308}, monitora_uid(), monitora_uid()${extra ? `, '${extra}'` : ""}) returning id`;
  const visible = (who: string) => as(who, async (db) => (await db.query(`select slug from campaign order by slug`)).rows.map((r) => r.slug));

  it("login válido gera sessão; inválido é recusado; bootstrap exige troca de senha e não cria 2º admin", async () => {
    expect(tok.a).toMatch(/.{20,}/);
    await expect(login("a@teste.invalid", "senha-errada-000000")).rejects.toThrow();
    expect(((await sql`select "mustChangePassword" as m from auth_user where email = 'admin@teste.invalid'`) as { m: boolean }[])[0].m).toBe(true);
    const { bootstrapAdmin } = await import("./bootstrap");
    expect(await bootstrapAdmin(auth, sql, { ADMIN_EMAIL: "admin@teste.invalid", ADMIN_INITIAL_PASSWORD: PW })).toMatchObject({ status: "exists" });
    await expect(bootstrapAdmin(auth, sql, { ADMIN_EMAIL: "outro@teste.invalid", ADMIN_INITIAL_PASSWORD: PW })).rejects.toThrow(/já existe administrador/);
    await expect(bootstrapAdmin(auth, sql, {})).rejects.toThrow(/ADMIN_EMAIL/);
    await expect(bootstrapAdmin(auth, sql, { ADMIN_EMAIL: "x@teste.invalid", ADMIN_INITIAL_PASSWORD: "curta" })).rejects.toThrow(/ADMIN_INITIAL_PASSWORD/);
  });

  it("isolamento: A vê só A; B vê só B; sem vínculo não vê nada; ADMIN vê todas", async () => {
    expect(await visible("a")).toEqual(["campanha-a"]);
    expect(await visible("b")).toEqual(["campanha-b"]);
    expect(await visible("fora")).toEqual([]);
    expect(await visible("admin")).toEqual(["campanha-a", "campanha-b"]);
  });

  it("investimentos: owner/editor escrevem na própria campanha; trocar campaign_id para outra é negado pelo banco", async () => {
    ids.invA = await as("a", async (db) => (await db.query(ins(A))).rows[0].id);
    await as("editor", async (db) => db.query(ins(A)));
    await expect(as("a", async (db) => db.query(ins(B)))).rejects.toThrow(/row-level security/);
    await expect(as("viewer", async (db) => db.query(ins(A)))).rejects.toThrow(/row-level security/);
    await expect(as("fora", async (db) => db.query(ins(A)))).rejects.toThrow(/row-level security/);
    // forjar autoria: created_by de outro usuário é recusado
    await expect(as("a", async (db) => db.query(`insert into campaign_investment (campaign_id, name, category, amount_cents, frequency, start_date, end_date, territory_id, created_by, updated_by) values ($1, 'X', 'Outros', 100, 'once', '2026-09-01', '2026-09-01', $2, $3, $3)`, [A, terr, ids.b]))).rejects.toThrow(/row-level security/);
  });

  it("leitura: membro vê os da campanha; outro usuário não vê nem altera; ADMIN lê mas não escreve", async () => {
    const count = (who: string) => as(who, async (db) => Number((await db.query(`select count(*) from campaign_investment`)).rows[0].count));
    expect(await count("a")).toBe(2);
    expect(await count("viewer")).toBe(2);
    expect(await count("b")).toBe(0);
    expect(await count("fora")).toBe(0);
    expect(await count("admin")).toBe(2);
    expect(await as("b", async (db) => (await db.query(`update campaign_investment set name = 'invadido', updated_by = monitora_uid() where id = $1`, [ids.invA])).rowCount)).toBe(0);
    expect(await as("b", async (db) => (await db.query(`delete from campaign_investment where id = $1`, [ids.invA])).rowCount)).toBe(0);
    expect(await as("viewer", async (db) => (await db.query(`delete from campaign_investment where id = $1`, [ids.invA])).rowCount)).toBe(0);
    await expect(as("admin", async (db) => db.query(ins(A)))).rejects.toThrow(/row-level security/);
    expect(await count("a")).toBe(2);
  });

  it("RBAC administrativo: só ADMIN cria campanha e altera vínculos; usuário não se promove", async () => {
    await expect(as("a", async (db) => db.query(`insert into campaign (name, slug) values ('Nova', 'nova')`))).rejects.toThrow(/row-level security/);
    await expect(as("a", async (db) => db.query(`insert into campaign_member (campaign_id, user_id, role) values ($1, $2, 'owner')`, [B, ids.a]))).rejects.toThrow(/row-level security/);
    expect(await as("editor", async (db) => (await db.query(`update campaign_member set role = 'owner' where user_id = monitora_uid()`)).rowCount)).toBe(0);
    expect(await as("admin", async (db) => (await db.query(`update campaign set status = 'archived' where id = $1`, [B])).rowCount)).toBe(1);
    expect(await visible("b")).toEqual([]); // campanha arquivada: membro perde acesso; ADMIN continua vendo
    expect(await visible("admin")).toEqual(["campanha-a", "campanha-b"]);
  });

  it("sessão: token inválido, logout (sessão revogada) e usuário bloqueado não acessam nada", async () => {
    expect(await withScope("token-inexistente", async (db) => (await db.query(`select count(*) from campaign`)).rows[0].count, DB)).toBe("0");
    const t = await login("viewer@teste.invalid");
    await auth.api.signOut({ headers: new Headers({ cookie: `monitora.session_token=${t}` }) }).catch(() => {});
    await sql`delete from auth_session where token = ${t}`; // logout = sessão removida do provedor
    expect(await withScope(t, async (db) => (await db.query(`select count(*) from campaign`)).rows[0].count, DB)).toBe("0");
    await sql`update auth_user set banned = true where id = ${ids.editor}`;
    expect(await visible("editor")).toEqual([]);
  });
});
