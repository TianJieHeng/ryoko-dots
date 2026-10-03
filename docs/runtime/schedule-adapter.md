# Conversation schedules (BE07)

Dots stores authenticated schedule intent and recovery receipts. Ryoko owns the
immutable definition, occurrence clock, atomic occurrence/command admission,
remaining authorization budget, execution queue and retained result outbox.
There is no Dots schedule timer or fallback model loop.

The reviewed producer is `98b9eeb7d2afc02d0e0393fea285f010000a0378`.
The exact generated TypeScript/OpenRPC digests are recorded in both consumer
provenance files. BE06 selected contracts remain unchanged under this producer;
BE07 adds the typed observed scheduler status and existing schedule operation subset.

## Authority and routes

The owner must explicitly connect a canonical conversation. For a conversation
already bound to a Space, its verified project is used. Otherwise the current
producer agent configuration must name an explicit default project, mapped by
server-owned `identityProjects` (or `nativePages.projects`) to an authorized
Space. A display Space fallback is insufficient. Every schedule operation
rechecks live session enrollment, project owner, the explicit current agent grant,
local authority revision and transport epoch. The browser cannot choose a
runtime project, principal or replacement session.

Authenticated routes (all under `/api`):

- `GET /runtime/conversations/:id/schedules`: bounded snapshot, at most 100
  schedules for that exact canonical conversation, always `complete:false`
- `GET /runtime/conversations/:id/schedules/:scheduleId`: raw bounded producer
  evidence, including at most 50 occurrences and explicit truncation/total count
- `GET /runtime/conversations/:id/schedules/scheduler`: read-only scheduler proof
- `POST /runtime/conversations/:id/schedules`: create an immutable paused version
- `POST /runtime/conversations/:id/schedules/:scheduleId/actions`: edit, pause,
  resume, cancel future admissions, or run now
- `GET /runtime/operations/:operationId`: inspect the original receipt without
  replaying work

Mutations carry a UUID operation ID, canonical intent digest, expected authority
generation and expected schedule revision. All mutation families share one durable
operation namespace. Identical retries inspect the original result; changed intent
or authority conflicts. A lost response is `outcome_unknown` until the producer's
original receipt can prove its outcome.

Creation never activates. Editing requires pause and creates the next immutable
definition version. One-time `at`, fixed anchored `interval` and timezone-aware
`calendar` triggers are preserved. Calendar inputs specify Monday=0 weekdays,
repeated-clock fold selection (`first` or `second`) and missing-clock `gap:skip`.
Legacy interval-only payloads are accepted; explicit at/calendar payloads must not
invent an interval. Next due time is always producer evidence.

Pausing/cancelling future admissions does not cancel an already-running mission.
Run-now is allowed only for an active, nonexpired, nonexhausted, reconciled schedule
and retains its original command identity on retry. Delivery retry belongs to the
retained result outbox and never re-runs the occurrence.

## Scheduler ownership and deployment

The producer scheduler is off by default. An operator may explicitly configure
this server-owned Ryoko profile after reviewing its existing cron jobs:

```yaml
cron:
  stdio_scheduler:
    enabled: true
    interval_seconds: 60
```

This enables the existing ordinary Ryoko cron ticker for the entire profile,
including legacy Ryoko cron jobs. It does not enable the old Dots runner. Do not
change or activate a real user's profile as part of adapter setup or testing.

Activation/run-now require the typed `runtime.schedule.scheduler.status` response
to prove fresh running maintenance and an actual successful owned tick. A config
flag alone is insufficient. The producer retains its shared profile cron file
lock, gateway stand-down, owner retirement, ESTOP and durable admission fences.
Status reads never dispatch or start the scheduler. Restart/offline catch-up is
solely the stored missed-run policy; a browser refresh never manufactures work.
A live owned canonical conversation is still required for execution.

## Legacy Dots jobs

Browser import/cutover is unavailable. The server-only migration connector must
first freeze actual legacy new admissions, reconcile every old active/interrupted
claim, and retain a stable source/run-ID mapping. It prepares a paused imported
schedule with explicit trusted timezone/trigger/standing-authorization settings;
legacy fields do not imply those permissions. Cutover requires durable old-runner
retirement evidence and does not activate the new schedule. The freeze is permanent
and database-enforced, including through old Store connections.

A trusted retirement attestation is not independent producer verification:
`foreign_cutover_verified:false` remains visible. Historical legacy timestamps use
recorded run admission time because the old store did not retain original due
instants. Imports requiring more history than the bounded exact mapping allow
must be reconciled separately rather than silently truncated.

## Focused qualification

`tests/runtime-schedule-service.test.ts` exercises immutable recurrence, duplicate
intent, global namespace collisions, response loss/recovery, current scheduler
proof, remaining budget, exact occurrence states, and trusted migration gates.
`tests/self-hosted-schedules.test.ts` is an opt-in real owner-authenticated
HTTP → pinned stdio Python → real periodic ticker/lock → queue → synthetic
loopback model execution fixture. It tests two recurring occurrences, restart
between due times, retained receipts, and conversation isolation. It does not
contact a live model provider, activate user schedules, migrate user jobs, or
qualify a deployment host or external delivery provider.

Run the real fixture with the reviewed checkout and supported interpreter:

```sh
RYOKO_TEST_PYTHON=/path/to/python3.14 \
RYOKO_TEST_CHECKOUT=/path/to/pinned/ryoko-agent \
npx vitest run tests/self-hosted-schedules.test.ts
```
