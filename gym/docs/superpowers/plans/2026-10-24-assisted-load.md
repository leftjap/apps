# Assisted Chin Correction Implementation Plan

**Goal:** Keep entered assistance unchanged, show an estimated `(bodyweight − assistance) × reps`, and preserve records and unrelated exercise behavior.

**Architecture:** Optional per-set `weightMode = assistance` and `bodyWeightKg` capture new record semantics. Pure display projections recognize legacy custom assisted chin/pull-up names without rewriting stored history or inventing bodyweight. External volume totals exclude assisted estimates; assisted estimates are labeled separately. The approved current fallback is 73kg from 2026-10-24, superseded by actual new weigh-ins and never inserted into weigh-in history.

**Spec:** User-approved delegated request and research: Hevy assisted convention; machine model unknown, so no platform offset or exact-work claims. No device reset/uninstall. Existing 329cd1e6 changes must remain.

## Global Constraints

- Snapshot bodyweight only for new/touched unfinished assisted sets; never copy a previous record's snapshot into new presets.
- Unknown historical bodyweight remains unknown; do not reinterpret 40kg assistance as 400kg external volume or fabricate 330kg for old records.
- Ordinary external-weight PRs and e1RM are disabled for assisted exercises; lower assistance at equal reps is a favorable comparison.
- New metadata travels inside the existing session blocks JSON; no server schema or permission change.
- Native/model tests use dedicated UserDefaults and denied network/keychain. Reset tests are simulator-only. Verify the physical iPhone 11 Pro again before update.

## Review Focus

1. Legacy custom ID and exact name recognition, including the existing 어시스티드 친, without changing unrelated chin-up/bodyweight exercises.
2. 0 assistance, assistance above bodyweight, missing/invalid bodyweight, and ordinary 40×10 unaffected.
3. Future bodyweight changes, copied presets, and edits to an existing record must not rewrite snapshots or raw history.
4. Every volume/PR display must exclude legacy assistance from ordinary totals and avoid presenting assistance increase as improvement.
5. Native/web persistence must round-trip optional metadata and keep all existing records and IDs.

### Task 1: Native semantics and history-safe projections

- [x] RED: Decode assistance JSON with existing APIs and prove current volume/PR behavior is incorrect.
- [x] Add optional set metadata and a pure assisted-load calculator/projection, plus the precise legacy exercise resolver.
- [x] Wire new-set snapshot capture, ordinary-total exclusion, assisted estimate summaries, PR suppression, and labeled UI.
- [x] Verify regression tests including history immutability and bodyweight-change stability.

### Task 2: Web parity

- [x] RED: Add numeric/persistence/PR tests for assisted semantics.
- [x] Share a pure calculator across session, summary, history and calendar totals; preserve new fields when editing/committing.
- [x] Label assistance/estimates and suppress e1RM/high-weight UI and PR persistence for assisted exercises.
- [x] Run affected web tests and production build.

### Task 3: Native verification, review, and device update

- [x] Run isolated native suite, simulator-only assisted entry/save/summary/history UI checks, and visual QA.
- [x] Perform a fresh review of the complete change and fix material findings with regression tests.
- [ ] Build/sign the physical target, inspect the current primary checkout, and integrate only this task's files.
- [ ] Verify iPhone 11 Pro identity, make a fresh private record backup, update-install without reset, and compare all raw records.

Ruling: A separate temporary worktree is used because the primary checkout has an automatic device re-sign/install job; unfinished code must not be eligible for that job. The approved checkout remains the integration target.

Ruling: Undo/recommit is an edit of an existing set, so an explicit assistance mode with a missing bodyweight stays unknown. A newly added set/preset has no such marker and captures the current applicable bodyweight. This avoids inventing historical bodyweight; a user who actually performs another set records it as a new set.

Verification: native 379 and web 716 initially passed; independent review found two web paths and the undo-provenance edge. Each now has a RED regression followed by a single fix pass and full-suite verification. Physical device availability is checked separately.

Final fix pass: web 719/719 and native 88+292 = 380/380 passed. Ordinary exercises and prior additions remain covered. Existing OAuth URL test remains excluded under keychain isolation. Physical iPhone 11 Pro was unavailable; no device update was attempted.
