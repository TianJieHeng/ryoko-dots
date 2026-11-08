# Portal approval API

Owner credential creation accepts `approvals: "none" | "read" | "decide"` (default `none`). Grants are independent of chat `write`, scoped to the credential's Dot IDs and revoked with the credential. Owner credential listing exposes the grant. Do not distribute owner cookies or passwords to Portal.

- GET `/api/v1/conversations/:id/approvals`: pending native requests, run binding, opaque SHA-256 version, actionability and remote-decision capability.
- POST `/api/v1/conversations/:id/approvals/:approvalId/decision`: strict JSON `{operationId,runId,expectedVersion,decision}`; UUID operation, exact 64-hex version and `accept`/`reject` decision.
- GET `/api/v1/approval-operations/:id`: credential-owned durable outcome receipt.

A decision requires a native adapter with approval support and an active run matching the pending native turn. Ordinary write credentials cannot approve. A stale request returns 409. Same-ID identical completed retries return the receipt; changed requests or unresolved outcomes conflict. Different IDs targeting the same version also conflict, preventing duplicate native effects after an acknowledgement loss. Inspect uncertain outcomes; never automatically replay them. Native adapter failure can leave a durable unknown receipt that requires source inspection.

Claude, Codex and Kimi currently expose approval APIs. Hermes reports unsupported. The API edge exposes only these scoped endpoints; the legacy owner-only decision path stays excluded. Portal presents explicit human Accept/Reject controls; navigation and notification reads never make decisions.
