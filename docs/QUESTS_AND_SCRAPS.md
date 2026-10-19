# Quests, Scraps & rotating Collector rewards (priority 8)

Status: **Offline/client-side implementation** under the approved Firebase Spark friends-only architecture. Client-reported PvE reward integrity is an accepted casual-play compromise; the cosmetic shop still needs UID-scoped Firestore transactions, duplicate-charge protection and cloud-write conflict testing before activation.

## Periods and event accounting

Quests reset at **00:00 UTC daily** and **Monday 00:00 UTC weekly**, identified by ISO day or UTC Monday in `js/questRules.js`. The local player profile carries `questProgress.daily`, `questProgress.weekly`, `scraps`, `weaponScrapRemainders`. Whenever an eligible PvE kill, damage event or Survival wave completion occurs, the event handler in `js/progression.js` increments both period counters.

**Daily quests:** 20 PvE kills → 40 Scraps; 3,000 damage → 55 Scraps; 3 waves → 40 Scraps.

**Weekly quests:** 150 PvE kills → 275 Scraps; 24 waves → 240 Scraps; 220 PvE kills → one rotating Collector finish for one weapon. The weekly finish cycles **Aurora, Nebula, Cinder, Tundra**; the recipient weapon cycles Pistol, SMG, Shotgun, DMR. All four finishes are visible in the Weapon Skins Collector category, with animated emissive palettes in-game: Aurora (emerald/teal flow), Nebula (violet/magenta swirl), Cinder (amber ember flicker), Tundra (icy cyan shimmer). These are cosmetic-only effects, not static gameplay camouflage. If the profile already owns that finish for that weapon, claiming the reward grants **200 Scraps** instead. Rewards are claimed from Home → **QUESTS**, independent of Loadout. Completing a quest displays an in-game toast through the existing unlock/challenge queue; a successful claim displays its reward.

The client ledger guards one successful claim per (period, quest ID), blocks incomplete claims, and resets the daily/weekly periods independently. Repeated attempts cannot credit the same local profile twice in the same period. Expired rewards cannot be claimed later.

After weapon level 10 (18,000 XP), eligible **PvE weapon XP** is capped, and surplus converts at **25 XP per Scrap**, carrying fractional remainder separately per weapon. PvP kills are explicitly excluded from Scraps conversion until server-side validation exists. Cosmetics and progress bars should continue to work for maxed weapons.

## Safety and future multiplayer

This is a prototype offline reward loop, **not an anti-cheat secure economy**: browser saves and client events can be tampered with, and Firebase profile merge does not provide an atomic transaction/receipt ledger. Do not allow real-money conversion, competitive buy/use effects, or server-trusted purchases against the local `scraps` balance. Future auth work (priority 13) needs per-event verified player attribution, authoritative UTC identity/claim ledger, replay prevention, anti-farm/daily caps, and atomic cross-device balance/ownership writes. The cosmetic shop (priority 15) must wait for that ledger.

## Tests

`node --test scripts/quest-rules.test.cjs`

Tests cover UTC boundary/week rollover across years, event exclusions, idempotent claims, duplicate Collector compensation, day vs week reset, and fractional weapon XP conversion.

**QA gate:** Complete eligible missions, restart, claim once, reload and verify ownership/balance; switch UTC day/week; verify Pistol/SMG/Shotgun/DMR Collector skins remain available; ensure no reward is sent for forged PvP kills.
