# Pomelo — 05 Backend schema

> **Verdict**
> - MVP data lives in Friday's existing Redis-shaped store (ioredis-mock, saved to `data.json` and `logs/*.jsonl`). No new database.
> - Pomelo adds a few record types under a `pomelo:` key prefix, so a later storage switch stays a single adapter.
> - Secrets are never stored. Only 1Password references, grant metadata and SET/UNSET status are kept.

Version: 19 Nov 2026. Field names are EXTRAPOLATED unless noted. Friday's own keys stay untouched.

## 1. Records

| Record | Key | Fields | Written by | Read by |
|---|---|---|---|---|
| thread | Friday session | + `projectTags[]`, `lastActivityAt`, `openedBy` (person or agent id), `parentThreadId?` | Friday core, `open_thread` | rail S3, home S2 |
| run | Friday run (existing) | driver, model, state, tool calls, tokens as reported | Friday runner | Work S7 |
| lane (sub-agent) | Friday lane | + `spawnedBy`, `purpose`, `status` | `spawn_subagent` | chat S4, Work S7 |
| project_tag | `pomelo:tag:<slug>` | `slug`, `label`, `colour?`, `createdBy` | `tag_project`, Amit | rail S3 |
| message / card | Friday log (jsonl) | Friday's existing shape, plus card kinds `chart`, `diagram`, `artifact`, `image`, `widget` | agents, gen-ui | chat S4 |
| artifact | `pomelo:artifact:<id>` | `threadId`, `kind` (html, mermaid, chart, image), `version`, `bodyRef` (file in FRIDAY_HOME/artifacts), `createdAt` | agents | S4, S6 |
| browser_profile | `pomelo:profile:<id>` | `name`, `location` (local or cloud), `cdpUrlName` (env name, not value), `importedFrom?`, `encryptedAtRest: true` | settings, import | browser, S5 |
| browser_job | `pomelo:job:<id>` | `threadId`, `laneId`, `profileId`, `state` (queued, running, waiting, done, failed, cancelled), `steps[]` (masked), `resourceLock` | browser worker | S5, S7 |
| vault_link | `pomelo:vault` | `provider: 1password`, `account` (display name), `vault` (name), `status` (SET, UNSET, LOCKED) | settings | broker |
| secret_ref | `pomelo:ref:<id>` | `opRef` (op:// reference), `allowedOrigins[]`, `field`, `expiresAt?` — never a value | Amit via settings | broker |
| grant | `pomelo:grant:<id>` | `refId`, `origin`, `frame`, `jobId`, `expiresAt`, `revoked` | broker | broker, audit |
| import_run | `pomelo:import:<id>` | `sourceProfile` (label), `targetProfileId`, `sites[]` each with result (imported, expired, incompatible, skipped), `startedAt`, `endedAt` — never cookie values | import flow | S9 |
| skill | Friday skill | existing | Amit, agents | drivers |
| skill_overlay | `pomelo:overlay:<skill>:<family>` | `family`, `bodyRef`, `source` (hand or generated), `reviewed` (bool), `generatedBy` (model role) | adapter | drivers, S8 |
| driver_account | Friday runner accounts | existing, plus `family` | settings | routing |
| voice_turn | `pomelo:voice:<id>` | `threadId`, `sttWhere` (device or server), `ttsProvider`, `durations`, `interrupted` | voice | S10 |
| device | Friday phone pairing | existing (device token, issued once) | pairing | gate S1 |
| audit | Friday log | append-only events: fill, import, grant, revoke, approval | all | Amit |

## 2. Rules

1. Masking happens before storage. `browser_job.steps` and message logs pass through the mask and Friday's `secrets.ts` shield.
2. One writer per resource. `browser_job.resourceLock` holds the profile id, so two jobs never drive the same profile at once (carried X16).
3. References only. `secret_ref` and `grant` never hold values. Cookie values go straight from the companion extension to the profile store and are never written to `pomelo:` keys.
4. Audit is append-only. Nothing is deleted, only marked `revoked`, `archived` or `cancelled`.
5. Sort order: the rail sorts by `thread.lastActivityAt` descending. Every new message, card, approval or sub-agent result updates it.

## 3. Storage switch (Gen 1 gate)

All `pomelo:` access goes through one `PomeloStore` interface with `get`, `set`, `list(prefix)` and `appendLog`. The test ticket compares:

| Option | Cost to build | Rebase risk |
|---|---|---|
| Real Redis (Friday supports it) | Low | Low |
| Postgres/SQLite adapter under the KV interface | Medium–high | Medium |

The decision is Amit's, made after the ticket reports numbers. (A-19)

## 4. Cloud copy

The cloud browser profile lives on the VPS under `/data/cloud-browser/profile`. Profiles move PC → VPS only over the tailnet, encrypted in transit and at rest. The encryption key comes from the vault, by reference. (EXTRAPOLATED mechanism; the path is from the 19 Nov config note)

## Open questions for Amit

1. Should artifacts keep every version or only the latest five? (EXTRAPOLATED: all, until archived.)
2. Should project tags be shared across devices from day one? That needs the cloud server to be the single store.

## Sources

- Friday `src/local/kv.ts` (storage design), `src/secrets.ts`, `src/local/phone.ts`, `src/skills.ts`.
- Spec branch `docs/OWNER-ADDITIONS-20261116.md` (X13–X16).
- Memory note `main/inbox/claude-cowork-friday-config-2026-11-19`.
