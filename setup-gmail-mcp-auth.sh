#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

GMAIL_BIN="$PROJECT_ROOT/node_modules/.bin/gmail-mcp"
GMAIL_DIR="${GMAIL_MCP_HOME:-${PROJECT_ROOT}/credentials/gmail-mcp}"
OAUTH_KEYS_PATH="${GMAIL_DIR}/gcp-oauth.keys.json"
CREDENTIALS_PATH="${GMAIL_DIR}/credentials.json"

FORCE_REAUTH="false"
SOURCE_KEYS_PATH=""
CALLBACK_URL=""

usage() {
  cat <<'USAGE'
Usage:
  ./setup-gmail-mcp-auth.sh [--keys /path/to/gcp-oauth.keys.json] [--callback https://your.domain/oauth2callback] [--force]

Options:
  --keys      Copy OAuth client keys into credentials/gmail-mcp/gcp-oauth.keys.json before auth
  --callback  Custom OAuth callback URL (for cloud/reverse-proxy auth flows)
  --force     Force re-auth even if credentials/gmail-mcp/credentials.json already exists
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keys)
      SOURCE_KEYS_PATH="${2:-}"
      shift 2
      ;;
    --callback)
      CALLBACK_URL="${2:-}"
      shift 2
      ;;
    --force)
      FORCE_REAUTH="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

echo "== Gmail MCP OAuth Setup =="
echo "Project root: ${PROJECT_ROOT}"
echo "Credentials dir: ${GMAIL_DIR}"
echo

if [[ ! -x "$GMAIL_BIN" ]]; then
  echo "Error: ${GMAIL_BIN} not found."
  echo "Run: npm install"
  exit 1
fi

mkdir -p "$GMAIL_DIR"

if [[ -n "$SOURCE_KEYS_PATH" ]]; then
  if [[ ! -f "$SOURCE_KEYS_PATH" ]]; then
    echo "Error: --keys file not found: ${SOURCE_KEYS_PATH}"
    exit 1
  fi
  cp "$SOURCE_KEYS_PATH" "$OAUTH_KEYS_PATH"
  echo "Copied OAuth keys to ${OAUTH_KEYS_PATH}"
fi

if [[ ! -f "$OAUTH_KEYS_PATH" ]]; then
  cat <<EOF
Missing OAuth keys file: ${OAUTH_KEYS_PATH}

Create it with Google Cloud Console:
1) Create/select a project
2) Enable Gmail API
3) Create OAuth client credentials (Desktop app recommended)
4) Download the JSON and save it as:
   ${OAUTH_KEYS_PATH}

Then rerun this script.
EOF
  exit 1
fi

if [[ -f "$CREDENTIALS_PATH" && "$FORCE_REAUTH" != "true" ]]; then
  echo "Found existing credentials: ${CREDENTIALS_PATH}"
  echo "Skip auth. Use --force to re-authenticate."
  exit 0
fi

echo "Starting OAuth flow. Browser login is required..."
echo

if [[ -n "$CALLBACK_URL" ]]; then
  GMAIL_OAUTH_PATH="$OAUTH_KEYS_PATH" \
  GMAIL_CREDENTIALS_PATH="$CREDENTIALS_PATH" \
  "$GMAIL_BIN" auth "$CALLBACK_URL"
else
  GMAIL_OAUTH_PATH="$OAUTH_KEYS_PATH" \
  GMAIL_CREDENTIALS_PATH="$CREDENTIALS_PATH" \
  "$GMAIL_BIN" auth
fi

if [[ ! -f "$CREDENTIALS_PATH" ]]; then
  echo "Error: OAuth finished but credentials were not created at ${CREDENTIALS_PATH}"
  exit 1
fi

echo
echo "OAuth setup completed."
echo "Credentials: ${CREDENTIALS_PATH}"
echo "Next step: restart gateway and run Gmail E2E test."
