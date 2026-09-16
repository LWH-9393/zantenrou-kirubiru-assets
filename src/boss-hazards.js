// Boss attacks use the game's fixed simulation clock. They never advance from
// render callbacks, wall timers or CSS animation, so pause/hit-stop stay exact.
export const DEBRIS_RULES = Object.freeze({
  warning: 0.9, recovery: 1.45, launchDelay: 1.0,
  speed: 330, radius: 22, damage: 18, guardCost: 22, protection: 0.8,
  launchContactMargin: 190,
});

export function createBossPattern(entityId, stageIndex = 9) {
  return { entityId, stageIndex, sequence: 0, phase: "recovery", timer: DEBRIS_RULES.launchDelay, hazards: [], casts: 0, dodges: 0 };
}

export function updateBossPattern(state, dt, context) {
  const events = [];
  const { player, groundY, bodyBottom, contactY, buildingX, laneWidth, randomInt } = context;
  // Advance existing objects even while launching is suppressed by the body.
  for (const hazard of state.hazards) {
    if (hazard.phase === "telegraph" && context.groundVisible === false) {
      // Ground-only warnings cannot expire while their floor is off camera.
      hazard.age = Math.min(hazard.age, hazard.warningDuration - 0.45);
      continue;
    }
    hazard.age += dt;
    if (hazard.phase === "telegraph" && hazard.age >= hazard.warningDuration) {
      hazard.phase = "falling";
      hazard.age = 0;
      events.push({ type: "release", hazard });
    }
    if (hazard.phase !== "falling") continue;
    hazard.prevY = hazard.y;
    hazard.y += hazard.dropSpeed * dt;
    const playerTop = player.y - 110;
    const playerBottom = player.y - 5;
    const sweptTop = Math.min(hazard.prevY, hazard.y) - hazard.radius;
    const sweptBottom = Math.max(hazard.prevY, hazard.y) + hazard.radius;
    if (!hazard.hit && player.lane === hazard.lane && sweptBottom >= playerTop && sweptTop <= playerBottom) {
      hazard.hit = true;
      events.push({ type: "contact", hazard });
    }
    if (hazard.y - hazard.radius >= groundY) {
      hazard.done = true;
      if (!hazard.hit) state.dodges += 1;
      events.push({ type: "land", hazard });
    }
  }
  state.hazards = state.hazards.filter((hazard) => !hazard.done && !hazard.hit);
  if (state.hazards.length) {
    state.phase = state.hazards.some((h) => h.phase === "telegraph") ? "telegraph" : "falling";
    state.timer = DEBRIS_RULES.recovery;
    return events;
  }
  state.phase = "recovery";
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer > 0 || context.allowLaunch === false || context.groundVisible === false) return events;
  // Do not force a dodge while the solid body is already close to contact.
  if (contactY - bodyBottom < DEBRIS_RULES.launchContactMargin) return events;
  state.sequence += 1;
  const choice = randomInt ? randomInt(3) : state.sequence % 3;
  const lanes = state.stageIndex >= 29
    ? [0, 1, 2].filter((lane) => lane !== (player.lane === 0 ? 1 : player.lane === 2 ? 1 : choice))
    : [state.sequence % 2 ? player.lane : choice];
  // At most two lanes; two-lane casts always leave the current/adjacent lane.
  const warning = DEBRIS_RULES.warning + (lanes.length > 1 ? 0.3 : 0);
  const spawnY = bodyBottom - 28;
  state.hazards = lanes.map((lane) => ({
    id: `${state.entityId}:${state.sequence}:${lane}`,
    lane, x: buildingX + (lane + 0.5) * laneWidth,
    y: spawnY, prevY: spawnY, spawnY, targetY: groundY,
    radius: DEBRIS_RULES.radius, phase: "telegraph", age: 0,
    warningDuration: warning, dropSpeed: DEBRIS_RULES.speed, hit: false,
  }));
  state.casts += 1;
  state.phase = "telegraph";
  events.push({ type: "warning", hazards: state.hazards });
  return events;
}

export function bossPatternView(state) {
  if (!state) return null;
  const warning = state.hazards.find((h) => h.phase === "telegraph");
  return {
    phase: state.phase,
    targetLanes: state.hazards.map((h) => h.lane),
    progress: warning ? Math.min(1, warning.age / warning.warningDuration) : 0,
    label: state.phase === "telegraph" ? "잔해 예고" : state.phase === "falling" ? "잔해 낙하" : "공격 기회",
  };
}
