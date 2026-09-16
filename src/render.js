// World renderer. The generated far/mid/near scene stays visually separate
// from the world-synced stage, monster and player layers.
import * as engine from "./engine.js";
import { tinted } from "./assets.js";
import { monsterArtLayout } from "./monster-grid.js";
import {
  ATTACK_ATLAS_COLUMNS,
  ATTACK_FRAME_HEIGHT,
  ATTACK_FRAME_WIDTH,
  ATTACK_GROUND_ANCHOR_X,
  ATTACK_GROUND_ANCHOR_Y,
  IDLE_ATLAS_COLUMNS,
  attackFrameAt,
  idleFrameAt,
  weaponCharacterScale,
} from "./attack-motion.js";

const LANE_W = engine.LANE_W;
const ROW_H = engine.ORIGINAL_ROW_HEIGHT;
const ATTACK_DRAW_SCALE = 0.64;
const MOTION_FRAME_COUNT = 12;
const MOTION_ATLAS_COLUMNS = 4;
const MOTION_GROUND_ANCHOR_Y = 420;
const AXE_JUMP_GROUND_ANCHOR_X = 252;
const AXE_JUMP_GROUND_ANCHOR_Y = 469;
const HURT_MOTION_DURATION = 0.8;
const GUARD_MOTION_FPS = 18;
const STAGE_SURFACE_SOURCE_Y = 746;
const STAGE_VISIBLE_DEPTH = 82;
const FAR_PARALLAX = 0.04;
const MID_PARALLAX = 0.16;
const NEAR_PARALLAX = 0.3;
const FAR_PARALLAX_LIMIT = 28;
const MID_PARALLAX_LIMIT = 104;
const NEAR_PARALLAX_LIMIT = 192;
const FAR_DEPTH_BLUR = 4;
const MID_DEPTH_BLUR = 2;
const HIT_FLASH_TINTS = Object.freeze({
  chokento: "#9de6ff",
  katana: "#d2c5ff",
  axe: "#ffc36a",
  spear: "#a8f0ff",
  bow: "#fff1a8",
});
const MONSTER_GRID_COLORS = Object.freeze([
  "#79d9ff",
  "#b8a5ff",
  "#ffd36a",
]);
const MONSTER_GRID_ALPHA = Object.freeze([0.18, 0.3, 0.56]);
const MONSTER_GRID_WIDTH = Object.freeze([0.9, 1.1, 1.5]);
const MONSTER_HP_COLORS = Object.freeze({
  high: "#85e0a7",
  mid: "#ffd36a",
  low: "#ff6b70",
});

// Debris tints per body-part tier (leaf/bark/root).
export const DEBRIS_PALETTES = [
  ["#9fbd72", "#64834e", "#36543a"],
  ["#a98258", "#76513a", "#493223"],
  ["#7f8a72", "#4d5d4b", "#28372e"],
  ["#ffb15c", "#ff7a1a", "#8f3d00"],
];

export const MONSTER_DEBRIS_PALETTES = {
  slime: ["#b8df6b", "#79b84a", "#e7f6a8"],
  mushroom: ["#e9785c", "#f3d8ad", "#8cad55"],
  ghost: ["#dff5ff", "#9fdcff", "#779fc6"],
  golem: ["#a9a28f", "#6f7568", "#7ea05d"],
  boss: ["#64739f", "#354369", "#e8b34b"],
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function createWorld(ctx, sprites = {}) {
  const W = engine.W;
  const H = engine.H;
  const filteredLayerCache = new Map();

  function filteredLayer(sprite, width, height, filter) {
    if (!filter || filter === "none") return sprite;
    const cacheW = Math.max(1, Math.ceil(width));
    const cacheH = Math.max(1, Math.ceil(height));
    const key = `${sprite.currentSrc || sprite.src}|${cacheW}x${cacheH}|${filter}`;
    if (filteredLayerCache.has(key)) return filteredLayerCache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = cacheW;
    canvas.height = cacheH;
    canvas.__zanSourceUrl = sprite.currentSrc || sprite.src || "";
    canvas.__zanFilter = filter;
    const layerCtx = canvas.getContext("2d");
    layerCtx.imageSmoothingEnabled = true;
    layerCtx.filter = filter;
    layerCtx.drawImage(sprite, 0, 0, cacheW, cacheH);
    layerCtx.filter = "none";
    filteredLayerCache.set(key, canvas);
    return canvas;
  }

  function drawCoverLayer(sprite, offsetY, maxTravel, filter = "none", overscan = 0) {
    const scale = Math.max(
      (W + overscan * 2) / sprite.width,
      (H + maxTravel + overscan * 2) / sprite.height,
    );
    const drawW = sprite.width * scale;
    const drawH = sprite.height * scale;
    const layer = filteredLayer(sprite, drawW, drawH, filter);
    ctx.drawImage(layer, (W - layer.width) / 2, H + overscan - layer.height + offsetY);
  }

  function drawWidthLayer(sprite, offsetY, alpha, filter, verticalOverscan = 0, filterOverscan = 0) {
    const scale = Math.max(
      (W + filterOverscan * 2) / sprite.width,
      verticalOverscan ? (H + verticalOverscan + filterOverscan * 2) / sprite.height : 0,
    );
    const drawW = sprite.width * scale;
    const drawH = sprite.height * scale;
    const layer = filteredLayer(sprite, drawW, drawH, filter);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, (W - layer.width) / 2, H + filterOverscan - layer.height + offsetY);
    ctx.restore();
  }

  function drawBackground(t, camY, stageVisual = {}) {
    const shift = clamp(-camY * 0.15, 0, 158);
    const type = stageVisual.scene === "run" ? stageVisual.typeId : "normal";
    const reduced = stageVisual.effectsReduced === true;
    const rushMistMul = type === "rush" ? 2.1 : 1;
    const stageFilter = type === "armored" ? " saturate(0.66)"
      : type === "boss" ? " saturate(0.72) brightness(0.82)"
        : type === "rush" ? " hue-rotate(-12deg) saturate(0.86)"
        : type === "treasure" ? " saturate(0.92) brightness(1.04)" : "";
    const far = W <= engine.BASE_W + 4
      ? sprites.bg_far_mobile_v3
      : sprites.bg_far_wide_v3;
    const farY = clamp(-camY * FAR_PARALLAX, 0, FAR_PARALLAX_LIMIT);
    const midY = clamp(-camY * MID_PARALLAX, 0, MID_PARALLAX_LIMIT);
    const nearY = clamp(-camY * NEAR_PARALLAX, 0, NEAR_PARALLAX_LIMIT);
    ctx.fillStyle = "#061c48";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    drawCoverLayer(far, farY, FAR_PARALLAX_LIMIT, `blur(${FAR_DEPTH_BLUR}px)${stageFilter}`, FAR_DEPTH_BLUR * 3);
    drawWidthLayer(
      sprites.bg_mid_v3,
      midY,
      0.5,
      `blur(${MID_DEPTH_BLUR}px) saturate(0.86) brightness(0.91)${stageFilter}`,
      0,
      MID_DEPTH_BLUR * 3,
    );
    if (stageVisual.scene === "run") {
      const nearOverscan = W > engine.BASE_W + 80 ? NEAR_PARALLAX_LIMIT : 0;
      drawWidthLayer(sprites.bg_near_v3, nearY, 0.74, "saturate(0.86) brightness(0.84)", nearOverscan);
    }
    ctx.restore();

    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, "rgba(3,16,50,0.05)");
    wash.addColorStop(0.62, "rgba(4,18,43,0.1)");
    wash.addColorStop(1, "rgba(5,12,28,0.12)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 3; i += 1) {
      const y = 160 + i * 120 + shift * (0.3 + i * 0.15);
      const x = ((t * (7 + i * 4) * rushMistMul + i * 280) % (W + 520)) - 260;
      const mist = ctx.createRadialGradient(x, y, 10, x, y, 210);
      mist.addColorStop(0, `rgba(125,175,230,${type === "rush" ? 0.09 : 0.025})`);
      mist.addColorStop(1, "rgba(125,175,230,0)");
      ctx.fillStyle = mist;
      ctx.fillRect(x - 210, y - 70, 420, 140);
    }

    // Atmosphere stays at the sides; vertical movement and coral indicators in
    // the combat lanes belong exclusively to actual attacks.
    if (type === "rush") {
      ctx.save();
      const windLight = ctx.createLinearGradient(0, 0, W, 0);
      windLight.addColorStop(0, "rgba(92,219,224,0.12)");
      windLight.addColorStop(0.5, "rgba(92,219,224,0)");
      windLight.addColorStop(1, "rgba(92,219,224,0.12)");
      ctx.fillStyle = windLight;
      ctx.fillRect(0, 110, W, H - 110);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(164,216,249,0.13)";
      for (let i = 0; i < 5; i += 1) {
        const x = ((t * (reduced ? 12 : 46) + i * 263) % (W + 180)) - 90;
        const y = 185 + i * 63;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 36, y - 8, x + 96, y - 4);
        ctx.stroke();
      }
      ctx.restore();
    } else if (type === "treasure") {
      ctx.save();
      ctx.strokeStyle = "#c5f8ff";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i += 1) {
        const x = W * (i % 2 ? 0.86 : 0.14) + Math.sin(i * 2.3) * 34;
        const y = 166 + i * 46;
        const alpha = Math.max(0, Math.sin(t * (reduced ? 0.7 : 1.7) + i * 1.8));
        ctx.globalAlpha = alpha * 0.38;
        ctx.beginPath();
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
      ctx.restore();
    } else if (type === "boss") {
      for (const side of [0, W]) {
        const storm = ctx.createRadialGradient(side, 175, 8, side, 175, Math.min(W * 0.62, 420));
        storm.addColorStop(0, "rgba(43,36,72,0.55)");
        storm.addColorStop(1, "rgba(43,36,72,0)");
        ctx.fillStyle = storm;
        ctx.fillRect(0, 90, W, H * 0.64);
      }
      const warning = ["warning", "telegraph"].includes(stageVisual.bossAction?.phase);
      const glow = ctx.createLinearGradient(0, 0, 0, Math.min(300, H * 0.4));
      glow.addColorStop(0, warning ? "rgba(255,122,122,0.13)" : "rgba(133,151,212,0.09)");
      glow.addColorStop(1, "rgba(133,151,212,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, Math.min(300, H * 0.4));
    }
  }

  // --- world-space pieces (call inside camera transform) ---
  function drawGround(camY, { worldScale = 1 } = {}) {
    ctx.fillStyle = "#151021";
    ctx.fillRect(-W, engine.GROUND_Y, W * 3, H);
    ctx.fillStyle = "#241a3e";
    ctx.fillRect(-W, engine.GROUND_Y, W * 3, 5);
    ctx.strokeStyle = "rgba(122,101,190,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-W, engine.GROUND_Y + 0.5);
    ctx.lineTo(W * 2, engine.GROUND_Y + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    for (let r = 0; r < 3; r += 1) {
      const y = engine.GROUND_Y + 16 + r * 20;
      for (let x = ((r % 2) * 17) - W; x < W * 2; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y);
        ctx.stroke();
      }
    }
    const stage = sprites.bg_stage_v3;
    const stageWidth = W / clamp(worldScale, 0.25, 1);
    const scale = stageWidth / stage.width;
    const sourceDepth = Math.min(stage.height - STAGE_SURFACE_SOURCE_Y, STAGE_VISIBLE_DEPTH / scale);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      stage,
      0,
      STAGE_SURFACE_SOURCE_Y,
      stage.width,
      sourceDepth,
      (W - stageWidth) / 2,
      engine.GROUND_Y,
      stageWidth,
      sourceDepth * scale,
    );
    ctx.restore();
  }

  function drawLaneGlow(camY, stageVisual = {}) {
    const laneAlpha = stageVisual.typeId === "rush" ? 0.075 : 0.05;
    for (let lane = 1; lane < engine.LANES; lane += 1) {
      const x = engine.BUILDING_X + lane * LANE_W;
      const grad = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
      grad.addColorStop(0, "rgba(232,179,75,0)");
      grad.addColorStop(0.5, `rgba(232,179,75,${laneAlpha})`);
      grad.addColorStop(1, "rgba(232,179,75,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - 10, camY - 760, 20, engine.GROUND_Y - (camY - 760));
    }
  }

  function drawMonsterSlice(sprite, floor, layout, x, y, height) {
    const bandTop = (floor.rowIndex - 1) * ROW_H;
    const overlapTop = Math.max(bandTop, layout.drawTop);
    const overlapBottom = Math.min(bandTop + ROW_H, layout.drawTop + layout.drawH);
    if (overlapBottom <= overlapTop) return;
    const sourceY = layout.source.y + (overlapTop - layout.drawTop) / layout.drawH * layout.source.h;
    const sourceH = (overlapBottom - overlapTop) / layout.drawH * layout.source.h;
    const destinationY = y + (overlapTop - bandTop) / ROW_H * height;
    const destinationH = (overlapBottom - overlapTop) / ROW_H * height;
    ctx.drawImage(
      sprite,
      layout.source.x,
      sourceY,
      layout.source.w,
      sourceH,
      x,
      destinationY,
      layout.drawW,
      destinationH,
    );
  }

  function drawMonsterRim(sprite, floor, layout, x, y, height, color, alpha) {
    const rim = tinted(sprite, color);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
      drawMonsterSlice(rim, floor, layout, x + dx, y + dy, height);
    }
    ctx.restore();
  }

  function drawMonsterCellOverlay(floor, y) {
    for (let lane = 0; lane < engine.LANES; lane += 1) {
      const cell = floor.cells[lane];
      if (!cell || cell.active === false || cell.hp <= 0) continue;
      const x = engine.BUILDING_X + lane * LANE_W;
      const importance = Math.max(0, Math.min(MONSTER_GRID_COLORS.length - 1, cell.type || 0));
      const gridColor = MONSTER_GRID_COLORS[importance];
      const ratio = engine.cellHpRatio(cell);
      const hpColor = ratio <= 0.33
        ? MONSTER_HP_COLORS.low
        : ratio <= 0.66 ? MONSTER_HP_COLORS.mid : MONSTER_HP_COLORS.high;
      const hpAlpha = ratio <= 0.33 ? 0.12 : ratio <= 0.66 ? 0.075 : 0.04;

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = hpAlpha;
      ctx.fillStyle = hpColor;
      const healthFillH = ROW_H * ratio;
      ctx.fillRect(x, y + ROW_H - healthFillH, LANE_W, healthFillH);

      ctx.globalAlpha = 1;
      ctx.lineJoin = "round";
      ctx.globalAlpha = MONSTER_GRID_ALPHA[importance];
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = MONSTER_GRID_WIDTH[importance];
      if (importance === 2) {
        ctx.shadowColor = gridColor;
        ctx.shadowBlur = 2;
      }
      ctx.strokeRect(x + 4.5, y + 4.5, LANE_W - 9, ROW_H - 9);
      if (cell.flash > 0) {
        ctx.globalAlpha = clamp(cell.flash / 0.2, 0, 1) * 0.78;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = HIT_FLASH_TINTS[cell.hitWeapon] || "#fff2c8";
        ctx.strokeRect(x + 5.5, y + 5.5, LANE_W - 11, ROW_H - 11);
      }
      ctx.restore();
    }
  }

  // Each quadrant is one complete monster. Equal horizontal source bands keep
  // row collapse intact while the cell overlay exposes target zones and health.
  function drawMonster(building, t, stageVisual = {}) {
    const floors = building.floors;
    if (!floors.length) return;
    if (building.fixture !== true && (!building.monsterDefinition
      || building.monsterId !== building.monsterDefinition.id
      || building.spriteKey !== building.monsterDefinition.spriteKey)) {
      throw new Error("몬스터 데이터와 표시 이미지가 일치하지 않습니다");
    }
    const left = engine.BUILDING_X;
    const bottomEdge = engine.buildingVisualBottomEdge(building);
    const kind = building.monsterKind || "slime";
    const source = building.spriteKey ? sprites[building.spriteKey] : stageVisual.typeId === "boss"
      ? sprites.monster_boss_storm_v2
      : sprites[`monster_${kind}_v2`];
    if (!source) throw new Error(`몬스터 이미지가 없습니다: ${building.spriteKey || kind}`);
    const originalRows = Math.max(1, building.originalFloorCount || building.floorCount || floors.length);
    const artKind = building.artKind || (stageVisual.typeId === "boss" ? "boss" : kind);
    const layout = building.monsterLayout || monsterArtLayout(source, building.monsterDefinition || artKind, originalRows, {
      width: engine.BUILDING_W,
      rowHeight: ROW_H,
      lanes: engine.LANES,
    });
    const bodyX = left + layout.drawX;

    for (let floorIndex = 0; floorIndex < floors.length; floorIndex += 1) {
      const floor = floors[floorIndex];
      const y = engine.floorWorldY(building, floor);

      if (stageVisual.typeId === "elite") {
        drawMonsterRim(source, floor, layout, bodyX, y, ROW_H + 1, "#ffd98a", 0.16);
      } else if (stageVisual.typeId === "treasure") {
        drawMonsterRim(source, floor, layout, bodyX, y, ROW_H + 1, "#8fe3ff", 0.14);
      } else if (stageVisual.typeId === "boss") {
        const charging = ["warning", "telegraph"].includes(stageVisual.bossAction?.phase);
        drawMonsterRim(source, floor, layout, bodyX, y, ROW_H + 1, charging ? "#ffb08c" : "#e8b34b", charging ? 0.32 : 0.14);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      drawMonsterSlice(source, floor, layout, bodyX, y, ROW_H + 1);
      if (stageVisual.typeId === "armored") {
        const dark = tinted(source, "#09061d");
        ctx.globalAlpha = 0.3;
        drawMonsterSlice(dark, floor, layout, bodyX, y, ROW_H + 1);
      }
      ctx.restore();

      for (let lane = 0; lane < engine.LANES; lane += 1) {
        const cell = floor.cells[lane];
        if (!cell || cell.active === false || cell.hp <= 0) continue;
        const alphaPulse = cell.special === "bomber" ? 0.7 + 0.3 * Math.sin(t * Math.PI * 3) : 1;

        if (cell.special === "bomber" || cell.flash > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(left + lane * LANE_W + 7, y + 4, LANE_W - 14, ROW_H - 8);
          ctx.clip();
          ctx.imageSmoothingEnabled = true;
          if (cell.special === "bomber") {
            ctx.globalAlpha = alphaPulse * 0.5;
            drawMonsterSlice(tinted(source, "#ff7a1a"), floor, layout, bodyX, y, ROW_H + 1);
          }
          if (cell.flash > 0) {
            const flashTint = HIT_FLASH_TINTS[cell.hitWeapon] || "#ffffff";
            ctx.globalAlpha = (cell.flash / 0.2) * 0.42;
            drawMonsterSlice(tinted(source, flashTint), floor, layout, bodyX, y, ROW_H + 1);
          }
          ctx.restore();
        }

      }
      drawMonsterCellOverlay(floor, y);
    }

    // Boss health/action lives in the top HUD. This contact line only appears
    // when the body itself is close enough to pose a threat.
    const dist = engine.CRUSH_CONTACT_Y - bottomEdge;
    if (dist < 150) {
      const k = clamp(1 - dist / 150, 0, 1);
      const a = k * (0.17 + 0.045 * Math.sin(t * 6));
      const grad = ctx.createLinearGradient(0, bottomEdge, 0, bottomEdge + 30);
      grad.addColorStop(0, `rgba(229,72,77,${a})`);
      grad.addColorStop(1, "rgba(229,72,77,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(left + 5, bottomEdge, engine.BUILDING_W - 10, 22);
      ctx.save();
      ctx.globalAlpha = k * 0.5;
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = "#e5484d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + 5, bottomEdge + 2.5);
      ctx.lineTo(left + engine.BUILDING_W - 5, bottomEdge + 2.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Actual enemy attacks. Called after decorative particles so the warning
  // footprint and the solid cloudstone cannot be buried by weapon effects.
  function drawBossHazards(hazards = [], { cameraY = 0, time = 0, reducedEffects = false } = {}) {
    for (const hazard of hazards) {
      if (!["telegraph", "falling"].includes(hazard.phase)) continue;
      const x = hazard.x;
      const groundY = hazard.targetY ?? engine.GROUND_Y;
      const radius = hazard.radius || 22;
      const progress = hazard.phase === "telegraph"
        ? clamp(hazard.age / Math.max(0.001, hazard.warningDuration), 0, 1) : 1;
      ctx.save();
      // The warning is light on the floor, never a HUD badge or progress bar.
      // A stable footprint becomes brighter as impact approaches.
      ctx.save();
      ctx.translate(x, groundY - 3);
      ctx.scale(1, 0.25);
      const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, 78);
      aura.addColorStop(0, `rgba(255,219,168,${0.18 + progress * 0.48})`);
      aura.addColorStop(0.4, `rgba(255,114,103,${0.22 + progress * 0.43})`);
      aura.addColorStop(0.72, `rgba(236,71,101,${0.2 + progress * 0.25})`);
      aura.addColorStop(1, "rgba(236,71,101,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(-78, -78, 156, 156);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,171,137,${0.5 + progress * 0.4})`;
      ctx.lineWidth = 1.5 + progress;
      ctx.shadowColor = "#f57478";
      ctx.shadowBlur = reducedEffects ? 3 : 7 + progress * 5;
      ctx.beginPath();
      ctx.ellipse(x, groundY - 3, 65, 15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,232,189,${0.15 + progress * 0.5})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x, groundY - 3, 40 + progress * 9, 9 + progress * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (hazard.phase === "telegraph") {
        // A short gathering glow stays attached to the launch point. The
        // fixed warning lane never tracks the player after this point.
        ctx.globalAlpha = 0.24 + progress * 0.26;
        ctx.strokeStyle = "#ffd4ad";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, hazard.spawnY, radius * (1.5 - progress * 0.5), radius * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const y = hazard.y;
        const tail = ctx.createLinearGradient(x, y - radius - 56, x, y);
        tail.addColorStop(0, "rgba(255,158,138,0)");
        tail.addColorStop(1, reducedEffects ? "rgba(255,158,138,0.15)" : "rgba(255,158,138,0.34)");
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(x - radius * 0.7, y);
        ctx.lineTo(x - radius * 0.35, y - radius - 56);
        ctx.lineTo(x + radius * 0.35, y - radius - 56);
        ctx.lineTo(x + radius * 0.7, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#536080";
        ctx.strokeStyle = "#ffad94";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - radius, y + radius * 0.2);
        ctx.quadraticCurveTo(x - radius * 1.08, y - radius * 0.55, x - radius * 0.45, y - radius * 0.67);
        ctx.quadraticCurveTo(x, y - radius * 1.15, x + radius * 0.53, y - radius * 0.56);
        ctx.quadraticCurveTo(x + radius * 1.1, y - radius * 0.36, x + radius * 0.92, y + radius * 0.4);
        ctx.lineTo(x + radius * 0.3, y + radius * 0.9);
        ctx.lineTo(x - radius * 0.55, y + radius * 0.76);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff2c8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + radius * 0.2, y - radius * 0.53);
        ctx.lineTo(x - radius * 0.2, y);
        ctx.lineTo(x + radius * 0.18, y + radius * 0.04);
        ctx.lineTo(x - radius * 0.16, y + radius * 0.57);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawActiveAttacks(attacks) {
    for (const a of attacks) {
      // The reach trace exists only while the attack travels. Once it connects,
      // the generated hit sprite owns the impact frame without a lingering beam.
      if (a.done) continue;
      const k = Math.max(0, 1 - a.t / a.life);
      const traveled = Math.abs(a.fromY - a.y);
      if (traveled < 1) continue;
      const colors = a.weaponId === "katana"
        ? ["rgba(128,104,216,0)", "rgba(200,181,255,0.55)", "rgba(255,255,255,0.92)"]
        : a.kind === "thrust"
        ? ["rgba(91,222,255,0)", "rgba(141,234,255,0.62)", "rgba(245,255,255,0.92)"]
        : a.kind === "heavy"
          ? ["rgba(255,154,71,0)", "rgba(255,191,98,0.5)", "rgba(255,243,196,0.88)"]
          : ["rgba(75,124,255,0)", "rgba(134,215,255,0.5)", "rgba(237,248,255,0.88)"];
      const gradient = ctx.createLinearGradient(a.x, a.fromY, a.x, a.y);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.62, colors[1]);
      gradient.addColorStop(1, colors[2]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + k * 0.42;
      ctx.strokeStyle = gradient;
      ctx.shadowColor = a.kind === "heavy" ? "#ffad54"
        : a.kind === "thrust" ? "#77e9ff"
          : a.weaponId === "katana" ? "#8068d8" : "#83cfff";
      ctx.shadowBlur = a.kind === "heavy" ? 14 : 10;
      ctx.lineWidth = a.kind === "heavy" ? 12
        : a.kind === "thrust" ? 5
          : a.weaponId === "katana" ? 3 : 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.fromY);
      if (a.kind === "thrust") {
        ctx.lineTo(a.x, a.y);
      } else {
        const bend = a.kind === "heavy" ? 38 : a.weaponId === "katana" ? -24 : 28;
        ctx.bezierCurveTo(
          a.x + bend,
          a.fromY - traveled * 0.28,
          a.x - bend * 0.42,
          a.y + traveled * 0.24,
          a.x,
          a.y,
        );
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + k * 0.35})`;
      ctx.lineWidth = a.kind === "heavy" ? 2.4
        : a.kind === "thrust" ? 1.4
          : a.weaponId === "katana" ? 1 : 1.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.fromY);
      if (a.kind === "thrust") {
        ctx.lineTo(a.x, a.y);
      } else {
        const bend = a.kind === "heavy" ? 38 : a.weaponId === "katana" ? -24 : 28;
        ctx.bezierCurveTo(
          a.x + bend,
          a.fromY - traveled * 0.28,
          a.x - bend * 0.42,
          a.y + traveled * 0.24,
          a.x,
          a.y,
        );
      }
      ctx.stroke();

      const headRadius = a.kind === "heavy" ? 21 : a.kind === "thrust" ? 12 : 15;
      ctx.globalAlpha = k * (a.kind === "heavy" ? 0.52 : 0.68);
      ctx.strokeStyle = a.kind === "heavy" ? "#ffbf62" : a.kind === "thrust" ? "#8deaff" : "#86d7ff";
      ctx.lineWidth = a.kind === "heavy" ? 3 : 1.8;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, headRadius, headRadius * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawProjectiles(projectiles) {
    for (const p of projectiles) {
      if (p.kind !== "arrow") continue;
      const alpha = p.fading ? Math.max(0, 1 - p.fadeT / 0.22) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "lighter";
      const wake = p.fading ? 28 : 62;
      const gradient = ctx.createLinearGradient(p.x, p.y + wake, p.x, p.y);
      gradient.addColorStop(0, "rgba(96,168,216,0)");
      gradient.addColorStop(0.58, "rgba(167,240,255,0.42)");
      gradient.addColorStop(1, "rgba(255,248,207,0.95)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(167,240,255,0.72)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + wake);
      ctx.lineTo(p.x, p.y + 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + Math.min(24, wake));
      ctx.lineTo(p.x, p.y + 2);
      ctx.stroke();
      // arrowhead
      ctx.fillStyle = "#fff8cf";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 4, p.y + 5);
      ctx.lineTo(p.x - 4, p.y + 5);
      ctx.closePath();
      ctx.fill();
      if (!p.fading) {
        ctx.globalAlpha = alpha * 0.48;
        ctx.strokeStyle = "#a7f0ff";
        ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(p.x + side * 4, p.y + 18);
          ctx.lineTo(p.x + side * 8, p.y + 34);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // --- the hero ---
  function lerp(a, b, k) {
    return a + (b - a) * clamp(k, 0, 1);
  }

  function heroPose(p, anim, t) {
    const laneK = anim.laneT / 0.09;
    const x = laneK < 1 ? lerp(anim.laneFromX, p.x, easeOutCubic(laneK)) : p.x;
    return {
      x,
      y: p.y,
      air: p.y < engine.GROUND_Y - 2 && p.jumpPrepFrames === 0,
      falling: p.y < engine.GROUND_Y - 2 && p.jumpPrepFrames === 0 && p.vy > 80,
      crouch: p.jumpPrepFrames > 0,
      hurt: p.hurtTimer > 0,
      guard: p.guardTimer > 0 && p.hurtTimer <= 0,
      waza: p.specialTimer > 0,
      attackA: anim.attackT / anim.attackDur,
      attackFrame: attackFrameAt(anim.attackT, anim.attackDur),
    };
  }

  function drawAttackAtlasFrame(atlas, frame, weaponId) {
    const sourceX = (frame % ATTACK_ATLAS_COLUMNS) * ATTACK_FRAME_WIDTH;
    const sourceY = Math.floor(frame / ATTACK_ATLAS_COLUMNS) * ATTACK_FRAME_HEIGHT;
    const drawScale = ATTACK_DRAW_SCALE * weaponCharacterScale(weaponId);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      atlas,
      sourceX,
      sourceY,
      ATTACK_FRAME_WIDTH,
      ATTACK_FRAME_HEIGHT,
      -ATTACK_GROUND_ANCHOR_X * drawScale,
      -ATTACK_GROUND_ANCHOR_Y * drawScale,
      ATTACK_FRAME_WIDTH * drawScale,
      ATTACK_FRAME_HEIGHT * drawScale,
    );
    ctx.restore();
  }

  function drawIdleAtlasFrame(atlas, frame, weaponId) {
    const sourceX = (frame % IDLE_ATLAS_COLUMNS) * ATTACK_FRAME_WIDTH;
    const sourceY = Math.floor(frame / IDLE_ATLAS_COLUMNS) * ATTACK_FRAME_HEIGHT;
    const drawScale = ATTACK_DRAW_SCALE * weaponCharacterScale(weaponId);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      atlas,
      sourceX,
      sourceY,
      ATTACK_FRAME_WIDTH,
      ATTACK_FRAME_HEIGHT,
      -ATTACK_GROUND_ANCHOR_X * drawScale,
      -ATTACK_GROUND_ANCHOR_Y * drawScale,
      ATTACK_FRAME_WIDTH * drawScale,
      ATTACK_FRAME_HEIGHT * drawScale,
    );
    ctx.restore();
  }

  function drawMotionAtlasFrame(atlas, frame, weaponId, state) {
    const sourceX = (frame % MOTION_ATLAS_COLUMNS) * ATTACK_FRAME_WIDTH;
    const sourceY = Math.floor(frame / MOTION_ATLAS_COLUMNS) * ATTACK_FRAME_HEIGHT;
    const drawScale = ATTACK_DRAW_SCALE * weaponCharacterScale(weaponId);
    const axeJump = weaponId === "axe" && state === "jump";
    const anchorX = axeJump ? AXE_JUMP_GROUND_ANCHOR_X : ATTACK_GROUND_ANCHOR_X;
    const anchorY = axeJump ? AXE_JUMP_GROUND_ANCHOR_Y : MOTION_GROUND_ANCHOR_Y;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      atlas,
      sourceX,
      sourceY,
      ATTACK_FRAME_WIDTH,
      ATTACK_FRAME_HEIGHT,
      -anchorX * drawScale,
      -anchorY * drawScale,
      ATTACK_FRAME_WIDTH * drawScale,
      ATTACK_FRAME_HEIGHT * drawScale,
    );
    ctx.restore();
  }

  function motionFrameAt(state, p, anim) {
    if (state === "hurt") {
      const progress = 1 - clamp(p.hurtTimer / HURT_MOTION_DURATION, 0, 1);
      return Math.min(MOTION_FRAME_COUNT - 1, Math.floor(progress * MOTION_FRAME_COUNT));
    }
    if (state === "guard") {
      return Math.min(MOTION_FRAME_COUNT - 1, Math.floor(anim.guardT * GUARD_MOTION_FPS));
    }
    if (state === "fall") {
      const progress = clamp(p.vy / -engine.JUMP_START_VY, 0, 1);
      return Math.min(MOTION_FRAME_COUNT - 1, Math.floor(progress * MOTION_FRAME_COUNT));
    }
    if (p.jumpPrepFrames > 0) {
      const prepProgress = 1 - p.jumpPrepFrames / engine.ORIGINAL_JUMP_PREP_FRAMES;
      return Math.min(2, Math.floor(clamp(prepProgress, 0, 1) * 3));
    }
    const riseProgress = clamp(
      (p.vy - engine.JUMP_START_VY) / -engine.JUMP_START_VY,
      0,
      1,
    );
    return 3 + Math.min(8, Math.floor(riseProgress * 9));
  }

  function drawPlayer(p, anim, t) {
    const pose = heroPose(p, anim, t);
    const { x, y } = pose;

    // ground shadow stays on the ground plane
    const shrink = clamp(1 - (engine.GROUND_Y - p.y) / 620, 0.35, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 * shrink;
    ctx.fillStyle = "#05030c";
    ctx.beginPath();
    ctx.ellipse(x, engine.GROUND_Y + 6, 17 * shrink, 4.5 * shrink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    if (p.invulnTimer > 0 && !pose.hurt) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 42);

    const attackAtlas = sprites[`attack_${anim.weaponId}_v4`];
    const idleAtlas = sprites[`idle_${anim.weaponId}_v1`];
    const attackActive = pose.attackFrame >= 0;
    const integratedAttack = attackActive && attackAtlas && !pose.hurt && !pose.guard && !pose.waza;
    const motionState = pose.hurt ? "hurt"
      : pose.guard ? "guard"
        : pose.falling ? "fall"
          : pose.air || pose.crouch ? "jump" : null;
    const motionAtlas = motionState
      ? sprites[`motion_${anim.weaponId}_${motionState}_v1`]
      : null;
    const integratedMotion = !integratedAttack && motionState && motionAtlas;
    const integratedIdle = !integratedAttack && !integratedMotion && idleAtlas;
    const weaponMotionMissing = (attackActive && !pose.hurt && !pose.guard && !pose.waza && !attackAtlas)
      || (motionState && !integratedAttack && !motionAtlas)
      || (!integratedAttack && !integratedMotion && !idleAtlas);
    if (weaponMotionMissing) {
      ctx.restore();
      return;
    }

    if (integratedAttack) {
      drawAttackAtlasFrame(attackAtlas, pose.attackFrame, anim.weaponId);
    } else if (integratedMotion) {
      const frame = motionFrameAt(motionState, p, anim);
      drawMotionAtlasFrame(motionAtlas, frame, anim.weaponId, motionState);
      if (pose.hurt && p.hurtTimer > 0.55) {
        const red = tinted(motionAtlas, "#ff5a5a");
        ctx.save();
        ctx.globalAlpha = 0.6;
        drawMotionAtlasFrame(red, frame, anim.weaponId, motionState);
        ctx.restore();
      }
    } else if (integratedIdle) {
      drawIdleAtlasFrame(idleAtlas, idleFrameAt(anim.idleT), anim.weaponId);
    }

    // guard barrier arc
    if (pose.guard) {
      const flare = anim.deflectT < 0.25 ? (1 - anim.deflectT / 0.25) : 0;
      ctx.save();
      ctx.globalAlpha = 0.5 + flare * 0.5;
      ctx.strokeStyle = "#58c7f0";
      ctx.lineWidth = 2.6 + flare * 2;
      ctx.shadowColor = "#58c7f0";
      ctx.shadowBlur = 10 + flare * 14;
      ctx.beginPath();
      ctx.arc(2, -34, 27 + flare * 10, -Math.PI * 0.92, -Math.PI * 0.08);
      ctx.stroke();
      ctx.restore();
    }

    // waza charge circle at feet
    if (pose.waza) {
      const k = p.specialTimer / 0.75;
      ctx.save();
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = "#e8b34b";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(0, -2, 26 + (1 - k) * 14, t * 3, t * 3 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  return {
    drawBackground,
    drawGround,
    drawLaneGlow,
    drawMonster,
    drawBossHazards,
    drawActiveAttacks,
    drawProjectiles,
    drawPlayer,
  };
}
