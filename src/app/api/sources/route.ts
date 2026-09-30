import { handle, ok } from "../_lib/respond";

/** Fontes, status, contagem de registros e relatório de ingestão. */
export const GET = () => handle(async (repo) => ok(await repo.getSources(), { status: await repo.getDataStatus(), ingestion: await repo.getReports() }));
