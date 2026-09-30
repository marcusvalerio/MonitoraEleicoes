# Proveniência de dados (eleições e social)

Complementa `PROVENANCE.md`.

- **TSE**: `import_batch` guarda URL, SHA-256 do arquivo, contagens e notas (ex.: coluna de 2014). Cada candidatura aponta para
  `source_record` `tse:<tipo>:<ano>` no dataset `tse-oficial`.
- **Social**: cada conteúdo tem `source_record_id` → `raw_record` (payload bruto imutável, schema versionado:
  `youtube.video/v1`, `youtube.video-stats/v1`, `youtube.comment/v1`), `provider_id`, `collected_at`, `content_hash`, `version`.
  Métricas têm `metrics_at` próprio e não criam nova versão do conteúdo.
- **Análises**: separadas do RAW, com `analysis_version` (`social-rules/1.0.0`) e evidência por vínculo de entidade.
- **Cobertura**: `social_collection_window` registra cada janela por fonte e monitor com status; é a base de “não coletado”.
- **Ambientes**: dados de fixture usam `dataset.kind = fixture` e só entram em test/dev; produção recusa. Migrações 0003–0007
  aplicadas somente em test e dev.
- **Segredos**: somente variáveis de ambiente (`.env.example` lista nomes, sem valores).
