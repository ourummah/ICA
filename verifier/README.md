# verify-ica

An independent verifier for Intelligent Cleaning Audit (ICA) records. It checks that a cleaning
record has not been changed since it was sealed, and when it was anchored on the Base blockchain,
**without trusting ICA's servers**. It is one file with no dependencies, so you can read all of it.

## Use

1. Get the record's verification bundle (`ica-verification-<id>.json`) from the site. Staff
   download it from the record's verify page.
2. Run, with Node.js 18 or later:

   ```sh
   node verify-ica.mjs ica-verification-<id>.json
   ```

   It uses the public Base node for the bundle's chain (`https://sepolia.base.org` for Base
   Sepolia, `https://mainnet.base.org` for Base). To use your own node, add `--rpc <url>`.

Output ends with `PASS` and the block time ("existed no later than"), `FAIL`, or `PENDING` (the
record is sealed but not in a daily batch yet). Exit codes: 0 pass, 1 fail, 2 pending.

## What it checks

1. **Record hash.** `sha256(JCS(canonical_record))` equals `record_hash`. JCS is the RFC 8785
   JSON Canonicalization Scheme, so the same record always gives the same bytes. Change one
   character of the record and the hash no longer matches.
2. **Merkle proof.** Starting from `record_hash`, each sibling in `merkle_proof` is combined as
   `sha256(min(a, b) || max(a, b))` over the raw 32-byte values. The result must equal
   `merkle_root`. (Leaves are sorted ascending; an odd node at the end of a level moves up
   unchanged.)
3. **On-chain anchor.** The transaction `tx_hash` succeeded and the contract `contract_address`
   emitted `Anchored(batchId, root, recordCount)` with `batchId = batch_id` and
   `root = merkle_root`. The event topic is
   `keccak256("Anchored(uint256,bytes32,uint256)") = 0x770041f1…73ed`.

Photos are covered too: each step lists the SHA-256 of its original photo (`photo_hashes`), so
`sha256sum photo.jpg` must give a hash in the record.

## What it proves, and what it doesn't

- It proves the record existed, exactly as it is, no later than the block time, and that ICA
  can't have edited it since without the check failing.
- Check that `contract_address` is ICA's published contract address. The contract only lets
  ICA's anchoring wallet emit events, and it can't change past events.
- It does not prove the cleaning itself was done well: it proves the record of it is unaltered.
- The bundle contains the full record (notes and people's ids), so share it only with people who
  should see it. Only hashes are ever on the blockchain.

Licence: MIT.
