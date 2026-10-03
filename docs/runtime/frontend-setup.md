# Frontend-only inspection and backend cutover gate

## Current status

FE00–FE11 add a self-hosted **browser consumer**, not a completed self-hosted backend. All `/api/runtime/...` DTOs in `src/shared/runtime/` are strict candidate adapter contracts. The existing Node server still contains legacy Intelligence, model, runner, voice and managed Channels implementations. It must not be presented as a migrated runtime or activated to satisfy the new frontend's readiness checks.

The browser no longer imports CopilotKit providers or calls hosted Intelligence. Its live controls stay unavailable until a qualified same-origin backend issues a matching authenticated scope and capability. Primary Ryoko requires the personal harness; specialists require isolated built-in memory. No fallback writer/planner/scheduler is added.

## Safe local frontend inspection

Use Node 24:

```sh
npm ci
npm run build:frontend
npm run preview:frontend
```

The preview listens only at `http://127.0.0.1:4173`; optional `FRONTEND_PORT` changes its loopback port. It serves static compiled assets with a same-origin CSP and answers every API route with an explicit503 backend-unavailable response. It creates no database, runtime session, credentials, model request, channel binding or scheduled job. This is an inspection tool, not the production gateway and not live feature qualification.

`npm run dev:frontend` starts Vite alone. Its existing development `/api` proxy points at127.0.0.1:4310; attach only an isolated test fixture or separately qualified backend. The old `npm run dev` and `npm start` launch the **legacy server** and are not the migrated self-hosted workflow. Do not supply Intelligence keys to make new runtime readiness green.

## Backend integration contract

BE00 must pin the producer/consumer source pair and qualify service-to-human ownership. BE01 supplies secure authenticated sessions, scope/generation and CSRF/origin checks. BE02–BE10 implement canonical conversations/live output, durable commands/approvals/effects, artifacts, specialist memory/Learning, schedules, executors, media and Slack. See `consumer-contract.md`, `parity-inventory.md` and both build plans. The frontend package does not pretend those endpoints already exist.

Deploy static assets and the qualified gateway behind one origin only after the backend and FE12 acceptance gates pass. No browser runtime/provider secrets or permissive cross-origin proxy are needed. The retained Node server CSP now allows only same-origin connections; a server-to-server legacy service setting cannot inject a browser WebSocket origin. Any necessary realtime transport must be explicitly routed through the qualified same-origin gateway.

## Migration and rollback prerequisites

Inventory conversations, page links, reviews, calls, specialist IDs/grants, legacy memory, Learning enrollment, schedules, artifacts and unresolved effects. Preserve old history read-only where fidelity is incomplete. Never reuse old approvals, silently fan out global memory, autoactivate imported schedules or backfill unknown occurrences.

Persist one sticky runtime owner. Rollback blocks new admissions and preserves accepted Ryoko work, pending writes, immutable versions and uncertain effects; it never resubmits them through DotAgent. Backups and actual restore/rollback drills are backend qualification, not a UI toggle. The settings inventory is read-only; no frontend button performs migration or deployment.

## Dependencies and release evidence

`@copilotkit/react-core` was removed after confirming no source import and no transitive consumer; the lockfile shed308 unused packages. AG-UI remains a type-only rendering shape for transcript compatibility; Tiptap/Markdown/editor foundations remain. CopilotKit/runtime/Channels and TanStack packages are still imported by legacy **server** files and therefore cannot honestly be removed in a frontend-only checkpoint. FE12 audits the compiled browser bundle separately. Backend retirement must remove those packages and legacy startup paths only after migration/recovery proof.

Node24 clean install, format, lint, typecheck, tests and production build are mandatory at FE12. Synthetic UI fixtures can qualify presentation and interaction, not actual runtime ownership, provider costs, media hardware or external delivery. The FE08 transport fixture's two observed502 failures remain visible until resolved or expressly recorded as blocked. Full-parity deployment/cutover requires separate explicit approval after remaining backend/live gates pass.
