// Physics/combat core. Jump, push, slash and guard retain the trace-validated
// port rules. Live monster contact follows the approved illustration bands;
// synthetic original-physics fixtures retain the legacy building bottom cap.
// Damage uses a visible attack-power stat so HP gauges have readable numbers.
import { BODY_TIERS, NORMAL_MONSTER_IDS, SHARED_BODY_PROFILE, assertMonsterEncounter, getMonsterDefinition } from "./monster-catalog.js";

export const BASE_W = 640;
export const BASE_H = 480;
export let W = BASE_W;
export let H = BASE_H;
export let GROUND_Y = 402;
export let BUILDING_X = 80;
export let BUILDING_W = 480;
export const FLOOR_H = 0x76;
export const LANES = 3;
export let LANE_W = BUILDING_W / LANES;
export const GUARD_MAX = 100;
export const WAZA_MAX = 100;
export const MATERIAL_WEIGHTS = [6, 3, 1];
export const MONSTER_KINDS = NORMAL_MONSTER_IDS;
export const ORIGINAL_BUILDING_SOURCE_STEP = 0x78;
export const ORIGINAL_BUILDING_TOP_MARGIN = 0x298;
export const ORIGINAL_ROW_PITCH = FLOOR_H;
export const ORIGINAL_ROW_HEIGHT = ORIGINAL_BUILDING_SOURCE_STEP;
export const BUILDING_BOTTOM_CAP_OVERLAP = ORIGINAL_ROW_HEIGHT - ORIGINAL_ROW_PITCH;
export const ORIGINAL_LANE_W = 0xa0;
export const PLAYER_CRUSH_CONTACT_OFFSET_Y = 38;
export const SLASH_REACH_TOP = ORIGINAL_ROW_HEIGHT + PLAYER_CRUSH_CONTACT_OFFSET_Y + 2;
export const SLASH_REACH_BOTTOM = 0;
export let CRUSH_CONTACT_Y = GROUND_Y - PLAYER_CRUSH_CONTACT_OFFSET_Y;
export const CRUSH_GUARD_MIN = 8;
export const CAMERA_FOLLOW_START_RISE = 180;
export let CAMERA_TARGET_PLAYER_SCREEN_Y = Math.max(160, GROUND_Y - CAMERA_FOLLOW_START_RISE);
export let CAMERA_MIN_PLAYER_SCREEN_Y = Math.max(80, CAMERA_TARGET_PLAYER_SCREEN_Y - 120);
export let CAMERA_DEADZONE_TOP_SCREEN_Y = CAMERA_TARGET_PLAYER_SCREEN_Y;
export let CAMERA_DEADZONE_BOTTOM_SCREEN_Y = Math.min(H - 96, Math.max(CAMERA_TARGET_PLAYER_SCREEN_Y + 120, GROUND_Y - 120));
export const CAMERA_FOLLOW_LERP = 0.42;
export const CAMERA_RETURN_LERP = 0.14;
export const ORIGINAL_FRAME_RATE = 60;
export const ORIGINAL_JUMP_GROUND_Y = 0x130;
export const ORIGINAL_JUMP_LAND_CHECK_Y = 0x127;
export const ORIGINAL_JUMP_START_VY_PER_FRAME = -14;
export const ORIGINAL_JUMP_PREP_FRAMES = 11;
export const ORIGINAL_JUMP_GRAVITY_PER_FRAME = 0.1;
export const JUMP_START_VY = ORIGINAL_JUMP_START_VY_PER_FRAME * ORIGINAL_FRAME_RATE;
export const JUMP_GRAVITY = ORIGINAL_JUMP_GRAVITY_PER_FRAME * ORIGINAL_FRAME_RATE * ORIGINAL_FRAME_RATE;
// stepJumpPhysics moves before adding gravity. Sum those fixed 60Hz steps,
// rather than the continuous parabola (980px), to include the full 987px rise.
const JUMP_ASCENT_FRAMES = Math.ceil(-ORIGINAL_JUMP_START_VY_PER_FRAME / ORIGINAL_JUMP_GRAVITY_PER_FRAME);
export const JUMP_MAX_RISE = -(JUMP_ASCENT_FRAMES * ORIGINAL_JUMP_START_VY_PER_FRAME
  + ORIGINAL_JUMP_GRAVITY_PER_FRAME * JUMP_ASCENT_FRAMES * (JUMP_ASCENT_FRAMES - 1) / 2);
export let JUMP_LAND_CHECK_Y = GROUND_Y - (ORIGINAL_JUMP_GROUND_Y - ORIGINAL_JUMP_LAND_CHECK_Y);
export let AIRBORNE_SAFE_Y = JUMP_LAND_CHECK_Y;

export function configureViewport(width, height) {
  W = Math.max(BASE_W, Math.round(width));
  H = Math.max(BASE_H, Math.round(height));
  BUILDING_W = 480;
  LANE_W = BUILDING_W / LANES;
  BUILDING_X = Math.round((W - BUILDING_W) / 2);
  GROUND_Y = Math.max(402, H - 78);
  CRUSH_CONTACT_Y = GROUND_Y - PLAYER_CRUSH_CONTACT_OFFSET_Y;
  // Follow once the player has risen a clear distance from the ground.
  // The trigger and target coincide, avoiding the old catch-up jump caused
  // by activating far above the eventual tracking position.
  CAMERA_TARGET_PLAYER_SCREEN_Y = Math.max(160, GROUND_Y - CAMERA_FOLLOW_START_RISE);
  CAMERA_DEADZONE_TOP_SCREEN_Y = CAMERA_TARGET_PLAYER_SCREEN_Y;
  CAMERA_DEADZONE_BOTTOM_SCREEN_Y = Math.min(H - 96, Math.max(CAMERA_TARGET_PLAYER_SCREEN_Y + 120, GROUND_Y - 120));
  // Keep the hard visibility clamp above the tracking target so it cannot
  // bypass the normal easing on every ascending frame.
  CAMERA_MIN_PLAYER_SCREEN_Y = Math.max(80, CAMERA_TARGET_PLAYER_SCREEN_Y - 120);
  JUMP_LAND_CHECK_Y = GROUND_Y - (ORIGINAL_JUMP_GROUND_Y - ORIGINAL_JUMP_LAND_CHECK_Y);
  AIRBORNE_SAFE_Y = JUMP_LAND_CHECK_Y;
}

// Body-part tiers replace the original material tiers (soft/normal/hard). The
// labels describe target zones on one monster, not separate enemy species.
export const materialInfo = BODY_TIERS;

// Monster attack scales mildly with stage (spec: 적 공격력 시스템).
// Endless mode: the multiplier caps at 2.5× so late stages stay survivable —
// past the cap, difficulty keeps growing through HP/rows/speed instead.
export function monsterAttack(type, stageIndex, definitionOrId = null) {
  const body = definitionOrId ? getMonsterDefinition(definitionOrId).bodyProfile : SHARED_BODY_PROFILE;
  const mul = Math.min(body.contact.maximumMultiplier, 1 + body.contact.growthPerStage * stageIndex);
  return Math.round(body.tiers[type].attack * mul * body.contact.multiplier);
}
const materialIndexByOriginalType = Object.fromEntries(
  materialInfo.map((info, index) => [info.originalType, index]),
);

let rngSeed = 0x1234;

export function seedRng(seed) {
  rngSeed = seed >>> 0;
}

function rand15() {
  rngSeed = (Math.imul(rngSeed, 0x343fd) + 0x269ec3) >>> 0;
  return (rngSeed >>> 16) & 0x7fff;
}

export function randInt(max) {
  return max <= 1 ? 0 : rand15() % max;
}

export function cellMaxHp(cell) {
  if (cell?.active === false) return 0;
  if (Number.isFinite(cell?.maxHp)) return Math.max(0, cell.maxHp);
  return materialInfo[cell?.type]?.hp || 1;
}

export function cellHpRatio(cell) {
  return Math.max(0, Math.min(1, cell.hp / cellMaxHp(cell)));
}

export function buildingHp(building) {
  return building.floors.reduce(
    (sum, floor) => sum + floor.cells.reduce((rowSum, cell) => rowSum + Math.max(0, cell.hp), 0),
    0,
  );
}

export function buildingHpRatio(building) {
  const maxHp = building.maxBodyHp || building.floors.reduce(
    (sum, floor) => sum + floor.cells.reduce((rowSum, cell) => rowSum + cellMaxHp(cell), 0),
    0,
  );
  return maxHp > 0 ? Math.max(0, Math.min(1, buildingHp(building) / maxHp)) : 0;
}

function rollSpecial(profile, stageIndex) {
  if (stageIndex < 20 || !profile.specials) return null;
  for (const [id, rate] of Object.entries(profile.specials)) {
    const pct = Math.max(0, Number(rate) || 0) * 10000;
    if (pct > 0 && randInt(10000) < pct) return id;
  }
  return null;
}

function materialPattern(weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  const firstLimit = Math.floor((weights[0] * 100) / total);
  const secondLimit = Math.floor((weights[1] * 100) / total);
  const result = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const roll = randInt(100);
    if (roll < firstLimit) result.push(1);
    else result.push(roll >= firstLimit + secondLimit ? 3 : 2);
  }
  return result;
}

// Endless scaling: tier weights shift from soft-heavy to hard-heavy forever.
export function stageWeights(stageIndex) {
  return [
    Math.max(2, MATERIAL_WEIGHTS[0] - Math.floor(stageIndex / 5)),
    MATERIAL_WEIGHTS[1] + Math.floor(stageIndex / 10),
    MATERIAL_WEIGHTS[2] + Math.floor(stageIndex / 6),
  ];
}

// One descending monster per wave. Its 3 x N cells are target zones on one
// continuous body; breaking one zone severs the entire horizontal body band.
// Base curve: rows = 5 + min(12, s/3)
// + rand(0..2), fall speed = 0.85 * (1 + 0.045*s) capped at 2.2 px/frame,
// monster HP +10 per stage from stage 11. A stage-type `profile` (scenes.js
// level design, data/stages.json) can override rows/speed/weights/HP.
// Spawn Y math is unchanged from the port (ORIGINAL_BUILDING_TOP_MARGIN).
export function newBuilding(stageIndex, cameraY, profile = {}) {
  const definition = getMonsterDefinition(profile.monsterDefinition || profile.monsterId
    || (profile.fixture === true ? "slime" : null));
  const encounterType = profile.encounterType || "normal";
  assertMonsterEncounter(definition, encounterType);
  if (profile.fixture !== true && typeof profile.monsterLayoutForRows !== "function") {
    throw new Error(`몬스터 원화 배치가 없습니다: ${definition.id}`);
  }
  const body = definition.bodyProfile;
  const baseRows = body.rows.base + Math.min(body.rows.maximumGrowth, Math.floor(stageIndex / body.rows.growthEveryStages))
    + randInt(body.rows.randomRange);
  let count = Math.max(2, Number.isFinite(profile.rows) ? profile.rows : baseRows + (profile.rowsAdd || 0));
  const configuredRowCount = count;
  const baseSpeed = body.fall.basePixelsPerFrame * (1 + body.fall.growthPerStage * stageIndex);
  const speedPerFrame = Math.min(body.fall.maximumPixelsPerFrame, baseSpeed * (profile.speedMul || 1));
  const weights = profile.weights || stageWeights(stageIndex);
  const hpBonus = Math.max(0, stageIndex - body.hp.growthAfterStageIndex) * body.hp.growthPerStage + (profile.hpAdd || 0);
  let monsterLayout = typeof profile.monsterLayoutForRows === "function"
    ? profile.monsterLayoutForRows(count)
    : null;
  if (Number.isFinite(monsterLayout?.minimumRows) && monsterLayout.minimumRows > count) {
    count = monsterLayout.minimumRows;
    monsterLayout = profile.monsterLayoutForRows(count);
  }
  if (profile.fixture !== true && (monsterLayout?.monsterId !== definition.id
    || monsterLayout?.spriteKey !== definition.spriteKey)) {
    throw new Error(`몬스터 데이터와 원화 배치가 다릅니다: ${definition.id}`);
  }
  if (profile.fixture !== true && ![monsterLayout.drawX, monsterLayout.drawW, monsterLayout.drawTop, monsterLayout.drawH].every(Number.isFinite)) {
    throw new Error(`몬스터 원화의 기하 정보가 없습니다: ${definition.id}`);
  }
  const floors = [];
  for (let i = 0; i < count; i += 1) {
    const pattern = materialPattern(weights);
    const cells = pattern.map((originalType, lane) => {
      const tile = monsterLayout?.tiles?.[i]?.[lane];
      if (!tile && profile.fixture !== true) throw new Error(`몬스터 공격 칸이 없습니다: ${definition.id}/${i}/${lane}`);
      const active = tile ? tile.active : true;
      const resolvedOriginalType = originalType;
      const type = materialIndexByOriginalType[resolvedOriginalType] ?? 1;
      if (!active) {
        return {
          active: false,
          coverage: tile?.coverage || 0,
          type,
          originalType: resolvedOriginalType,
          special: null,
          hp: 0,
          maxHp: 0,
          flash: 0,
          lastHitCell: null,
        };
      }
      const special = rollSpecial(profile, stageIndex);
      const specialOriginalType = special === "bomber" ? 1 : resolvedOriginalType;
      const specialType = materialIndexByOriginalType[specialOriginalType] ?? 1;
      const info = body.tiers[specialType];
      const maxHp = Math.round((info.hp + hpBonus) * (body.hp.multiplier || 1));
      return {
        active: true,
        coverage: tile?.coverage ?? 1,
        type: specialType,
        originalType: specialOriginalType,
        special,
        hp: maxHp,
        maxHp,
        flash: 0,
        lastHitCell: null,
      };
    });
    if (cells.some((cell) => cell.active)) floors.push({
      rowIndex: i + 1,
      cells,
    });
  }
  if (!floors.length) throw new Error("몬스터 원화와 겹치는 공격 가능 칸이 없습니다");
  const y = -cameraY - count * FLOOR_H - ORIGINAL_BUILDING_TOP_MARGIN;
  return {
    entityKind: "monster",
    entityId: `monster-${stageIndex}`,
    monsterId: definition.id,
    monsterKind: definition.id,
    monsterName: definition.name,
    spriteKey: definition.spriteKey,
    artKind: definition.artKind,
    encounterType,
    monsterDefinition: definition,
    y,
    fixedYQ6: y * 0x40,
    velocityQ6: speedPerFrame * 0x40, // Q6 px/frame, constant per stage (spec §8.2 overrides port's accelerationQ6 ramp)
    holdFrames: 30,
    floors,
    monsterLayout,
    floorCount: count,
    originalFloorCount: count,
    configuredRowCount,
    initialActiveRows: floors.length,
    initialActiveCells: floors.reduce((sum, floor) => sum + floor.cells.filter((cell) => cell.active).length, 0),
    maxBodyHp: floors.reduce(
      (sum, floor) => sum + floor.cells.reduce((rowSum, cell) => rowSum + cell.maxHp, 0),
      0,
    ),
  };
}

// Layout span is needed to preserve original image slice coordinates. It must
// not be reported as the number of attackable body bands after alpha masking.
export function monsterBodyMetrics(building) {
  if (!building) return null;
  return {
    configuredRows: building.configuredRowCount ?? building.originalFloorCount,
    layoutRows: building.originalFloorCount,
    initialActiveRows: building.initialActiveRows ?? building.floors.length,
    initialActiveCells: building.initialActiveCells ?? building.floors.reduce(
      (sum, floor) => sum + floor.cells.filter((cell) => cell.active !== false).length, 0,
    ),
    remainingRows: building.floors.filter((floor) => floor.cells.some((cell) => cell.active !== false && cell.hp > 0)).length,
    remainingCells: building.floors.reduce(
      (sum, floor) => sum + floor.cells.filter((cell) => cell.active !== false && cell.hp > 0).length, 0,
    ),
  };
}

// Ported from advanceBuilding (src/game.js ~1567), minus the port's
// accelerationQ6 ramp — M0 spec §8.2 fixes fall speed per stage instead.
export function advanceBuilding(building) {
  if (building.holdFrames > 0) {
    building.holdFrames -= 1;
    return;
  }
  building.fixedYQ6 += building.velocityQ6;
  building.y = building.fixedYQ6 >> 6;
}

export function floorWorldY(building, floor) {
  return building.y + floor.rowIndex * FLOOR_H;
}

function buildingBottomFloorY(building) {
  const floor = building.floors[building.floors.length - 1];
  return building.y + floor.rowIndex * FLOOR_H;
}

// Exact geometry of a surviving illustration band, before cosmetic sway and
// the renderer's one-pixel seam bleed. Source row indices never change when a
// different row is severed. Synthetic physics fixtures have no art layout.
export function monsterFloorArtBounds(building, floor) {
  const layout = building.monsterLayout;
  if (!layout || ![layout.drawX, layout.drawW, layout.drawTop, layout.drawH].every(Number.isFinite)) return null;
  const bandTop = (floor.rowIndex - 1) * ORIGINAL_ROW_HEIGHT;
  const overlapTop = Math.max(bandTop, layout.drawTop);
  const overlapBottom = Math.min(bandTop + ORIGINAL_ROW_HEIGHT, layout.drawTop + layout.drawH);
  if (overlapBottom <= overlapTop) return null;
  return {
    left: BUILDING_X + layout.drawX,
    right: BUILDING_X + layout.drawX + layout.drawW,
    top: floorWorldY(building, floor) + overlapTop - bandTop,
    bottom: floorWorldY(building, floor) + overlapBottom - bandTop,
  };
}

export function monsterArtBounds(building) {
  if (!building?.monsterLayout) return null;
  const bands = building.floors.map((floor) => monsterFloorArtBounds(building, floor)).filter(Boolean);
  if (!bands.length) return null;
  return {
    left: Math.min(...bands.map((band) => band.left)),
    right: Math.max(...bands.map((band) => band.right)),
    top: Math.min(...bands.map((band) => band.top)),
    bottom: Math.max(...bands.map((band) => band.bottom)),
  };
}

export function buildingGameplayBottomEdge(building) {
  const art = monsterArtBounds(building);
  if (art) return art.bottom;
  return buildingBottomFloorY(building) + ORIGINAL_ROW_HEIGHT;
}

function buildingVisualBottomCapTop(building) {
  return buildingGameplayBottomEdge(building) - BUILDING_BOTTOM_CAP_OVERLAP;
}

export function buildingVisualBottomEdge(building) {
  const art = monsterArtBounds(building);
  if (art) return art.bottom;
  return buildingVisualBottomCapTop(building) + ORIGINAL_ROW_HEIGHT;
}

function buildingCrushContactSurfaceY(building) {
  return buildingVisualBottomEdge(building);
}

function normalizeAttackTargetOptions(options) {
  if (typeof options === "boolean") {
    return { ranged: options, range: SLASH_REACH_TOP };
  }
  const range = Number.isFinite(options?.range) ? Math.max(1, options.range) : SLASH_REACH_TOP;
  return { ranged: options?.ranged === true, range };
}

function normalizeYSegment(fromY, toY) {
  return {
    top: Math.min(fromY, toY),
    bottom: Math.max(fromY, toY),
  };
}

function floorIntersectsYSegment(floorY, fromY, toY) {
  const seg = normalizeYSegment(fromY, toY);
  return floorY < seg.bottom && floorY + ORIGINAL_ROW_HEIGHT > seg.top;
}

export function findFirstReachTarget(building, { lane, fromY, toY }) {
  if (!building) return null;
  for (let i = building.floors.length - 1; i >= 0; i -= 1) {
    const floor = building.floors[i];
    const floorY = floorWorldY(building, floor);
    if (!floorIntersectsYSegment(floorY, fromY, toY)) continue;
    const cell = floor.cells[lane];
    if (cell && cell.hp > 0) {
      return { index: i, floor, cell, floorY, lane };
    }
  }
  return null;
}

// Ported from findSlashTarget (src/game.js ~1246), with weapon-specific reach
// for the prototype's range system.
export function findSlashTarget(building, player, options = {}) {
  if (!building) return null;
  const { ranged, range } = normalizeAttackTargetOptions(options);
  for (let i = building.floors.length - 1; i >= 0; i -= 1) {
    const floorY = floorWorldY(building, building.floors[i]);
    const inReach = floorY < player.y - SLASH_REACH_BOTTOM
      && floorY + ORIGINAL_ROW_HEIGHT > player.y - range;
    if (!inReach) continue;
    const floor = building.floors[i];
    const cell = floor.cells[player.lane];
    if (cell.hp > 0) return { index: i, floor, cell, floorY, rangedShot: ranged, range };
  }
  return null;
}

// Ported from resolveAirborneBuildingPush (src/game.js ~1475).
export function resolveAirborneBuildingPush(player, building) {
  if (!building || building.floors.length === 0) return;
  if (player.y >= GROUND_Y - 1) return; // grounded: handled by crush resolution
  const bottomEdge = buildingGameplayBottomEdge(building);
  if (bottomEdge <= player.y - 50) return; // no overlap: player is clear below the building
  player.y = bottomEdge + 50;
  player.vy = (building.velocityQ6 / 128) * ORIGINAL_FRAME_RATE;
  if (player.y >= GROUND_Y - 1) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.lastGrounded = true;
  }
}

// Ported base from updateCamera (src/game.js ~1632), then adapted for the
// prototype's taller fixed combat view with a vertical dead zone.
export function updateCamera(cameraState, player) {
  const playerScreenY = player.y - cameraState.y;
  let target = cameraState.y;
  const grounded = player.y >= GROUND_Y - 1;

  if (grounded) {
    cameraState.airFocus = false;
  } else if (playerScreenY < CAMERA_DEADZONE_TOP_SCREEN_Y) {
    cameraState.airFocus = true;
  } else if (playerScreenY > CAMERA_DEADZONE_BOTTOM_SCREEN_Y) {
    cameraState.airFocus = false;
  }

  if (cameraState.airFocus) {
    target = player.y - CAMERA_TARGET_PLAYER_SCREEN_Y;
  } else if (grounded) {
    target = 0;
  } else if (playerScreenY > CAMERA_DEADZONE_BOTTOM_SCREEN_Y && cameraState.y < 0) {
    target = player.y - CAMERA_DEADZONE_BOTTOM_SCREEN_Y;
  }

  target = Math.min(0, target);
  const lerp = target < cameraState.y ? CAMERA_FOLLOW_LERP : CAMERA_RETURN_LERP;
  cameraState.y += (target - cameraState.y) * lerp;

  const highestAllowed = player.y - CAMERA_MIN_PLAYER_SCREEN_Y;
  if (cameraState.y > highestAllowed) cameraState.y = highestAllowed;
  if (grounded && Math.abs(cameraState.y) < 0.5) cameraState.y = 0;
}

export function createPlayer() {
  return {
    lane: 1,
    x: BUILDING_X + LANE_W * 1.5,
    y: GROUND_Y,
    vy: 0,
    lastGrounded: true,
    jumpPrepFrames: 0,
    attackTimer: 0,
    guardTimer: 0,
    specialTimer: 0,
    hurtTimer: 0, // hurt-reaction animation window
    invulnTimer: 0, // crush invulnerability (spec §3: 3s)
    stunTimer: 0,
  };
}

// Ported from moveLane (src/game.js ~1117): lane switching is an instant
// snap in the trace-validated physics. Any move-speed stat would have no
// hook here — the forge pool therefore has no movement upgrade (spec §3).
export function moveLane(player, dir) {
  const next = Math.max(0, Math.min(LANES - 1, player.lane + dir));
  if (next === player.lane) return;
  player.lane = next;
  player.x = BUILDING_X + LANE_W * (next + 0.5);
}

// Ported from jump() (src/game.js ~1125).
export function jump(player) {
  if (Math.abs(player.y - GROUND_Y) > 1) return false;
  if (player.jumpPrepFrames > 0) return false;
  player.jumpPrepFrames = ORIGINAL_JUMP_PREP_FRAMES;
  player.vy = JUMP_START_VY;
  return true;
}

// Ported from updatePlay's jump-physics block (src/game.js ~1416-1436).
export function stepJumpPhysics(player, dt) {
  const wasGrounded = player.lastGrounded;
  if (player.jumpPrepFrames > 0) {
    player.jumpPrepFrames -= 1;
  } else if (player.y < GROUND_Y || player.vy !== 0) {
    player.y += player.vy * dt;
    player.vy += JUMP_GRAVITY * dt;
  }
  if (player.jumpPrepFrames === 0 && player.vy >= 0 && player.y >= JUMP_LAND_CHECK_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.lastGrounded = true;
    return { justLanded: !wasGrounded };
  }
  player.lastGrounded = false;
  return { justLanded: false };
}

// Damage generalized to an attack-power stat per M0 spec §2 (was fixed 1 in the port).
// Returns a result descriptor; callers apply score/waza/combo per §3 rules —
// this only applies HP and reports what happened (findSlashTarget's cell).
export function applySlashDamage(cell, damage) {
  const hpBefore = cell.hp;
  cell.hp = Math.max(0, cell.hp - damage);
  cell.flash = 0.2;
  const collapsed = cell.hp <= 0;
  return { hpBefore, hpAfter: cell.hp, collapsed };
}

// Ported from collapseFloor (src/game.js ~1211): zeroes remaining cells and
// removes the floor from the building.
export function collapseFloor(building, index) {
  const floor = building.floors[index];
  for (let lane = 0; lane < LANES; lane += 1) {
    floor.cells[lane].hp = 0;
  }
  building.floors.splice(index, 1);
}

// Ported from special() (src/game.js ~1227), row count generalized for
// per-weapon skills. Score/combo is applied by the caller (scenes.js).
export function performWaza(building, rows = 3) {
  const removed = Math.min(rows, building.floors.length);
  building.floors.splice(Math.max(0, building.floors.length - removed), removed);
  return removed;
}

// 용승격: shove the whole horde back up by `px` (fixed-point Q6 like the
// port's descent math).
export function pushBackBuilding(building, px) {
  building.fixedYQ6 -= px * 0x40;
  building.y = building.fixedYQ6 >> 6;
}

// Ported from resolveCrush (src/game.js ~1578). Returns an outcome tag so the
// caller (scenes.js) can apply HP/score/combo/waza per M0 spec §3.
export function resolveCrush(building, player, guardState) {
  if (!building || building.floors.length === 0) return { outcome: "none" };
  const bottomIndex = building.floors.length - 1;
  const playerAirborne = player.y < AIRBORNE_SAFE_Y;
  if (playerAirborne && buildingVisualBottomEdge(building) >= GROUND_Y) {
    building.floors.pop();
    return { outcome: "none" };
  }
  const collisionSurfaceY = buildingCrushContactSurfaceY(building);
  if (collisionSurfaceY < CRUSH_CONTACT_Y) return { outcome: "none" };

  const floor = building.floors[bottomIndex];
  const laneCell = floor.cells[player.lane];
  const guarding = player.guardTimer > 0 && guardState.value > CRUSH_GUARD_MIN;
  const passSafe = playerAirborne || laneCell.hp <= 0;

  if (passSafe) {
    building.floors.pop();
    return { outcome: "none" };
  }
  if (player.invulnTimer > 0) {
    building.floors.pop();
    return { outcome: "none" };
  }
  if (guarding) {
    guardState.value = Math.max(0, guardState.value - 32);
    laneCell.hp = 0;
    building.floors.pop();
    return { outcome: "deflect", cellType: laneCell.type };
  }

  guardState.value = Math.max(0, guardState.value - 24);
  player.hurtTimer = 0.8;
  player.invulnTimer = 3.0; // spec §3 crush rule (port: 180f)
  building.floors.pop();
  return { outcome: "crush", cellType: laneCell.type };
}
