import { assertTestDatabase, type Sql } from "./db";

const TABLES = ["debate_control_event", "debate_control", "segment_topic", "analysis", "transcript_segment", "speaker", "social_mention", "social_post", "social_metric", "geo_observation", "media_asset", "data_quality_report", "debate_participant", "debate_block", "debate", "entity_identifier", "candidate", "party_visual_identity", "party", "electoral_result", "ingestion_error", "raw_record", "source_record", "ingestion_checkpoint", "ingestion_job", "ingestion_run", "source", "dataset"];

/** Limpa o banco de TESTE. Recusa qualquer banco cujo marcador não seja 'test'. */
export async function resetTestDatabase(sql: Sql) {
  await assertTestDatabase(sql);
  await sql.query(`truncate ${TABLES.join(", ")} restart identity cascade`);
}
