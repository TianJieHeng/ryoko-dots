#!/usr/bin/env bash
# Workstation launcher: the backend serves the built UI and owns Hermes stdio.
set -euo pipefail
cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")"
export PATH="$HOME/.local/bin:$PATH"
unit=ryoko-dots.service
action="${1:-start}"
if (( $# > 1 )); then
  echo 'Usage: ./run.sh [start|stop|restart|status|logs|build|help]' >&2
  exit 2
fi
case "$action" in
  help|--help|-h)
    cat <<'HELP'
Usage: ./run.sh [start|stop|restart|status|logs|build|help]

start    Start the installed user service, wait for HTTP, and open the UI (default).
stop     Stop the backend and its managed agent processes.
restart  Restart after changing .env or the agent launch configuration.
status   Show service status.
logs     Follow backend/agent supervisor logs (Ctrl-C exits the viewer).
build    Build backend and UI; run ./run.sh restart to load the result.

The backend serves the UI and launches the configured Hermes stdio runtime.
Chat requires RYOKO_CONFIG_PATH in .env and a compatible installed agent/profile.
See docs/local-startup.md. This launcher never starts a second standalone agent.
Set DOTS_NO_BROWSER=1 to skip opening the browser. Services keep running on exit.
HELP
    exit 0 ;;
  stop|status) exec systemctl --user "$action" "$unit" ;;
  logs) exec journalctl --user -u "$unit" -n 60 -f ;;
  build) exec npm run build ;;
  start|restart) ;;
  *) echo "Unknown action: $action (use ./run.sh help)" >&2; exit 2 ;;
esac

[[ -f .env ]] || { echo 'Missing .env; see docs/local-startup.md.' >&2; exit 1; }
[[ -f dist/server/server/index.js && -f dist/client/index.html ]] || {
  echo 'Missing build. Run ./run.sh build first.' >&2
  exit 1
}
if [[ "$(systemctl --user show "$unit" -p WorkingDirectory --value)" != "$PWD" ]]; then
  echo 'The installed ryoko-dots.service must point to this checkout.' >&2
  echo 'See deployment/dots-local.service.example.' >&2
  exit 1
fi
url="$(node --env-file=.env --input-type=module -e '
  const url = new URL(process.env.APP_ORIGIN);
  if (!["http:", "https:"].includes(url.protocol)) process.exit(1);
  process.stdout.write(url.origin);
')"
systemctl --user "$action" "$unit"
node --input-type=module - "$url" <<'JS'
const url = process.argv[2];
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(`${url}/health/live`, {
      signal: AbortSignal.timeout(1000), redirect: 'error',
    });
    if (response.ok) { ready = true; break; }
  } catch { /* Allow the supervisor time to boot. */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ready) {
  console.error('Backend did not become healthy. Inspect ./run.sh logs');
  process.exit(1);
}
JS
printf '\nDots UI and backend: %s\n' "$url"
node --env-file=.env --input-type=module <<'JS'
import { existsSync } from 'node:fs';
const config = process.env.RYOKO_CONFIG_PATH;
if (!config || !existsSync(config)) {
  console.log('Hermes chat is NOT configured. Set RYOKO_CONFIG_PATH to a compatible agent launch configuration, then ./run.sh restart.');
} else {
  console.log('Open a conversation to chat with Ryoko. The agent connects automatically.');
}
if (process.env.OWNER_TOKEN_FILE) {
  console.log('Sign in with your Dots password.');
}
JS
if [[ "${DOTS_NO_BROWSER:-0}" != 1 ]] && command -v xdg-open >/dev/null; then
  xdg-open "$url" >/dev/null 2>&1 &
fi
