#!/bin/bash
# Install recovery policy for existing, already configured workstation services.
set -euo pipefail
units=(ryoko-dots ryoko-computer ryoko-dots-codex-bridge ryoko-dots-api-edge ryoko-dots-tunnel dots-bridge hermes-host-api hermes-host-tunnel portal-dashboard)
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
for unit in "${units[@]}"; do
  test -f "$unit_dir/$unit.service" || { echo "Missing configured unit: $unit" >&2; exit 1; }
done
for unit in "${units[@]}"; do
  mkdir -p "$unit_dir/$unit.service.d"
  cat > "$unit_dir/$unit.service.d/recovery.conf" <<'EOF'
[Unit]
StartLimitIntervalSec=0
[Service]
Restart=always
RestartSec=10
EOF
done
# Keep gateways alive across upstream restarts; Requires would leave them stopped.
# systemd cannot clear dependency lists in a drop-in; update these two base units.
for unit in ryoko-dots-api-edge ryoko-dots-tunnel; do
  test -f "$unit_dir/$unit.service.before-recovery" || cp -p "$unit_dir/$unit.service" "$unit_dir/$unit.service.before-recovery"
  sed -i 's/^Requires=ryoko-dots.service$/Wants=ryoko-dots.service/; s/^Requires=ryoko-dots-api-edge.service$/Wants=ryoko-dots-api-edge.service/' "$unit_dir/$unit.service"
done
cat >> "$unit_dir/ryoko-dots-api-edge.service.d/recovery.conf" <<'EOF'
[Unit]
Wants=ryoko-dots.service
EOF
cat >> "$unit_dir/ryoko-dots-tunnel.service.d/recovery.conf" <<'EOF'
[Unit]
Wants=ryoko-dots-api-edge.service
EOF
cat >> "$unit_dir/dots-bridge.service.d/recovery.conf" <<'EOF'
[Unit]
Wants=ryoko-dots.service
After=ryoko-dots.service
EOF
cat >> "$unit_dir/portal-dashboard.service.d/recovery.conf" <<'EOF'
[Unit]
Wants=ryoko-dots.service dots-bridge.service hermes-host-api.service
After=dots-bridge.service hermes-host-api.service
EOF
{
  echo '[Unit]'
  echo 'Description=Ryoko workstation agents, endpoints and tunnels'
  printf 'Wants='
  printf '%s.service ' "${units[@]}"
  printf '\n[Install]\nWantedBy=default.target\n'
} > "$unit_dir/ryoko-workstation.target"
systemctl --user daemon-reload
systemctl --user enable "${units[@]/%/.service}" ryoko-workstation.target
systemctl --user start ryoko-workstation.target
echo 'Verify loginctl show-user "$USER" -p Linger reports yes; enable lingering if needed.'
