# Workstation boot and recovery

Install with `bash deployment/workstation-startup/install.sh` after the existing
nine services and their private configurations are installed. This installer
contains no credentials. It enables `ryoko-workstation.target` under the user
manager's default target and adds a ten-second restart delay with no retry cap.
Services remain enabled individually. Explicit `systemctl stop` stays stopped;
`Restart=always` covers process exits, not intentional operator stops.

The target starts Dots, its computer supervisor and Codex delegation bridge,
Dots API edge and Cloudflare tunnel, Agent Chat coordination bridge, independent
host Hermes API and Cloudflare tunnel, and Portal Dashboard. The six build
workers are launched on demand by Dots; boot does not submit jobs or model turns.

`loginctl show-user ryoko -p Linger` must report `Linger=yes` (verified on this
host). This starts the user manager at boot without requiring graphical login.
The installed services use existing filesystem credentials and explicit paths.
Network availability in the system manager is not ordered by a user-manager
network-online target; persistent retries and cloudflared reconnection handle
network delays. No desktop autologin or password storage is introduced.

The edge and tunnel use Wants/After rather than Requires so a Dots restart does
not leave them stopped. The installer updates those base dependency lines because
systemd dependency lists cannot be cleared from a drop-in. Original unit files
are retained as `.service.before-recovery`. The computer retains its existing
PartOf relationship with Dots, so it restarts with Dots.

Checks: all nine units enabled and running, user target enabled, linger enabled,
unit verification, Dots HTTP 200, computer protocol health, real 16-action host
qualification, Dots restart with edge/tunnel staying alive, and an actual tunnel
process kill followed by automatic restart and Cloudflare reconnection.
Public unauthenticated tunnel probes returned 403; this is not an authenticated
end-to-end API test. Existing authentication policies remain unchanged.

The computer build now includes browser modules required by its public-address
policy. Rebuilding changes target fingerprints: rerun the real host qualification
before enabling computer actions; never edit hashes to waive that check.

A power-loss reboot was not performed. Firmware must have Restore on AC Power
Loss / Power On enabled for the physical machine to switch on when power returns.
Disk unlock, if required at boot, is also outside user-service startup.
