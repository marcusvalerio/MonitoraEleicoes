import { handle, ok } from "../_lib/respond";

/** Fontes, status, contagem de registros e relatório de ingestão. */
export const GET = () => handle((repo) => ok(repo.getSources(), { status: repo.getDataStatus(), ingestion: repo.getReports() }));
