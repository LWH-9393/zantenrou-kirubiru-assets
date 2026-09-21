// Sprite loader for the image set (see ../assets/CREDITS.md).
import { prepareMonsterSprite } from "./monster-grid.js";
import { MONSTER_DEFINITIONS } from "./monster-catalog.js";

export const WEAPON_ANIMATION_SPRITE_NAMES = [
  "attack_chokento_v4", "attack_katana_v4", "attack_axe_v4", "attack_spear_v4", "attack_bow_v4",
  "idle_chokento_v1", "idle_katana_v1", "idle_axe_v1", "idle_spear_v1", "idle_bow_v1",
  "motion_chokento_jump_v1", "motion_chokento_fall_v1", "motion_chokento_guard_v1", "motion_chokento_hurt_v1",
  "motion_katana_jump_v1", "motion_katana_fall_v1", "motion_katana_guard_v1", "motion_katana_hurt_v1",
  "motion_axe_jump_v1", "motion_axe_fall_v1", "motion_axe_guard_v1", "motion_axe_hurt_v1",
  "motion_spear_jump_v1", "motion_spear_fall_v1", "motion_spear_guard_v1", "motion_spear_hurt_v1",
  "motion_bow_jump_v1", "motion_bow_fall_v1", "motion_bow_guard_v1", "motion_bow_hurt_v1",
];

const GAMEPLAY_SPRITE_NAMES = [
  "bg_near_v3", "bg_stage_v3",
  ...WEAPON_ANIMATION_SPRITE_NAMES,
  "vfx_chokento_v1", "vfx_katana_v1", "vfx_axe_v1", "vfx_spear_v1", "vfx_bow_v1",
  "vfx_weapon_particles_v1",
  "combo_digits_v2", "combo_burst_v2",
  "monster_slime_v2", "monster_mushroom_v2", "monster_ghost_v2", "monster_golem_v2",
  "monster_boss_storm_v2",
  "forge_atlas",
];
const MONSTER_SPRITES = Object.freeze(Object.fromEntries(
  Object.values(MONSTER_DEFINITIONS).map((definition) => [definition.spriteKey, definition]),
));
const WEAPON_SPRITE_NAMES = [
  "wpn_longsword_v2", "wpn_katana_v2", "wpn_axe_v2", "wpn_spear_v2", "wpn_bow_v2",
];
const SPRITE_FILES = {
  monster_boss_storm_v2: "monster_boss_storm_v3.png",
  bg_mid_v3: "bg_mid_v3.webp",
  title_keyart_mobile_v5: "title_keyart_mobile_v5.webp",
  title_keyart_mobile_v6: "title_keyart_mobile_v6.webp",
  title_keyart_medium_portrait_v7: "title_keyart_medium_portrait_v7.webp",
  title_keyart_square_v5: "title_keyart_square_v5.webp",
  title_keyart_wide_v5: "title_keyart_wide_v5.webp",
  title_logo_v4: "title_logo_v4.webp",
  attack_chokento_v4: "attack_chokento_v4.webp",
  attack_katana_v4: "attack_katana_v4.webp",
  attack_axe_v4: "attack_axe_v4.webp",
  attack_spear_v4: "attack_spear_v4.webp",
  attack_bow_v4: "attack_bow_v4.webp",
  idle_chokento_v1: "idle_chokento_v1.webp",
  idle_katana_v1: "idle_katana_v1.webp",
  idle_axe_v1: "idle_axe_v1.webp",
  idle_spear_v1: "idle_spear_v1.webp",
  idle_bow_v1: "idle_bow_v1.webp",
  motion_chokento_jump_v1: "motion_chokento_jump_v1.webp",
  motion_chokento_fall_v1: "motion_chokento_fall_v1.webp",
  motion_chokento_guard_v1: "motion_chokento_guard_v1.webp",
  motion_chokento_hurt_v1: "motion_chokento_hurt_v1.webp",
  motion_katana_jump_v1: "motion_katana_jump_v1.webp",
  motion_katana_fall_v1: "motion_katana_fall_v1.webp",
  motion_katana_guard_v1: "motion_katana_guard_v1.webp",
  motion_katana_hurt_v1: "motion_katana_hurt_v1.webp",
  motion_axe_jump_v1: "motion_axe_jump_v1.webp",
  motion_axe_fall_v1: "motion_axe_fall_v1.webp",
  motion_axe_guard_v1: "motion_axe_guard_v1.webp",
  motion_axe_hurt_v1: "motion_axe_hurt_v1.webp",
  motion_spear_jump_v1: "motion_spear_jump_v1.webp",
  motion_spear_fall_v1: "motion_spear_fall_v1.webp",
  motion_spear_guard_v1: "motion_spear_guard_v1.webp",
  motion_spear_hurt_v1: "motion_spear_hurt_v1.webp",
  motion_bow_jump_v1: "motion_bow_jump_v1.webp",
  motion_bow_fall_v1: "motion_bow_fall_v1.webp",
  motion_bow_guard_v1: "motion_bow_guard_v1.webp",
  motion_bow_hurt_v1: "motion_bow_hurt_v1.webp",
  vfx_chokento_v1: "vfx_chokento_v1.webp",
  vfx_katana_v1: "vfx_katana_v1.webp",
  vfx_axe_v1: "vfx_axe_v1.webp",
  vfx_spear_v1: "vfx_spear_v1.webp",
  vfx_bow_v1: "vfx_bow_v1.webp",
  vfx_weapon_particles_v1: "vfx_weapon_particles_v1.webp",
  combo_digits_v2: "combo_digits_v2.webp",
  combo_burst_v2: "combo_burst_v2.webp",
  ui_frame_atlas_v1: "ui_frame_atlas_v1.webp",
  ui_icon_atlas_v1: "ui_icon_atlas_v1.webp",
};

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Same-origin rewrites still need this when a fallback CDN URL is used.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`필수 이미지 자산을 불러오지 못했습니다: ${path}`));
    img.src = path;
  });
}

async function loadNamedSprites(names, sprites, base, onProgress) {
  let loaded = 0;
  const failures = [];
  await Promise.all(names.map(async (name) => {
    try {
      sprites[name] = await loadImage(`${base}${SPRITE_FILES[name] || `${name}.png`}`);
    } catch (error) {
      sprites[name] = null;
      failures.push(error);
    } finally {
      loaded += 1;
      onProgress(loaded, names.length, name);
    }
  }));
  if (failures.length) throw new AggregateError(failures, `${failures.length}개 필수 이미지 자산 로드 실패`);
  return sprites;
}

export async function loadCriticalSprites(base = "./assets/img/", onProgress = () => {}) {
  const names = [
    "bg_far_mobile_v3", "bg_far_wide_v3", "bg_mid_v3",
    "title_keyart_mobile_v6", "title_keyart_medium_portrait_v7", "title_keyart_square_v5", "title_keyart_wide_v5", "title_logo_v4",
    "ui_frame_atlas_v1", "ui_icon_atlas_v1",
    ...WEAPON_SPRITE_NAMES,
  ];
  return loadNamedSprites(names, {}, base, onProgress);
}

export async function loadGameplaySprites(sprites, base = "./assets/img/", onProgress = () => {}) {
  await loadNamedSprites(GAMEPLAY_SPRITE_NAMES, sprites, base, onProgress);
  for (const [name, kind] of Object.entries(MONSTER_SPRITES)) {
    prepareMonsterSprite(sprites[name], kind);
  }
  return sprites;
}

export function gameplaySpriteNames() {
  return [...GAMEPLAY_SPRITE_NAMES];
}

export async function loadSprites(base = "./assets/img/", onProgress = () => {}) {
  const sprites = {};
  await loadNamedSprites([
    "bg_far_mobile_v3", "bg_far_wide_v3", "bg_mid_v3", "bg_near_v3", "bg_stage_v3",
    "title_keyart_mobile_v6", "title_keyart_medium_portrait_v7", "title_keyart_square_v5", "title_keyart_wide_v5", "title_logo_v4",
    "ui_frame_atlas_v1", "ui_icon_atlas_v1",
  ], sprites, base, () => {});
  await loadNamedSprites([...WEAPON_SPRITE_NAMES, ...GAMEPLAY_SPRITE_NAMES], sprites, base, onProgress);
  return sprites;
}

// White/red silhouette variants for hit flashes — built once per sprite.
const tintCache = new Map();

export function tinted(sprite, color) {
  if (!sprite) return null;
  const key = `${sprite.src}|${color}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const g = c.getContext("2d");
  g.drawImage(sprite, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}
