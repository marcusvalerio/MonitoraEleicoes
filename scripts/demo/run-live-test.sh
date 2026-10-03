#!/usr/bin/env bash
# DEMONSTRAÇÃO (somente banco de TESTE): espera START_UTC, roda 30 min de replay 2022 → worker → banco test.
# Uso: START_UTC=2026-10-03T19:00:00Z scripts/demo/run-live-test.sh
set -u
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
OUT=.monitora/demo; mkdir -p "$OUT"
start=$(date -d "${START_UTC:?}" +%s)
while [ "$(date +%s)" -lt "$start" ]; do sleep 20; done
echo "início $(date -u +%FT%TZ)"
node scripts/demo/build-replay-2022.mjs >"$OUT/build.log" 2>&1 || test -f "$OUT/replay-2022/data.json"
fuser -k 4600/tcp >/dev/null 2>&1
node scripts/demo/tse-replay-server.mjs --port 4600 --step-seconds 160 --per-step 3 >"$OUT/replay.log" 2>&1 & R=$!
sleep 2
MONITORA_ALLOW_SYNTHETIC=1 MONITORA_TSE_BASE=http://127.0.0.1:4600/oficial \
  node scripts/ingest.mjs --env test --apuracao --year 2022 --offices 1 --interval 20 --kind fixture >"$OUT/worker.log" 2>&1 & W=$!
rm -f "$OUT/timeline.jsonl"
node scripts/demo/measure.mjs --minutes 31 >"$OUT/measure.log" 2>&1
kill $W $R 2>/dev/null
echo "fim $(date -u +%FT%TZ)"
