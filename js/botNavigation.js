// Navigation links for traversal that Recast cannot express as static ground polygons.
// Pads are one-way ballistic links; switched platforms are dynamic, bidirectional links.
const BABYLON = window.BABYLON;
const V = BABYLON.Vector3;
const GRAVITY = 35;

function near(a, b, horizontal = 2, vertical = 2) {
  return Math.hypot(a.x - b.x, a.z - b.z) <= horizontal && Math.abs(a.y - b.y) <= vertical;
}

function route(nav, from, to) {
  const start = nav.getClosestPoint(from), end = nav.getClosestPoint(to);
  if (!start || !end || !near(start, from, 3.5, 2.5) || !near(end, to, 3.5, 2.5)) return null;
  const points = nav.computePath(start, end);
  // Recast can return a partial path to the nearest reachable polygon.
  if (!points || points.length === 0 || !near(points[points.length - 1], end, 2, 1.5)) return null;
  let length = V.Distance(from, start) + V.Distance(end, to);
  for (let i = 1; i < points.length; i++) length += V.Distance(points[i-1], points[i]);
  return { points, length };
}

function endpoint(md, atEnd) {
  return atEnd ? md.end : md.start;
}

function platformTop(plat) {
  const bounds = plat.getBoundingInfo().boundingBox;
  return plat.position.y + (bounds.maximum.y - bounds.minimum.y) * 0.5;
}

function planTransition(bot, goal, nav, pads, platforms, gravityMult=1) {
  const from = new V(bot.group.position.x, bot._floorY, bot.group.position.z);
  const direct = route(nav, from, goal);
  let bestScore = direct ? direct.length : Infinity;
  let choice = null;

  // Search for usable launch pads. Landing must project onto a *higher* navmesh
  // surface; do not treat arbitrary empty space as a valid pad destination.
  if (goal.y > from.y + 2 && bot._padCooldown <= 0) {
    for (const pad of pads) {
      if (pad.pos.y < from.y - 2 || pad.pos.y >= goal.y - 2) continue;
      const toPad = route(nav, from, pad.pos);
      if (!toPad) continue;
      const gravity=GRAVITY*Math.max(.1,gravityMult);
      const apex = Math.pow(pad.force, 2) / (2 * gravity);
      const rise = Math.min(6, goal.y - pad.pos.y);
      if (rise > apex - 0.4) continue;
      // Solve the descending intersection with the target platform height.
      const flight = (pad.force + Math.sqrt(Math.max(0,
        pad.force*pad.force-2*gravity*rise))) / gravity;
      const landingGuess = new V(pad.pos.x + pad.thrustX * flight,
                                  pad.pos.y + rise,
                                  pad.pos.z + pad.thrustZ * flight);
      const landing = nav.getClosestPoint(landingGuess);
      if (!landing || !near(landing, landingGuess, 4, 1.5) ||
          landing.y < from.y + 2.5) continue;
      const fromLanding = route(nav, landing, goal);
      // A second pad/step may be needed, so retain progress toward higher tiers
      // when the final leg is not yet connected.
      const remaining = fromLanding ? fromLanding.length
        : V.Distance(landing, goal) * 1.6 + Math.abs(landing.y - goal.y) * 2;
      const score = toPad.length + 5 + remaining;
      if (score + 2 < bestScore) {
        bestScore = score;
        choice = { kind: 'pad', pad, landing, age: 0 };
      }
    }
  }

  // Moving geometry is NOT part of the static navmesh. Board only active
  // platforms, at an endpoint, if they help reach the other side.
  for (const plat of platforms) {
    const md = plat._moveData;
    if (!md || md.paused || !plat.isEnabled()) continue;
    for (const fromEnd of [false, true]) {
      const entrance = endpoint(md, fromEnd);
      const exit = endpoint(md, !fromEnd);
      const toEntrance = route(nav, from, entrance);
      if (!toEntrance) continue;
      const fromExit = route(nav, exit, goal);
      const improvement = V.Distance(exit, goal) + 2 < V.Distance(entrance, goal);
      if (!fromExit && !improvement) continue;
      const remaining = fromExit ? fromExit.length : V.Distance(exit, goal) * 1.5;
      const score = toEntrance.length + 12 + remaining;
      if (score + 2 < bestScore) {
        bestScore = score;
        choice = { kind: 'platform', plat, fromEnd, age: 0 };
      }
    }
  }
  return choice;
}

// Returns the current on-ground target; null while riding a moving platform.
export function botTravelTarget(bot, goal, nav, pads, platforms, dt, gravityMult=1) {
  bot._padCooldown = Math.max(0, (bot._padCooldown || 0) - dt);
  let state = bot._navTransition;
  if (state) state.age += dt;

  if (state && state.kind === 'ride') {
    const md = state.plat._moveData;
    if (!md || md.paused || !state.plat.isEnabled()) {
      bot._onPlatform = null;
      bot._navTransition = null;
    } else if (Math.abs(md.t - (state.toEnd ? 1 : 0)) < 0.015) {
      // Step from the moving surface onto the destination dock.
      bot._onPlatform = null;
      const dock = endpoint(md, state.toEnd);
      const landing = nav.getClosestPoint(new V(dock.x, dock.y, dock.z));
      if (landing && near(landing, dock, 4, 2)) {
        bot.group.position.x = landing.x;
        bot.group.position.z = landing.z;
        bot._floorY = landing.y;
      }
      bot._navTransition = null;
      bot._navRepath = 0;
    } else {
      return null;
    }
    state = null;
  }

  if (state && state.kind === 'platform') {
    const plat = state.plat, md = plat._moveData;
    if (!md || md.paused || !plat.isEnabled() || state.age > 20) {
      bot._navTransition = null;
    } else {
      const dock = endpoint(md, state.fromEnd);
      const ready = Math.abs(md.t - (state.fromEnd ? 1 : 0)) < 0.045;
      const top = platformTop(plat);
      const here = new V(bot.group.position.x, bot._floorY, bot.group.position.z);
      // The platform can be a little above the adjacent solid floor.
      if (ready && near(here, new V(plat.position.x, top, plat.position.z), 2.7, 2)) {
        bot.group.position.x = plat.position.x;
        bot.group.position.z = plat.position.z;
        bot._floorY = top;
        bot._hopY = 0;
        bot._yVel = 0;
        bot._onPlatform = plat;
        bot._lastPlatformPos = plat.position.clone();
        bot._navTransition = { kind: 'ride', plat, toEnd: !state.fromEnd, age: 0 };
        return null;
      }
      return dock;
    }
    state = null;
  }

  if (state && state.kind === 'pad') {
    if (state.age <= 12 && bot._padCooldown <= 0) return state.pad.pos;
    bot._navTransition = null;
    state = null;
  }

  bot._navRepath = (bot._navRepath || 0) - dt;
  if (bot._navRepath <= 0 || !bot._navTarget ||
      V.DistanceSquared(bot._navTarget, goal) > 36) {
    bot._navRepath = 0.7 + Math.random() * 0.35;
    bot._navTarget = goal.clone();
    bot._navTransition = planTransition(bot, goal, nav, pads, platforms, gravityMult);
  }
  state = bot._navTransition;
  return state?.kind === 'pad' ? state.pad.pos :
         state?.kind === 'platform' ? endpoint(state.plat._moveData, state.fromEnd) :
         goal;
}

export function botNavPath(nav, from, target) {
  return route(nav, from, target);
}
