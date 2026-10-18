# Expense ingest recovery and hardening

Goal: Restore missing expenses from available card messages and prevent recurrence when card numbers change, automations resend, or a payment is cancelled.
Architecture: Retain the existing SMS -> Edge Function -> expenses flow. Reuse existing schema and push infrastructure; preserve original rows, recover with preview/backups, and make retries idempotent. Phone automation changes require the owner of each phone.
Tech stack: existing JavaScript/Vitest, Supabase Edge Functions, Python read-only message extraction.
Spec: specs/sms-ingest-pipeline.md plus the user's approved recovery and hardening request.

## Constraints and decisions
- No packages or unrelated refactors. No personal messages, screenshots, credentials, recovery results in the public repository.
- Work in the existing checkout per repository's established main/commit/push workflow; preserve every pre-existing untracked file. No DB migrations unless unavoidable; prefer stable primary-key IDs and existing meta fields.
- Separate actual live ingest health from historical recovery: a backfill must not claim the phone automation recovered.
- Record refunds as negative adjustments only when safely reconciled to a real original payment; retain uncertain cases for review rather than invent expenses.
- Data recovery is authorized. Back up relevant rows, produce dry-run decisions, preserve manually edited rows and tombstones, and verify persisted totals after applying.

## Task 1: SMS processing (agent ownership)
Files: both cardSmsParser.js copies and parser tests; sms-card-ingest/index.ts; new same-directory pure ingestion helpers and tests only.
- [ ] Add failing tests for replacement-card messages, replay with different receive times/line endings, same-day distinct transactions, cancellations and unrelated messages.
- [ ] Parse cancellation safely, stabilize event identity/date for replay, deduplicate existing rows, preserve tombstones/manual edits, return actionable statuses without leaking content.
- [ ] Run affected tests and report remaining constraints. Do not commit/push/deploy; integration is owned by root.

## Task 2: Monitoring and UI (agent ownership)
Files: src/features/card-options.js and test; src/features/expenses.js and related tests; scripts/check-ingest-gap.mjs plus test/helper; send-push/ files and tests; public/push-sw.js and needed tests; ingest-gap-check.yml.
- [ ] Add failing tests for replacement-card family health, historical backfill not resetting live health, known manual channels, malformed rows, repeat alert throttling.
- [ ] Add new card option while retaining historical card; eliminate misleading health classifications.
- [ ] Deliver private app push through existing subscribed devices with service-only authentication, generic text, no message/card data in public issues. Make missing subscriptions/errors explicit.
- [ ] Run affected tests and report remaining constraints. Do not commit/push/deploy; integration is owned by root.

## Task 3: Recovery (root ownership)
Files: scripts/backfill-sms-from-chatdb.py and Python tests; specs/sms-ingest-pipeline.md; private work/ and outputs/ in the chat workspace.
- [ ] Acquire only relevant messages through authorized access, preserve original dates/text, include replacement-card and cancellation messages.
- [ ] Add failing tests for extraction/filtering and safe dry-run/import behavior, then repair the existing script without a hardcoded token.
- [ ] Back up DB, preview inserts/duplicates/cancellations, apply only safe decisions through hardened ingest, rerun to prove idempotency, report unavailable sources explicitly.

## Task 4: Integration and delivery (root ownership)
- [ ] Full Today tests, build, preview browser UI, focused security/correctness review.
- [ ] Deploy functions, push only this session's source changes, check Pages/monitor workflow outcomes and live DB/UI.
- [ ] Summarize restored counts, pending cases, and exact phone automation actions; distinguish deployment from unverified phone behavior.

## Review focus
Cross-owner isolation; ambiguous/partial cancellation; year boundary timestamps; repeated messages vs genuine repeated payments; deleted/manual rows; recovery falsely clearing alerts; private data in public workflow output.
