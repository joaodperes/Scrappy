# Cloud-first Google profiles and one active game session

Status: source implemented on the offline-feature PR branch; browser and deployed
Firestore-rule verification still required. This uses the existing Firebase
Authentication and Firestore Spark setup, not a new server or paid tier.

## Player-facing behavior

- Google sign-in identifies the owner of `player_profiles/{uid}`.
- Signing into a second browser **does not by itself end** a running game.
- Pressing Play to start Survival or a local robot match takes ownership of a
  single `activeSession` lease on that same account document.
- A second browser's Play request asks the old browser to synchronize pending
  progress and yield. The old browser receives a visible takeover message and
  exits gameplay. A crashed or disconnected old browser cannot permanently
  block the new one: takeover continues after a bounded grace period.
- When leaving a match or returning to the menu, the game attempts to flush
  progression and releases the lease. Firebase Google authentication is not
  remotely revoked. The old browser may choose to Play again and take control.
- Menu shows `CLOUD SAVED` or `SYNC PENDING (RECOVERY BUFFERED)`.

## Storage and reconciliation

- Firestore is authoritative. The former `botarena_profile` full local cache
  is no longer used as a competing source of current progress.
- `js/progression.js` keeps a working memory copy, and a **UID-scoped pending
  journal** in browser localStorage ONLY while there are unacknowledged edits.
  Its snapshot includes a cloud baseline, local changes and any in-flight
  checkpoint. The journal is cleared following a confirmed cloud receipt.
- The browser also retains a small stable per-account device ID and monotonic
  receipt sequence. Cloud `profileSyncReceipts` is a bounded map of acknowledged
  device versions (64 distinct devices max; fail closed instead of pruning
  evidence of a previously acknowledged recovery).
- Save writes are serialized within the tab and executed as Firestore
  transactions. Each transaction verifies the Google UID and `activeSession`
  ownership, reconciles positive XP/stat deltas against the saved baseline,
  preserves unrelated unlocks, caps weapon XP and updates the receipt
  atomically. Replaying a pending snapshot after a lost acknowledgment
  does not award XP twice.
- Quest currency claims are their own Firestore transactions, checking the
  claimed-period record again on the cloud snapshot. The UI waits for the
  transaction before showing a successful reward. Shop purchases retain
  their existing separate idempotent `shopWallet` transaction.
- The old unscoped profile cache is imported once for a matching UID,
  conservatively using max/union rather than inventing additive historic XP.
  Wrong-account caches are never imported.
- Network errors do not create a new empty cloud account; pending progress
  remains in the same browser's recovery journal for the corresponding UID.

## Limits and acceptance gates

- This is a **cooperative client session lock**, not cryptographically
  server-enforced anti-cheat. A deliberately modified signed-in client could
  spoof writes where permissive security rules allow them.
- If a browser crashes *before* localStorage can preserve pending edits,
  or the user clears browser data while an upload is pending, those edits
  cannot be recovered. A different browser cannot read another device's
  local recovery buffer until that device reconnects and successfully syncs.
- The grace period is bounded. If an old client's cloud upload takes longer
  than the takeover, it must retain its recovery buffer and retry after
  regaining the lease; the newer browser must never accept stale writes.
- Firebase Auth's own browser persistence remains enabled.
- Deployed Firestore rules are **not changed** here. Before production:
  confirm user-owned access to `player_profiles/{uid}`, session and receipt
  field permissions, deployed shop transaction rules, and Spark quota impact.
  Do not relax account-owner restrictions to enable this feature.
- This branch does not enable human multiplayer or a paid backend.

### Owner's deferred browser checks

1. Same Google account on two devices: browser A enters Survival, B signs in
   without playing; A continues. B clicks Play; A flushes and returns to menu.
2. Browser A earns XP then B takes over; B sees the cloud-confirmed XP. Test an
   intentionally interrupted save; A's pending buffer remains under A's UID,
   is later reconciled without duplicate rewards.
3. B quits and returns to the menu; A can take control again. Browser A cannot
   overwrite B while it is not the active owner.
4. Two browsers try to claim the same completed quest: one cloud claim pays,
   the second returns already claimed. Shop retries remain idempotent.
5. Sign out and sign into another Google account without inheriting the first
   account's XP, equipment, Scraps, skin selection or recovery journal.
6. Reproduce an offline write, close and reopen the same browser, reconnect,
   and check that pending rewards restore; clearing site data while offline
   remains an explicit data-loss scenario.
7. Verify Firestore Security Rules and network-error notices in Chromium and
   Firefox before declaring cloud saving production-ready.

Automated source tests: `scripts/profile-cloud-flush.test.cjs`,
`scripts/profile-sync-rules.test.cjs`, `scripts/profile-session.test.cjs`.
Run `node --test scripts/*.test.cjs` and GitHub CI on final HEAD.
