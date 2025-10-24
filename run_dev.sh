#!/usr/bin/env bash
set -euo pipefail

# Allow overriding via environment variables, but default to local ./data tree
WHISPERX_ENV=${WHISPERX_ENV:-"./data/whisperx-env"}
DATABASE_PATH=${DATABASE_PATH:-"./data/scriberr.db"}
UPLOAD_DIR=${UPLOAD_DIR:-"./data/uploads"}

echo "→ ensuring data directories exist"
mkdir -p "$(dirname "$DATABASE_PATH")" "$UPLOAD_DIR" "$WHISPERX_ENV"

echo "→ launching Scriberr (Go server)"
WHISPERX_ENV="$WHISPERX_ENV" \
DATABASE_PATH="$DATABASE_PATH" \
UPLOAD_DIR="$UPLOAD_DIR" \
go run cmd/server/main.go
