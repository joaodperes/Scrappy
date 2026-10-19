# Hard / Nightmare Elite encounters — source-level implementation

**Status:** implemented in `feat/hard-elites-20261019`, browser QA and performance testing pending. This is approved roadmap **priority 4**, building on the priority-3 Hard/Nightmare rewrite. This document is an implementation contract, not evidence of completed gameplay QA.

## Spawning and budget

`js/eliteRules.js` owns the deterministic per-wave selection, independent of `Math.random()`, DOM and Babylon. `js/waves.js` selects the Elite slots **after** the normal composition and Hard/Nightmare enemy-count multipliers are calculated. Slot selectors are `groupIndex:unitIndex` and do not change the underlying count.

- Normal Survival: no Elites. Hard/Nightmare: first eligible wave is **5**.
- Trait-point budget starts at 1 (waves 5–12), then 2 (13–20), 3 (21–28) and 4 (29+); never more than 3 Elite enemies, and never more than 25% of eligible non-boss/non-swarm-host units.
- Every trait costs one point; at **wave 25+**, the first selected Elite receives two distinct traits when the budget permits. On boss waves the limit is **one single-trait Elite minion** if enough eligible units exist, and boss counts are never modified.
- `giantbot` and `swarm_host` are never Elite. `medic_bot` cannot receive Frenzied. Summoned boss/swam-host minions are not automatically Elite.
- The same map, wave, difficulty and composition yields the same assignments. The map's random composition can still differ from one run to the next. `getEliteSpawnPlan` returns a frozen, read-only plan.

## Trait behaviors

| Trait | Color | Stats and AI behavior |
|---|---|---|
| **Bulwark** | Amber halo | 1.65× max HP, 0.92× speed, 22% direct-hit damage mitigation (after the native shield check). DOT remains unchanged. |
| **Frenzied** | Red halo | +12% initial damage, +8% speed, 5% shorter attack interval. Below 40% HP, permanently gains 30% speed, 25% damage and 20% shorter attack interval. The halo turns bright red. |
| **Regenerator** | Cyan halo | 1.3× max HP; regenerates 2% max HP/second after four seconds without a direct hit. Burning or poisoned enemies cannot regenerate while those effects are active. |
| **Dual trait** | Purple halo | Multiplicative HP/damage/speed/interval modifiers, one-time Frenzied threshold and additive regeneration. No duplicate trait IDs. |

Halos use a single non-pickable, non-colliding mesh per Elite, parented to the robot and disposed with it. The implementation does not create per-frame particles or extra outline passes. The base enemy type retains its attacks, navmesh, AI and normal boss/existing shield interactions.

## Rewards, difficulty and limits

- An Elite earns **+50% score and XP per trait**, so dual-trait Elites earn 2× their normal values. Existing Hard score 2× applies first; the optional double-score buff still applies as usual. The Elite XP bonus applies to player XP and weapon XP.
- Elite deaths produce **one additional** health pickup (Regenerator), armor pickup (Bulwark), or ammo pickup (Frenzied), on top of that bot's existing loot and guaranteed weapon drops. No Scraps are minted; that belongs to priority 8.
- Hard base multipliers: enemy HP 1.2×, attack damage 1.15×, speed 1.12×, budget 1.15× and score 2×. Non-consecutive single modifiers rotate on Hard; Nightmare retains one more previous modifier starting wave 11, 21 and 31.
- Boss special projectile base damage **45/20/12** is now multiplied by the active Hard/Nightmare damage rule, fixing a priority-3 exception. Normal boss damage stays 45/20/12.
- Elite status is only injected through Hard/Nightmare wave slots, not through standard `spawnBot` calls. Normal Survival, standard bot spawns and existing map definitions are unchanged.
- Some monsters already have special healing/shields; test that stacked mitigation does not make them unreasonably slow to kill. Long-run progression/loot value is provisional until measured.

## Verification gates

Automated checks (run from repository root):

```sh
node --test scripts/hard-mode.test.cjs scripts/elite-rules.test.cjs
node scripts/check-module-imports.cjs
node scripts/validate-map-data.cjs
node --test scripts/*.test.cjs server/*.test.js
```

Still required before declaring priority 3 or 4 **done**:

1. Play **Normal, Hard and Nightmare** on **Scrapyard and City** in Firefox and Chromium. Record actual enemy counts, modifier labels, Elite halo visibility, kill score and weapon XP, and frame rate at waves 4/5, 9/10/11, 20/21, 24/25 and 30/31.
2. Shoot a Bulwark frontally and from behind when its base type has native shields. Verify armor vs energy-weapon behavior, and compare DOT damage.
3. Trigger Frenzied at 40% HP once, then confirm the speed/attack interval does not compound every frame. Verify recovery and damage feedback for Regenerator; heal never exceeds max HP.
4. Verify bonus pickup spawns and no loss of boss or weapon drops. Check an Elite dying to DOT, melee, explosion, and a direct bullet; verify player/weapon XP.
5. Load-test dense late Nightmare waves with several Elites and compare frame time and draw calls with the no-Elite baseline.
6. End and restart Survival, swap to Normal, and test boss summons to confirm no leakage of Elite traits, persistent timers or difficulty damage across runs.

**Known limits:** browser QA has not been performed here; traits are local Survival PvE only and not replicated/validated in networked co-op. Match state, anti-cheat and authoritative rewards remain later roadmap work.
