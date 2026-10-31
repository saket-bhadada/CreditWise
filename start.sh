#!/usr/bin/env bash
# CreditWise - one-command local launcher (macOS / Linux).
#   ./start.sh              install what is missing, then start all three services
#   ./start.sh --retrain    force re-training of the model bundle first
# Starts: FastAPI ML service :8000, Express gateway :5001, Vite frontend :5173
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PY="${PYTHON:-python3}"
LOGS="$ROOT/logs"; mkdir -p "$LOGS"
RETRAIN=0; [[ "${1:-}" == "--retrain" ]] && RETRAIN=1

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"; }

need "$PY"   "Install Python 3.10+ (https://www.python.org/downloads/ or: brew install python)."
need node    "Install Node.js 18+ (https://nodejs.org/ or: brew install node)."
need npm     "npm ships with Node.js."
need curl    "curl is required for health checks."
"$PY" - <<'PYV' || die "Python 3.10 or newer is required."
import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)
PYV

# ---- 1. Python environment -------------------------------------------------
if [[ ! -d .venv ]]; then say "Creating Python virtual environment (.venv)"; "$PY" -m venv .venv; fi
# shellcheck disable=SC1091
source .venv/bin/activate
REQ_HASH="$(shasum ml_service/requirements.txt | cut -d' ' -f1)"
if [[ ! -f .venv/.deps-"$REQ_HASH" ]]; then
  say "Installing Python dependencies (first run takes a few minutes)"
  pip install --quiet --upgrade pip
  pip install --quiet -r ml_service/requirements.txt
  touch .venv/.deps-"$REQ_HASH"
fi

# ---- 2. Data + model bundle ------------------------------------------------
mkdir -p ml_service/data ml_service/saved_models
if [[ ! -f ml_service/data/accepted_2007_to_2018Q4_sample.csv && -f accepted_2007_to_2018Q4_sample.csv ]]; then
  say "Copying sample dataset into ml_service/data/"
  cp accepted_2007_to_2018Q4_sample.csv ml_service/data/
fi
bundle_ok() { (cd ml_service && python -c "import joblib; joblib.load('saved_models/artifacts.joblib')" >/dev/null 2>&1); }
if [[ $RETRAIN -eq 1 ]] || ! bundle_ok; then
  say "Training models (a bundle is missing or was built with different library versions)"
  (cd ml_service && python train_pipeline.py) || die "Training failed. On macOS XGBoost needs OpenMP: brew install libomp"
fi

# ---- 3. Node dependencies --------------------------------------------------
[[ -d backend/node_modules  ]] || { say "Installing gateway dependencies";  (cd backend  && npm install --no-audit --no-fund --silent); }
[[ -d frontend/node_modules ]] || { say "Installing frontend dependencies"; (cd frontend && npm install --no-audit --no-fund --silent); }

# ---- 4. Start services -----------------------------------------------------
PIDS=()
cleanup() { echo; say "Stopping services"; for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

for port in 8000 5001 5173; do
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/"; then die "Port $port is already in use. Stop the other process first."; fi
done

say "Starting FastAPI ML service on http://localhost:8000"
(cd ml_service && exec python app.py) >"$LOGS/ml_service.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 90); do curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1 || die "ML service did not start. See logs/ml_service.log"

say "Starting Express gateway on http://localhost:5001"
(cd backend && exec env PORT=5001 node server.js) >"$LOGS/gateway.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:5001/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://127.0.0.1:5001/health >/dev/null 2>&1 || die "Gateway did not start. See logs/gateway.log"

say "Starting frontend on http://localhost:5173"
(cd frontend && exec ./node_modules/.bin/vite --host 127.0.0.1 --port 5173) >"$LOGS/frontend.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1 && break; sleep 1; done

printf '\n\033[32mCreditWise is running.\033[0m  Open  http://localhost:5173\n'
printf 'Logs: %s/{ml_service,gateway,frontend}.log      Press Ctrl+C to stop everything.\n\n' "$LOGS"
wait
