#!/bin/bash
# SessionStart hook: makes the `playwright-cli` skill usable in Claude Code cloud sessions.
# Installs the pinned @playwright/cli globally (the container image lacks it). Chromium is
# preinstalled in /opt/pw-browsers, so no `playwright install` is ever run here.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PW_CLI_VERSION="0.1.23"

# playwright-cli defaults to the Chrome channel, which is not in the image; point it at the
# preinstalled Chromium for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -e /opt/pw-browsers/chromium ]; then
  {
    echo 'export PLAYWRIGHT_MCP_BROWSER=chromium'
    echo 'export PLAYWRIGHT_MCP_EXECUTABLE_PATH=/opt/pw-browsers/chromium'
  } >> "$CLAUDE_ENV_FILE"
fi

if command -v playwright-cli >/dev/null 2>&1 \
   && [ "$(playwright-cli --version 2>/dev/null | tr -d '[:space:]')" = "$PW_CLI_VERSION" ]; then
  exit 0
fi

npm install -g --no-fund --no-audit --loglevel=error "@playwright/cli@${PW_CLI_VERSION}" >&2
