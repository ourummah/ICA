# Blockchain-verified audit trail

Every finished clean is **sealed**: the server builds a canonical record of it, stores the exact
bytes, and fingerprints them with SHA-256. Each night the day's fingerprints are combined into one
Merkle root, which is **anchored** on the Base blockchain in a single transaction. Anyone with a
record's verification bundle can then check, without trusting ICA, that the record existed exactly
as it is no later than the block time.

Only hashes go on-chain. No names, sites, customers, notes or photos.

## Pieces

| Piece                                              | Where                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Canonical record and hashing                       | `src/lib/seal/record.ts`, `src/lib/seal/canonical.ts`                                              |
| Sealing (finished cleans, amendments)              | `src/lib/seal/seal.ts`, `seal_record()` in `supabase/migrations/20261125001000_sealed_records.sql` |
| Merkle tree                                        | `src/lib/anchor/merkle.ts`                                                                         |
| Contract                                           | `contracts/ICAAnchor.sol`, compiled into `src/lib/anchor/contract-artifact.ts`                     |
| Anchoring job (batching, sending, retries, alerts) | `src/lib/anchor/service.ts`, cron `GET /api/cron/anchor`                                           |
| Public verify page                                 | `/verify/<record id>` (QR code on each task in the audit pack PDF)                                 |
| Bundle checker page                                | `/verify`                                                                                          |
| API                                                | `GET /api/verify/<id>`, `GET /api/verify/<id>/bundle` (staff), `POST /api/verify/bundle`           |
| Standalone verifier                                | `verifier/verify-ica.mjs` and `verifier/README.md`                                                 |
| Admin screen                                       | `/app/admin/anchoring` ("Record seals")                                                            |

## Record lifecycle

1. **Recording.** Cleaners' step records sync as before (append-only, in the site audit chain). A
   step's photo hash is now part of the step record itself (`photo_sha256`), taken on the phone
   when the photo is captured, so the record commits to the exact photo bytes before the upload.
2. **Sealed.** A clean is finished when its task is completed, sent back for re-clean or verified,
   or its shift ended over an hour ago with at least one record. After each sync (and before every
   nightly batch) the server builds the canonical record and calls `seal_record()`, which:
   - checks the record against the site's seal chain (`prev_site_record_hash` must be the current
     head, under a per-site lock);
   - computes `record_hash = sha256(utf8(canonical_text))` in the database and stores the exact text;
   - writes the seal into the existing site audit hash chain (`audit_events`) as well.
     A sealed record can never be updated or deleted (database trigger, for every role). The only
     change allowed is setting `batch_id` and `merkle_proof` once, from empty.
3. **Amended.** A step record or photo that arrives after sealing (late sync, a correction that
   supersedes a step) leads to a new sealed record of type `amendment` with `amends_record_hash`
   pointing at the previous seal. The original stays. The task page shows the latest version and
   its history; the verify page of an older version links to the newer one.
4. **Batched** by the nightly job: all unbatched seals, sorted by hash, in one Merkle tree. Each
   record stores its proof. `create_anchor_batch()` refuses a record that is already in a batch.
5. **Anchored.** The root is sent to the contract; once confirmed the batch stores the transaction,
   block number and block time, and its records show **Verified ✓**.

## Canonical record (`ica.audit.v1`)

RFC 8785 JSON Canonicalization Scheme (the `canonicalize` package; the standalone verifier has its
own 20-line copy, and the tests check both agree). Times are UTC ISO strings. Numbers are integers.

```json
{
  "schema": "ica.audit.v1",
  "record_id": "uuid",
  "record_type": "audit | amendment",
  "amends_record_hash": "hex | null",
  "site_id": "uuid",
  "prev_site_record_hash": "hex | null",
  "task": {
    "task_id": "uuid",
    "shift_id": "uuid",
    "shift_date": "2026-11-25",
    "zone_id": "uuid",
    "equipment_id": "uuid",
    "ssop_id": "uuid",
    "ssop_version": 3,
    "assigned_profile_id": "uuid",
    "status": "completed",
    "reclean_of_task_id": null
  },
  "started_at_device": "…",
  "submitted_at_device": "…",
  "received_at_server": "…",
  "sealed_at_server": "…",
  "items": [
    {
      "step_record_id": "uuid",
      "step_no": 1,
      "step_type": "foam",
      "profile_id": "uuid",
      "device_id": "uuid",
      "result": "done | skipped | failed",
      "skip_reason": null,
      "note": "as written",
      "note_language": "tl",
      "atp_value": 85,
      "atp_pass_max": 150,
      "timer_started_at": "…",
      "timer_ended_at": "…",
      "device_started_at": "…",
      "device_completed_at": "…",
      "server_received_at": "…",
      "payload_hash": "hex (the device's own record hash)",
      "chain_hash": "hex (the record's link in the site audit chain)",
      "supersedes_step_record_id": null,
      "photo_hashes": ["sha256 hex"]
    }
  ],
  "chemicals": [{ "step_no": 4, "chemical_id": "uuid", "product": "…", "dilution": "3%" }],
  "nonce": "32 random bytes, hex"
}
```

Differences from the original spec, because of how ICA records cleans: the record is one clean
(task), not a free-form audit form; people are ids (never names); GPS and chemical batch numbers
aren't captured by the MVP, so they're not in the record; there are no sign-offs at task level (QA
release decisions stay in the audit chain). Device time and server time are both kept.

## Merkle rule

Leaves are the 32-byte record hashes, sorted ascending. A parent is
`sha256(min(a, b) || max(a, b))` over raw bytes. An odd node at the end of a level is promoted
unchanged. A single record is its own root. A proof is the list of siblings from the leaf up.

## Anchoring and retries

- Contract `ICAAnchor`: `anchor(batchId, root, recordCount)` emits `Anchored`; only the deploying
  wallet may call it; no storage. A stolen key can only add events, never change past ones.
- The job signs the transaction first and saves its hash and raw bytes before broadcasting, so a
  crash can never lose track of a sent transaction.
- Every run first checks all transactions a batch has sent. Unconfirmed after 10 minutes: replaced
  with the same nonce and fees raised 25%. After 5 attempts: `failed`, plus an alert. A failed batch
  can be retried from the admin screen; earlier transactions are still checked first.
- Alerts (email through Resend to `ANCHOR_ALERT_EMAIL`, always logged): failed batch, a batch
  still unanchored 2 hours after creation, wallet below `ANCHOR_MIN_BALANCE_ETH` (default 0.002).
- Only one job runs at a time (a lease row), so the cron and "anchor now" can't double-send.
- Vercel Cron runs `GET /api/cron/anchor` daily at 14:15 UTC (00:15 AEST; 01:15 during daylight
  saving). It needs `CRON_SECRET`.

## Verification

- **Verify page** (`/verify/<id>`, public, rate limited): Verified ✓ / Sealed, pending anchoring /
  ❌ Mismatch. Shows a site alias (`Site` + 6 hex characters derived from the site id), shift date,
  step results counts, record hash, Merkle root, batch, block time and the Basescan link. The
  server recomputes the record hash and the proof on every view.
- **Bundle** (`ica.verify.v1`): canonical record, record hash, proof, root, chain, contract,
  transaction and batch id. It contains the whole record, so it needs a staff sign-in.
- **Bundle checker** (`/verify`, `POST /api/verify/bundle`): re-checks everything, including the
  event on-chain through a public RPC, and says whether ICA still holds the record.
- **Standalone verifier**: `node verifier/verify-ica.mjs bundle.json`. No dependencies, no ICA
  servers. See `verifier/README.md`.
- **Site chain indicator** on the supervisor board: "Record seals: N linked, no gaps", or a red
  alert when a seal is missing or altered (`verify_seal_chain()`).
- **Audit pack PDF**: each task shows its shortened record hash, anchor date and a QR code to its
  verify page; the cover counts sealed and anchored cleans.

## Decisions (open questions in the spec)

1. **Database:** Supabase. Sealing logic that must be trusted (chain head check, hashing,
   immutability) is in Postgres; JCS canonicalisation is in TypeScript on the server.
2. **One batch per day across all customers.** Cheapest (one transaction a day) and every record
   still gets its own proof. Per-customer batches can be added later without changing records.
3. **Public verify page:** site alias, shift date and pass/fail counts only. Names, notes, photos
   and the full record need a staff sign-in (bundle download).
4. **Certificates** (training venture): not built. The sealing, batching and anchoring code is
   generic over "a canonical record with a hash"; a certificate would be a new record schema
   feeding the same batches.

## Not done yet

- **Base mainnet.** Needs a mainnet contract deploy from a funded wallet and a go-ahead. Code
  change: add `base` to `ANCHOR_CHAINS` in `src/lib/anchor/config.ts` and make it selectable.
- **OpenTimestamps** second anchor (phase 2). `anchor_batches` has no column for it yet.
- **Object versioning / Object Lock** on the photos bucket: Supabase Storage doesn't offer it.
  Originals are uploaded with `upsert: false`, so they're never overwritten, and thumbnails are
  generated on the fly, never stored over originals.
- Backups of `canonical_text` and proofs rely on Supabase's database backups.
- The standalone verifier lives in this repository; publish `verifier/` as its own public
  repository (or gist) so auditors can fetch it without access to this one.
