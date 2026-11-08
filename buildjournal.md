# Build journal

## 2026-11-08 — Portal scoped native approvals

Implemented explicit `read`/`decide` approval grants independent of chat write permission. Existing credentials receive no approval authority. Added scoped pending-request, decision and operation-receipt routes to the hub and private API edge. Decisions bind the exact native conversation, run and request version; current credentials are checked before dispatch. Durable intent precedes native effects, and a unique target fence blocks duplicate decisions even with a new operation ID after an uncertain outcome. The original owner-only routes remain private.

Validated locally: TypeScript check, 15 hub/API-edge tests and server build passed. Fixtures cover denied ordinary credentials, stale versions, exact-run binding, one-effect replay, altered-payload rejection, revoked credentials and acknowledgement-loss fencing. No CI. No real approval was decided.

Deployed on this Dots host after an online SQLite backup with integrity verification and confirmation of no active hub runs. Portal enrolled four runtimes with private scoped credentials outside Git. Claude, Codex and Kimi expose native approvals; Hermes does not. Agent Chat changes are maintained in its separate local clone and pushed for owner deployment on that device.
