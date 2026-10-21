# Optional access from another device

The installed service remains bound to loopback. The desktop build does not open
a public listener. Use a private SSH tunnel for the first remote deployment:

```sh
ssh -N -L 4310:127.0.0.1:4310 ryoko@YOUR_WORKSTATION
```

On that client, use `http://127.0.0.1:4310/api/v1` with a credential scoped to the
required Dot. Keeping the local port 4310 preserves the configured request
Host/origin. SSH supplies encryption and machine authentication; the API still
requires its own credential. Stop SSH to close remote access. Dots continues
running on the workstation. Do not bind the tunnel to `0.0.0.0`.

This requires an SSH server and trusted client key configured by the owner.
No SSH service is installed/enabled by the desktop build. A public reverse proxy,
public DNS, and public deployment are outside this local release. Existing TLS
listener support remains separate. Remote API access does not grant computer
control or change agent permissions.
