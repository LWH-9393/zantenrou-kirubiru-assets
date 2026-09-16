export const ATTACK_FRAME_COUNT = 12;
export const ATTACK_ATLAS_COLUMNS = 4;
export const ATTACK_ATLAS_ROWS = 3;
export const ATTACK_FRAME_WIDTH = 480;
export const ATTACK_FRAME_HEIGHT = 528;
export const ATTACK_GROUND_ANCHOR_X = 264;
export const ATTACK_GROUND_ANCHOR_Y = 488;
export const IDLE_FRAME_COUNT = 8;
export const IDLE_ATLAS_COLUMNS = 4;
export const IDLE_ATLAS_ROWS = 2;
export const IDLE_FPS = 6;

// Normalize the same character across independently authored weapon sheets.
// Both idle and attack use this scale, so state transitions never resize.
export const WEAPON_CHARACTER_SCALES = Object.freeze({
  chokento: 1.001839,
  katana: 1.083936,
  axe: 1.276073,
  spear: 1.144980,
  bow: 0.997118,
});

const DEFAULT_MOTION = Object.freeze({ impactFrame: 5, trail: "sword" });

const MOTIONS = Object.freeze({
  chokento: Object.freeze({ impactFrame: 5, trail: "sword" }),
  katana: Object.freeze({ impactFrame: 4, trail: "katana" }),
  axe: Object.freeze({ impactFrame: 7, trail: "axe" }),
  spear: Object.freeze({ impactFrame: 4, trail: "spear" }),
  bow: Object.freeze({ impactFrame: 6, trail: null }),
});

export function attackMotion(weaponId) {
  return MOTIONS[weaponId] || DEFAULT_MOTION;
}

export function attackFrameAt(elapsed, duration) {
  if (!(duration > 0) || elapsed < 0 || elapsed >= duration) return -1;
  return Math.min(
    ATTACK_FRAME_COUNT - 1,
    Math.floor((elapsed / duration) * ATTACK_FRAME_COUNT + 1e-7),
  );
}

export function attackImpactTime(weaponId, duration) {
  return duration * attackMotion(weaponId).impactFrame / ATTACK_FRAME_COUNT;
}

export function idleFrameAt(elapsed) {
  if (!(elapsed >= 0)) return 0;
  return Math.floor(elapsed * IDLE_FPS + 1e-7) % IDLE_FRAME_COUNT;
}

export function weaponCharacterScale(weaponId) {
  return WEAPON_CHARACTER_SCALES[weaponId] || 1;
}
