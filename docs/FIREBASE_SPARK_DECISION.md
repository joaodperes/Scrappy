# Approved Firebase Spark / friends-only architecture — 19 October 2026

Owner decision: **use the existing Firebase project `botarena-77004` and the free Spark plan; do not provision paid infrastructure**. Keep Google sign-in, user-owned Firestore profiles, transactional shop spending, and accept simplified client-reported PvE progression for a private friends-only game. This replaces earlier strict-server-reward requirements as a blocker to building the shop.

## Existing infrastructure to reuse

- `index.html` initializes Firebase Auth and Firestore with the existing project.
- `js/progression.js` loads/saves `player_profiles/{firebaseUid}` and caches profile changes locally.
- `js/questRules.js` awards local quest Scraps and Collector finishes. This reward loop is **not anti-cheat secure**, intentionally accepted for this project's scope.
- `server/server.js` remains a separate Node/WebSocket game server; it cannot run inside static Firebase Hosting. Running it locally with a reachable host/port incurs no Firebase charges.

## Client-side Firestore shop design (Spark compatible)

1. Keep account ownership tied to `firebase.auth().currentUser.uid`, never a browser-supplied UID.
2. Use Firestore `runTransaction` on **the single owner's** `player_profiles/{uid}` document for purchases: reread latest `profile.scraps`, check balance, item ID, purchase receipt and duplicate ownership, atomically debit and add the cosmetic or directly apply capped weapon XP.
3. Store bounded purchase receipts on the account document or in a private per-user ledger. Make a repeated request ID a no-op so double-click/retry cannot charge twice. Define a cleanup/size policy to keep documents below Firestore's 1 MiB document limit.
4. Design all purchased items as cosmetic-only or immediately applied weapon XP (not owned XP consumables). Earned PvE stats/equipment are **never** purchasable.
5. Before enabling the shop, **inspect deployed Firestore Security Rules**. Restrict reads/writes to an authenticated user's own profile, enforce supported shop inventory and nonnegative balance where rules can do so, and avoid collection-wide public writes. Firebase client SDK transactions provide atomicity against concurrent updates, **not anti-cheat authority**.
6. Consolidate client cloud writes: an unconditional `.set({profile}, {merge:true})` can overwrite a more recent transaction with a stale profile snapshot. Shop integration must align `saveProfile`, `flushProfileToCloud` and the authentication merge path with transactions or controlled field updates, and test two simultaneous browsers.
7. Preserve existing stored user profiles; perform additive migration and backward-compatible parsing. Test offline/unavailable Firestore and show purchases as failed/pending rather than awarding items optimistically.
8. Do not ship API secrets, service-account JSON, or Firebase Admin credentials in browser code.

**Risk explicitly accepted:** a user who modifies client-reported quest progress or saves may earn free Scraps. Firestore security rules cannot independently prove gameplay achievements. This is accepted for friends-only use; double spends and accidental cross-account writes are **not** accepted.

## Real-time gameplay security versus rewards

Keep practical server-side validation of PvP damage, weapon compatibility, death, respawn, TDM teams, and Gun Game wins for fair games. Strict anti-farm reward receipts, dedicated Firebase Admin reward-verification endpoints and paid Cloud Functions/Cloud Run are **not required** for shop implementation under this decision. Full server simulation, networked bots, two-human co-op and reconnect are still genuine gameplay work.

## Hosting / budget

- Static Firebase Hosting and Firestore/Auth can remain Spark when within free quotas. Observe database read/write counts; don't poll whole profiles every frame.
- The Node WebSocket server can run locally or on an already available machine for friends; remote players need a safe reachable network endpoint. Hosting that server remotely may incur independent fees, and is **not approved here**.
- No automatic Spark→Blaze upgrade, Cloud Run provisioning, Cloud Functions deployment, external database or other paid services.
- Seek explicit owner approval before changing production Firestore rules or deploying the live site/server.

## Next implementation order

1. Inspect existing Firestore rules via an authorized Firebase connection or request their contents without secrets.
2. Build the Spark-compatible transactional profile/shop adapter with offline/conflict tests.
3. Add cosmetics/weapon XP item catalog and UI, keeping compatibility with existing quest claims and profile save pipeline.
4. Have the owner verify concurrent purchase, account switching, logout/relogin, insufficient Scraps and duplicate purchase handling in two browsers.
5. Finish standalone offline bot matches (including genuine bot-vs-bot factions), local maps, melee and documentation cleanup on the existing PR. Schedule online multiplayer, networked bots and co-op for a **separate future PR**. Repository code moves/deletions still wait for offline gameplay QA.

## October 21 implementation note

The cloud-first design is now source implemented. `js/profileSession.js` coordinates one active offline game lease per UID, with graceful last-login-wins takeover initiated by Play, and `js/profileSyncRules.js` merges earned deltas against the prior cloud baseline. `js/progression.js` retains a UID-scoped pending recovery buffer (not a competing authoritative profile), versioned transaction receipts, and transactionally guarded quest rewards. Old unscoped profile data is one-time migrated conservatively. See [CLOUD_PROFILE_SESSION_ARCHITECTURE.md](CLOUD_PROFILE_SESSION_ARCHITECTURE.md). Deployed Firestore rules, free-plan usage and real multi-browser tests remain unverified; do not merge or deploy without owner approval.
