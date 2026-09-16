// HUD and screen chrome. Registers mouse hit-regions for menu buttons each
// frame (scenes.js resolves clicks). Terminology policy: plain Korean only.
import * as engine from "./engine.js";

export const SANS = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
export const SERIF = '"Nanum Myeongjo", "AppleMyungjo", "Noto Serif KR", serif';

const GOLD = "#e8b34b";
const GOLD_DIM = "rgba(232,179,75,0.4)";
const INK = "#0a0718";
const TEXT = "#ece6f4";
const MUTED = "#9a92b8";
const MP_COL = ["#3d6fd8", "#6fb7ff"];
const HP_COL = ["#ff7a7a", "#c4222c"];
const FORGE_RAY_COUNT = 192;
const FORGE_PRIMARY_RAY_COUNT = 24;
const FORGE_PRIMARY_RAY_WIDTH = 2;
const FORGE_RAY_ROTATION_SPEED = 0.24;
const RANK_STYLE = {
  common: {
    color: "#e6edf8",
    gemColor: "#d9e7ff",
    gemRgb: [217, 231, 255],
    neonColor: null,
  },
  rare: {
    color: "#65d8ff",
    gemColor: "#45d5ff",
    gemRgb: [69, 213, 255],
    neonColor: "#45d5ff",
  },
  epic: {
    color: "#dd8cff",
    gemColor: "#d875ff",
    gemRgb: [216, 117, 255],
    neonColor: "#d875ff",
  },
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutBack(t) {
  const c = 1.70158;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function createUi(ctx, sprites = {}, forgeAtlas = null, uiAtlas = null, comboAtlas = null, layout = null) {
  const W = engine.W;
  const H = engine.H;
  const SAFE_W = engine.BASE_W;
  const layoutState = layout || {
    mode: "compact",
    portrait: H > W * 1.05,
    baseUiScale: 1,
    uiScale: 1,
    hudScale: 1,
    visibleLogicalLeft: 0,
    visibleLogicalWidth: W,
  };

  // --- mouse hit regions (rebuilt every frame by the draw calls) ---
  let hits = [];
  let metrics = {};
  const forgeGemCache = new Map();
  const forgeGlowCache = new Map();

  function beginFrame() {
    hits = [];
    const frameSafeBounds = isShortLandscape() ? shortLandscapeBounds() : safeBounds();
    metrics = {
      safeBounds: frameSafeBounds,
      layoutMode: layoutState.mode,
      portraitLayout: layoutState.portrait,
      baseUiScale: Number((layoutState.baseUiScale || 1).toFixed(4)),
      uiScale: Number((layoutState.uiScale || 1).toFixed(4)),
      hudScale: Number((layoutState.hudScale || 1).toFixed(4)),
    };
  }

  function region(x, y, w, h, id) {
    hits.push({ x, y, w, h, id });
  }

  function hitAt(x, y) {
    for (let i = hits.length - 1; i >= 0; i -= 1) {
      const r = hits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h, { alpha = 0.72, border = GOLD_DIM, radius = 8 } = {}) {
    ctx.save();
    const fill = ctx.createLinearGradient(x, y, x, y + h);
    fill.addColorStop(0, `rgba(23,31,55,${Math.min(0.98, alpha + 0.1)})`);
    fill.addColorStop(1, `rgba(7,12,29,${alpha})`);
    ctx.fillStyle = fill;
    rr(x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    rr(x + 0.5, y + 0.5, w - 1, h - 1, radius);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(x + radius, y + 1.5);
    ctx.lineTo(x + w - radius, y + 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function text(str, x, y, { size = 14, color = TEXT, font = SANS, weight = 600, align = "left", baseline = "alphabetic", spacing = null, stroke = false } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (spacing !== null && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    if (stroke) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8,5,16,0.8)";
      ctx.strokeText(str, x, y);
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function safeBounds({ combat = false } = {}) {
    const visibleLeft = layoutState.visibleLogicalLeft || 0;
    const visibleWidth = Math.min(W, layoutState.visibleLogicalWidth || W);
    const width = Math.min(combat ? SAFE_W : uiSafeWidth(), visibleWidth);
    const left = Math.round(visibleLeft + (visibleWidth - width) / 2);
    return {
      left,
      right: left + width,
      width,
      cx: left + width / 2,
    };
  }

  function uiSafeWidth() {
    const visibleWidth = Math.min(W, layoutState.visibleLogicalWidth || W);
    if (!isWideLayout()) return Math.min(SAFE_W, visibleWidth);
    return Math.min(1280, Math.max(SAFE_W, visibleWidth - 32 * baseUiScale()));
  }

  function measureTextWidth(str, { size, font = SANS, weight = 600, spacing = null } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`;
    if (spacing !== null && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    const width = ctx.measureText(str).width;
    ctx.restore();
    return width;
  }

  function fitTextSize(str, size, maxWidth, options = {}) {
    const width = measureTextWidth(str, { ...options, size });
    if (width <= maxWidth) return size;
    return Math.max(options.minSize ?? 12, Math.floor(size * (maxWidth / width)));
  }

  function isMobileLayout() {
    return Boolean(layoutState.portrait);
  }

  function isWideLayout() {
    return layoutState.mode === "wide";
  }

  function baseUiScale() {
    return layoutState.baseUiScale || 1;
  }

  function screenUiScale() {
    return layoutState.uiScale || baseUiScale();
  }

  function combatHudBounds() {
    if (isMobileLayout()) return safeBounds({ combat: true });
    const visibleLeft = layoutState.visibleLogicalLeft || 0;
    const visibleWidth = Math.min(W, layoutState.visibleLogicalWidth || W);
    const inset = 24 * baseUiScale();
    return {
      left: visibleLeft + inset,
      right: visibleLeft + visibleWidth - inset,
      width: visibleWidth - inset * 2,
      cx: visibleLeft + visibleWidth / 2,
    };
  }

  function hudUiScale() {
    return layoutState.hudScale || baseUiScale();
  }

  function sceneUiScale() {
    const cssHeight = layoutState.cssFrameHeight || H;
    return baseUiScale() * clamp(cssHeight / 720, 0.78, 1);
  }

  function isShortLandscape() {
    const cssWidth = layoutState.cssFrameWidth || W;
    const cssHeight = layoutState.cssFrameHeight || H;
    return !isMobileLayout() && cssWidth >= 640 && cssHeight <= 500 && cssWidth / cssHeight >= 1.45;
  }

  function shortLandscapeBounds(maxCssWidth = 760) {
    const visibleLeft = layoutState.visibleLogicalLeft || 0;
    const visibleWidth = Math.min(W, layoutState.visibleLogicalWidth || W);
    const inset = 16 * baseUiScale();
    const width = Math.max(1, Math.min(visibleWidth - inset * 2, maxCssWidth * baseUiScale()));
    const left = visibleLeft + (visibleWidth - width) / 2;
    return { left, right: left + width, width, cx: left + width / 2 };
  }

  function snapCssX(value) {
    const scale = layoutState.cssScaleX || 1;
    const canvasOffset = ((layoutState.cssFrameWidth || 0) - (layoutState.canvasCssWidth || 0)) / 2;
    return (Math.round(canvasOffset + value * scale) - canvasOffset) / scale;
  }

  function snapCssY(value) {
    const scale = layoutState.cssScaleY || 1;
    return Math.round(value * scale) / scale;
  }

  function snapCssRect(x, y, w, h) {
    const left = snapCssX(x);
    const top = snapCssY(y);
    const right = snapCssX(x + w);
    const bottom = snapCssY(y + h);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function hudWash(rect, { anchor = 0.5, strength = 0.58 } = {}) {
    const cx = rect.x + rect.w * anchor;
    const cy = rect.y + rect.h / 2;
    const rx = rect.w * 0.82;
    const ry = rect.h * 0.72;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    wash.addColorStop(0, `rgba(4,9,25,${strength})`);
    wash.addColorStop(0.58, `rgba(4,9,25,${strength * 0.66})`);
    wash.addColorStop(1, "rgba(4,9,25,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  function wrapText(str, x, y, maxWidth, size, color, lineGap = 5, align = "center", weight = 500) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${SANS}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    const words = str.split(" ");
    let line = "";
    let lineY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += size + lineGap;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, lineY);
    ctx.restore();
    return lineY;
  }

  function drawAtlasRegion(image, rect, x, y, w, h, alpha = 1) {
    if (!image || !rect || w <= 0 || h <= 0) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, rect[0], rect[1], rect[2], rect[3], x, y, w, h);
    ctx.restore();
    return true;
  }

  function sliceAxis(sourceLength, cuts, stretchIndices, targetLength, scale) {
    const stretch = new Set(stretchIndices || []);
    const sourceSegments = cuts.slice(0, -1).map((start, index) => ({
      source: start,
      length: cuts[index + 1] - start,
      stretch: stretch.has(index),
    }));
    const fixedLength = sourceSegments.reduce(
      (total, segment) => total + (segment.stretch ? 0 : segment.length * scale),
      0,
    );
    const stretchSourceLength = sourceSegments.reduce(
      (total, segment) => total + (segment.stretch ? segment.length : 0),
      0,
    );
    const stretchTargetLength = Math.max(0, targetLength - fixedLength);
    const naturalLength = sourceLength * scale;
    let cursor = stretchSourceLength > 0 ? 0 : (targetLength - naturalLength) / 2;

    return sourceSegments.map((segment) => {
      const length = segment.stretch
        ? stretchTargetLength * segment.length / stretchSourceLength
        : segment.length * scale;
      const result = { ...segment, target: cursor, targetLength: length };
      cursor += length;
      return result;
    });
  }

  function drawUiFrame(name, x, y, w, h, { alpha = 1 } = {}) {
    const image = sprites.ui_frame_atlas_v1;
    const record = uiAtlas?.frame?.frames?.[name];
    if (!image || !record?.rect) return false;
    const grid = uiAtlas.frame.sliceGrid?.[name];
    const fitMode = uiAtlas.frame.fitMode?.[name];
    if (!grid) {
      if (fitMode === "contain") {
        const [, , sw, sh] = record.rect;
        const scale = Math.min(w / sw, h / sh);
        const drawW = sw * scale;
        const drawH = sh * scale;
        return drawAtlasRegion(image, record.rect, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH, alpha);
      }
      return drawAtlasRegion(image, record.rect, x, y, w, h, alpha);
    }

    const [sx, sy, sw, sh] = record.rect;
    const scale = Math.min(w / sw, h / sh);
    const columns = sliceAxis(sw, grid.x, grid.xStretch, w, scale);
    const rows = sliceAxis(sh, grid.y, grid.yStretch, h, scale);

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    if (grid.fill && columns.length > 1 && rows.length > 1) {
      const [fillX, fillY, fillW, fillH] = grid.fill;
      const left = columns[0].targetLength;
      const right = columns.at(-1).targetLength;
      const top = rows[0].targetLength;
      const bottom = rows.at(-1).targetLength;
      const targetW = w - left - right;
      const targetH = h - top - bottom;
      if (targetW > 0 && targetH > 0) {
        ctx.drawImage(
          image,
          sx + fillX, sy + fillY, fillW, fillH,
          x + left, y + top, targetW, targetH,
        );
      }
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const edgeRow = rowIndex === 0 || rowIndex === rows.length - 1;
        const edgeColumn = columnIndex === 0 || columnIndex === columns.length - 1;
        if (grid.borderOnly && !edgeRow && !edgeColumn) continue;
        if (column.length <= 0 || row.length <= 0 || column.targetLength <= 0 || row.targetLength <= 0) continue;
        ctx.drawImage(
          image,
          sx + column.source, sy + row.source, column.length, row.length,
          x + column.target, y + row.target, column.targetLength, row.targetLength,
        );
      }
    }
    ctx.restore();
    return true;
  }

  function drawUiIcon(name, x, y, size, { alpha = 1 } = {}) {
    const image = sprites.ui_icon_atlas_v1;
    const record = uiAtlas?.icon?.icons?.[name];
    if (!image || !record?.rect) return false;
    const [sx, sy, sw, sh] = record.rect;
    const scale = size / Math.max(sw, sh);
    const w = sw * scale;
    const h = sh * scale;
    return drawAtlasRegion(image, [sx, sy, sw, sh], x - w / 2, y - h / 2, w, h, alpha);
  }

  function comboTier(value) {
    const tiers = comboAtlas?.digit?.tiers || [];
    if (!tiers.length) return null;
    let index = 0;
    for (let candidate = 1; candidate < tiers.length; candidate += 1) {
      if (value < tiers[candidate].min) break;
      index = candidate;
    }
    return { ...tiers[index], index };
  }

  function comboDigitLayout(value, height, maxWidth, tier) {
    const glyphs = [...String(value)].map((digit) => tier?.glyphs?.[digit]).filter(Boolean);
    if (!glyphs.length) return null;
    const naturalWidths = glyphs.map((glyph) => glyph.rect[2] / glyph.rect[3] * height);
    const naturalGap = -3 * height / 44;
    const naturalWidth = naturalWidths.reduce((sum, width) => sum + width, 0) + naturalGap * Math.max(0, glyphs.length - 1);
    const fit = Math.min(1, maxWidth / Math.max(1, naturalWidth));
    const drawHeight = height * fit;
    const gap = naturalGap * fit;
    const widths = glyphs.map((glyph) => glyph.rect[2] / glyph.rect[3] * drawHeight);
    return {
      glyphs,
      widths,
      height: drawHeight,
      gap,
      width: widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, glyphs.length - 1),
    };
  }

  function drawComboDigits(value, tier, x, y, height, maxWidth, alpha = 1) {
    const image = sprites.combo_digits_v2;
    const layout = comboDigitLayout(value, height, maxWidth, tier);
    if (!image || !layout) return null;
    let cursor = x;
    layout.glyphs.forEach((glyph, index) => {
      drawAtlasRegion(image, glyph.rect, cursor, y, layout.widths[index], layout.height, alpha);
      cursor += layout.widths[index] + layout.gap;
    });
    return { x, y, w: layout.width, h: layout.height };
  }

  function drawComboImpact(tier, frame, x, y, w, h, alpha = 1) {
    const image = sprites.combo_burst_v2;
    const impactTier = comboAtlas?.impact?.tiers?.find((candidate) => candidate.id === tier?.id);
    const record = impactTier?.frames?.[frame];
    if (!image || !record?.rect) return false;
    return drawAtlasRegion(image, record.rect, x, y, w, h, alpha);
  }

  function segmentedGauge(x, y, w, h, ratio, segments, from, to, { dim = false, pulse = 0 } = {}) {
    const k = clamp(ratio, 0, 1);
    const gap = Math.max(1, h * 0.24);
    const segmentW = (w - gap * (segments - 1)) / segments;
    ctx.save();
    for (let i = 0; i < segments; i += 1) {
      const segmentX = x + i * (segmentW + gap);
      rr(segmentX, y, segmentW, h, Math.min(3, h / 2));
      ctx.fillStyle = "rgba(5,9,24,0.78)";
      ctx.fill();
      const fill = clamp(k * segments - i, 0, 1);
      if (fill > 0) {
        ctx.globalAlpha = dim ? 0.48 : 1;
        const grad = ctx.createLinearGradient(segmentX, 0, segmentX + segmentW, 0);
        grad.addColorStop(0, from);
        grad.addColorStop(1, to);
        ctx.fillStyle = grad;
        rr(segmentX + 1, y + 1, Math.max(1, (segmentW - 2) * fill), h - 2, Math.min(2, (h - 2) / 2));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = to;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = to;
      ctx.shadowBlur = 8;
      rr(x - 2, y - 2, w + 4, h + 4, h / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- icons ---
  function shieldIcon(x, y, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(5, -3.5);
    ctx.lineTo(5, 1);
    ctx.quadraticCurveTo(5, 5, 0, 6.5);
    ctx.quadraticCurveTo(-5, 5, -5, 1);
    ctx.lineTo(-5, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function boltIcon(x, y, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(1.5, -6.5);
    ctx.lineTo(-3.5, 1);
    ctx.lineTo(-0.5, 1);
    ctx.lineTo(-1.5, 6.5);
    ctx.lineTo(3.5, -1);
    ctx.lineTo(0.5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function heartIcon(x, y, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-7, 0, -6, -6, -1.5, -4.5);
    ctx.bezierCurveTo(0, -4, 0, -3, 0, -3);
    ctx.bezierCurveTo(0, -3, 0, -4, 1.5, -4.5);
    ctx.bezierCurveTo(6, -6, 7, 0, 0, 6);
    ctx.fill();
    ctx.restore();
  }

  function crystalIcon(x, y, size = 6, color = "#8fe3ff") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function speakerIcon(x, y, muted, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = muted ? "#ff9da0" : "#d7f3ff";
    ctx.fillStyle = muted ? "#ff9da0" : "#d7f3ff";
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -4 * scale);
    ctx.lineTo(-4 * scale, -4 * scale);
    ctx.lineTo(3 * scale, -10 * scale);
    ctx.lineTo(3 * scale, 10 * scale);
    ctx.lineTo(-4 * scale, 4 * scale);
    ctx.lineTo(-9 * scale, 4 * scale);
    ctx.closePath();
    ctx.fill();
    if (muted) {
      ctx.beginPath();
      ctx.moveTo(7 * scale, -7 * scale);
      ctx.lineTo(16 * scale, 7 * scale);
      ctx.moveTo(16 * scale, -7 * scale);
      ctx.lineTo(7 * scale, 7 * scale);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(3 * scale, 0, 9 * scale, -0.75, 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pauseIcon(x, y, scale = 1) {
    ctx.save();
    ctx.fillStyle = "#fff2c8";
    ctx.fillRect(x - 7 * scale, y - 9 * scale, 4 * scale, 18 * scale);
    ctx.fillRect(x + 3 * scale, y - 9 * scale, 4 * scale, 18 * scale);
    ctx.restore();
  }

  function drawSystemControls({ scene, paused, muted }) {
    const bounds = scene === "run"
      ? combatHudBounds()
      : isShortLandscape() ? shortLandscapeBounds() : safeBounds();
    const scale = hudUiScale();
    if (scene !== "run" || paused) {
      const x = snapCssX(bounds.right - 28 * scale);
      const y = snapCssY(32 * scale);
      speakerIcon(x, y, muted, 0.82 * scale);
      region(x - 22 * scale, y - 22 * scale, 44 * scale, 44 * scale, "system:mute");
      metrics.systemControls = { mute: snapCssRect(x - 22 * scale, y - 22 * scale, 44 * scale, 44 * scale) };
      return;
    }

    const mobile = isMobileLayout();
    const hitSize = 40 * scale;
    const controlsY = (mobile ? (metrics.hud?.boss ? 218 : 172) : 108) * scale;
    const scoreBottom = metrics.hud?.score ? metrics.hud.score.y + metrics.hud.score.h : 0;
    const y = snapCssY(Math.max(controlsY, scoreBottom + hitSize / 2 + 4 * scale));
    const muteX = snapCssX(bounds.right - 22 * scale);
    const pauseX = snapCssX(bounds.right - 66 * scale);
    pauseIcon(pauseX, y, 0.75 * scale);
    speakerIcon(muteX, y, muted, 0.78 * scale);
    const pauseBox = snapCssRect(pauseX - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    const muteBox = snapCssRect(muteX - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    region(pauseBox.x, pauseBox.y, pauseBox.w, pauseBox.h, "system:pause");
    region(muteBox.x, muteBox.y, muteBox.w, muteBox.h, "system:mute");
    metrics.systemControls = { pause: pauseBox, mute: muteBox, rowY: y };
  }

  function drawPauseOverlayLandscape({ upgrades = [], weaponName = "", stats = null, reducedMotion = false, shards = 0 } = {}) {
    const bounds = shortLandscapeBounds(760);
    const scale = baseUiScale();
    const cx = bounds.cx;
    const width = Math.min(bounds.width, 700 * scale);
    const left = cx - width / 2;
    const top = 14 * scale;
    ctx.save();
    ctx.fillStyle = "rgba(5,3,12,0.88)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    panel(left, top, width, 347 * scale, { alpha: 0.96, border: GOLD_DIM, radius: 12 * scale });
    text("잠시 쉬어가기", cx, top + 37 * scale, {
      size: 23 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center", spacing: 2 * scale,
    });
    ornament(cx, top + 52 * scale, 112 * scale);

    const colGap = 26 * scale;
    const colW = (width - 64 * scale - colGap) / 2;
    const leftX = left + 32 * scale;
    const rightX = leftX + colW + colGap;
    text("모험의 기본", leftX, top + 82 * scale, { size: 12.5 * scale, color: GOLD, weight: 900 });
    const help = [
      "A / D 이동   J 공격   W 점프",
      "S 방어   K 기술   P 일시정지   M 소리",
      "한 칸을 깨면 가로줄 전체가 끊어집니다",
      "공격을 쉬면 MP가 차고 기술을 쓸 수 있습니다",
    ];
    help.forEach((line, i) => text(line, leftX, top + (106 + i * 25) * scale, {
      size: fitTextSize(line, 11.5 * scale, colW), color: i < 2 ? TEXT : "#b5c3d8", weight: 650,
    }));

    text(weaponName ? `현재 조합 · ${weaponName}` : "현재 조합", rightX, top + 82 * scale, { size: 12.5 * scale, color: GOLD, weight: 900 });
    if (stats) {
      const stat = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "—";
      text(`공격 ${stat(stats.power)}   사거리 ${stat(stats.range)}   초당 ${stat(stats.speed)}회`, rightX, top + 106 * scale, {
        size: fitTextSize(`공격 ${stat(stats.power)}   사거리 ${stat(stats.range)}   초당 ${stat(stats.speed)}회`, 11.5 * scale, colW), color: "#fff2d0", weight: 800,
      });
    }
    text(`이번 모험 파편  ${Math.max(0, Number(shards) || 0).toLocaleString("ko-KR")}`, rightX, top + 131 * scale, {
      size: 11.5 * scale, color: "#9fe5ff", weight: 850,
    });
    const build = upgrades.length
      ? upgrades.map((upgrade) => `${upgrade.name}${upgrade.count > 1 ? ` ×${upgrade.count}` : ""}`).join("  ·  ")
      : "아직 강화가 없습니다 · 단조에서 조합을 만들어보세요";
    wrapText(build, rightX, top + 157 * scale, colW, 11 * scale, TEXT, 4 * scale, "left", 650);

    const motion = outlinedActionButton(cx, top + 246 * scale, width - 64 * scale, 36 * scale,
      `화면 효과  ${reducedMotion ? "약하게" : "기본"}  ·  누르면 변경`, "system:motion", { scale, fontSize: 11.5 });
    const actionGap = 14 * scale;
    const actionW = (width - 64 * scale - actionGap) / 2;
    const quit = outlinedActionButton(cx - (actionW + actionGap) / 2, top + 307 * scale, actionW, 44 * scale,
      "종료하고 파편 정산", "pause:quit", { danger: true, scale, fontSize: 13 });
    const resume = outlinedActionButton(cx + (actionW + actionGap) / 2, top + 307 * scale, actionW, 44 * scale,
      "모험 계속  ·  P", "pause:resume", { selected: true, scale, fontSize: 13 });
    metrics.pause = {
      x: left, y: top, w: width, h: 347 * scale, upgrades: upgrades.map((upgrade) => upgrade.name), reducedMotion,
      motion, quit, resume, shards: Math.max(0, Number(shards) || 0), landscape: true,
    };
  }

  function drawPauseOverlay({ upgrades = [], weaponName = "", stats = null, reducedMotion = false, shards = 0 } = {}) {
    if (isShortLandscape()) {
      drawPauseOverlayLandscape({ upgrades, weaponName, stats, reducedMotion, shards });
      return;
    }
    const mobile = isMobileLayout();
    const bounds = safeBounds();
    const scale = Math.min(screenUiScale(), (H - 58 * baseUiScale()) / 610);
    const cx = bounds.cx;
    const width = Math.min(bounds.width - 24 * baseUiScale(), 480 * scale);
    const top = (H - 610 * scale) / 2;
    ctx.save();
    ctx.fillStyle = "rgba(5,3,12,0.85)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    panel(cx - width / 2, top, width, 610 * scale, { alpha: 0.94, border: GOLD_DIM, radius: 12 * scale });
    text("잠시 쉬어가기", cx, top + 42 * scale, {
      size: 25 * scale, color: "#fff2c8", font: SERIF, weight: 800, align: "center", spacing: 2 * scale,
    });
    ornament(cx, top + 61 * scale, width * 0.28);
    const contentX = cx - width / 2 + 24 * scale;
    text("모험의 기본", contentX, top + 92 * scale, { size: 13 * scale, color: GOLD, weight: 900 });
    const controls = mobile
      ? ["이동 버튼으로 약한 칸에 맞추세요", "공격·방어는 유지 / 점프·기술은 한 번씩 누르세요"]
      : ["A / D  이동    J  공격    W  점프", "S  방어    K  기술    P  일시정지    M  소리"];
    const help = [...controls, "한 칸을 깨면 가로줄 전체가 끊어집니다", "공격을 쉬면 MP가 차고, 기술을 쓸 수 있습니다", "HP는 생명력 · 방어는 막을 수 있는 힘"];
    help.forEach((line, i) => text(line, contentX, top + (118 + i * 24) * scale, {
      size: fitTextSize(line, 12 * scale, width - 48 * scale), color: i < 2 ? TEXT : "#b5c3d8", weight: 650,
    }));
    text(weaponName ? `현재 조합 · ${weaponName}` : "현재 조합", contentX, top + 266 * scale, { size: 13 * scale, color: GOLD, weight: 900 });
    if (stats) {
      const stat = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "—";
      text(`공격 ${stat(stats.power)}   사거리 ${stat(stats.range)}   초당 ${stat(stats.speed)}회`, contentX, top + 291 * scale, { size: 12 * scale, color: "#fff2d0", weight: 800 });
    }
    let line = "";
    const buildLines = [];
    for (const upgrade of upgrades) {
      const token = `${upgrade.name}${upgrade.count > 1 ? ` ×${upgrade.count}` : ""}`;
      const next = line ? `${line}  ·  ${token}` : token;
      if (line && measureTextWidth(next, { size: 11.5 * scale }) > width - 48 * scale) {
        buildLines.push(line);
        line = token;
      } else line = next;
    }
    if (line) buildLines.push(line);
    if (!buildLines.length) buildLines.push("아직 강화가 없습니다 · 단조에서 조합을 만들어보세요");
    const buildLineH = Math.min(24, 154 / Math.max(1, buildLines.length)) * scale;
    buildLines.forEach((value, i) => text(value, contentX, top + 321 * scale + i * buildLineH, {
      size: fitTextSize(value, Math.min(11.5 * scale, buildLineH * 0.72), width - 48 * scale), color: TEXT, weight: 650,
    }));
    const motionY = top + 480 * scale;
    const motion = outlinedActionButton(cx, motionY, width - 48 * scale, 38 * scale,
      `화면 효과  ${reducedMotion ? "약하게" : "기본"}  ·  누르면 변경`, "system:motion", { scale, fontSize: 11.5 });
    const actionGap = 12 * scale;
    const actionW = (width - 48 * scale - actionGap) / 2;
    const quit = outlinedActionButton(cx - (actionW + actionGap) / 2, top + 544 * scale, actionW, 44 * scale,
      "종료 후 정산", "pause:quit", { danger: true, scale, fontSize: mobile ? 12 : 13 });
    const resume = outlinedActionButton(cx + (actionW + actionGap) / 2, top + 544 * scale, actionW, 44 * scale,
      mobile ? "모험 계속" : "모험 계속  ·  P", "pause:resume", { selected: true, scale, fontSize: mobile ? 12 : 13 });
    text("위험 예고는 효과 강도와 관계없이 표시됩니다", cx, top + 594 * scale, {
      size: 10 * scale, color: MUTED, align: "center",
    });
    metrics.pause = {
      x: cx - width / 2, y: top, w: width, h: 610 * scale, upgrades: buildLines, reducedMotion,
      motion, quit, resume, shards: Math.max(0, Number(shards) || 0), landscape: false,
    };
  }

  function speedIcon(x, y, color = "#ffd98a") {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i += 1) {
      const yy = -9 + i * 9;
      ctx.beginPath();
      ctx.moveTo(-13 + i * 3, yy);
      ctx.lineTo(9 + i * 2, yy - 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function keycap(x, y, label, { size = 16 } = {}) {
    ctx.save();
    ctx.fillStyle = "rgba(34,28,58,0.95)";
    rr(x, y, size, size, 3.5);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,170,220,0.4)";
    ctx.lineWidth = 1;
    rr(x + 0.5, y + 0.5, size - 1, size - 1, 3.5);
    ctx.stroke();
    text(label, x + size / 2, y + size / 2 + 0.5, { size: size * 0.6, color: GOLD, weight: 800, align: "center", baseline: "middle" });
    ctx.restore();
  }

  function bar(x, y, w, h, ratio, from, to, { pulse = 0, dim = false } = {}) {
    ctx.save();
    rr(x, y, w, h, h / 2);
    ctx.fillStyle = "rgba(8,6,20,0.85)";
    ctx.fill();
    const k = clamp(ratio, 0, 1);
    if (k > 0.01) {
      const inset = Math.min(1, h / 4);
      const fillH = Math.max(0.5, h - inset * 2);
      const fillW = Math.max(fillH, (w - inset * 2) * k);
      ctx.globalAlpha = dim ? 0.55 : 1;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      ctx.fillStyle = grad;
      rr(x + inset, y + inset, fillW, fillH, fillH / 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      rr(x + inset, y + inset, fillW, fillH / 2, fillH / 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = to;
      ctx.lineWidth = 2;
      ctx.shadowColor = to;
      ctx.shadowBlur = 8;
      rr(x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // keycap + label hint bar, e.g. [{k:["A","D"],t:"이동"},...]
  function keyHint(items, y) {
    if (isMobileLayout()) return;
    const scale = baseUiScale();
    ctx.save();
    ctx.font = `600 ${11.5 * scale}px ${SANS}`;
    const capW = 16 * scale;
    const gap = 16 * scale;
    let total = 0;
    const widths = items.map((it) => {
      const w = it.k.length * (capW + 2 * scale) + 4 * scale + ctx.measureText(it.t).width;
      total += w;
      return w;
    });
    total += (items.length - 1) * gap + 28 * scale;
    panel(W / 2 - total / 2, y - 15 * scale, total, 26 * scale, { alpha: 0.55, radius: 13 * scale, border: "rgba(150,140,190,0.25)" });
    let x = W / 2 - total / 2 + 14 * scale;
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      for (const key of it.k) {
        keycap(x, y - 9 * scale, key, { size: capW });
        x += capW + 2 * scale;
      }
      x += 4 * scale;
      text(it.t, x, y, { size: 11.5 * scale, color: MUTED, baseline: "middle" });
      x += widths[i] - it.k.length * (capW + 2 * scale) - 4 * scale + gap;
    }
    ctx.restore();
  }

  // clickable pill button (also registers a hit region)
  function pillButton(cx, y, label, id, { primary = false, w = null, scale = 1 } = {}) {
    ctx.save();
    ctx.font = `700 ${13 * scale}px ${SANS}`;
    const bw = w || ctx.measureText(label).width + 44 * scale;
    const x = cx - bw / 2;
    panel(x, y, bw, 30 * scale, {
      alpha: primary ? 0.9 : 0.6,
      radius: 7 * scale,
      border: primary ? GOLD : "rgba(150,140,190,0.3)",
    });
    text(label, cx, y + 16 * scale, { size: 13 * scale, color: primary ? GOLD : TEXT, weight: 700, align: "center", baseline: "middle" });
    ctx.restore();
    region(x, y, bw, 30 * scale, id);
  }

  function outlinedActionButton(cx, cy, w, h, label, id, {
    selected = false,
    danger = false,
    disabled = false,
    scale = 1,
    fontSize = 13,
  } = {}) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const border = disabled
      ? selected ? "rgba(232,179,75,0.55)" : "rgba(150,140,190,0.2)"
      : danger ? "rgba(255,122,122,0.75)" : selected ? GOLD : "rgba(150,170,205,0.38)";
    panel(x, y, w, h, {
      alpha: disabled ? selected ? 0.46 : 0.34 : selected ? 0.88 : 0.62,
      border,
      radius: Math.min(9 * scale, h / 2),
    });
    text(label, cx, cy + 1 * scale, {
      size: fontSize * scale,
      color: disabled ? selected ? "#aaa17f" : "#777486" : danger ? "#ffaaaa" : selected ? "#fff2c8" : TEXT,
      weight: selected || danger ? 900 : 750,
      align: "center",
      baseline: "middle",
    });
    region(x, y, w, h, id);
    return { x, y, w, h, id, label, selected, danger, disabled };
  }

  // === run HUD ===
  function drawHud(s) {
    const mobile = isMobileLayout();
    const bounds = combatHudBounds();
    const left = bounds.left;
    const right = bounds.right;
    const centerX = snapCssX(W / 2);
    const scale = hudUiScale();
    const boundsCssWidth = bounds.width * (layoutState.cssScaleX || 1);
    const railT = mobile ? 0 : clamp((boundsCssWidth - 900) / 320, 0, 1);
    const stackedDesktop = !mobile && boundsCssWidth < 900;
    const statusUnits = mobile ? 220 : 240 + 36 * railT;
    const hpFlash = s.hpFlashT < 0.5 ? Math.abs(Math.sin(s.hpFlashT * 24)) : 0;
    const status = snapCssRect(
      left + 10 * scale,
      (s.boss ? 112 : mobile ? 80 : stackedDesktop ? 72 : 56) * scale,
      statusUnits * scale,
      76 * scale,
    );
    const iconX = snapCssX(status.x + 14 * scale);
    const gaugeX = snapCssX(status.x + 61 * scale);
    const valueRight = snapCssX(status.x + status.w);
    const gaugeRight = snapCssX(valueRight - 62 * scale);
    const gaugeW = gaugeRight - gaugeX;
    const hpRow = snapCssRect(status.x, status.y, status.w, 24 * scale);
    const guardRow = snapCssRect(status.x, status.y + 26 * scale, status.w, 22 * scale);
    const mpRow = snapCssRect(status.x, status.y + 52 * scale, status.w, 22 * scale);
    const hpCenterY = snapCssY(hpRow.y + hpRow.h / 2);
    const guardCenterY = snapCssY(guardRow.y + guardRow.h / 2);
    const mpCenterY = snapCssY(mpRow.y + mpRow.h / 2);

    hudWash(status, { anchor: 0.26, strength: 0.62 });

    drawUiIcon("hp", iconX, hpCenterY, 28 * scale, { alpha: hpFlash > 0 ? 1 : 0.95 });
    const statusLabelSize = (mobile ? 10.5 : 9) * scale;
    text("HP", status.x + 31 * scale, hpCenterY, { size: statusLabelSize, color: "#ffd3d3", weight: 850, baseline: "middle", stroke: true });
    const hpGauge = snapCssRect(gaugeX, hpCenterY - 5 * scale, gaugeW, 10 * scale);
    bar(hpGauge.x, hpGauge.y, hpGauge.w, hpGauge.h, s.hp / s.hpMax, HP_COL[0], HP_COL[1], { pulse: hpFlash * 0.7 });
    text(`${Math.ceil(s.hp)}/${s.hpMax}`, valueRight, snapCssY(hpCenterY + 1 * scale), {
      size: (mobile ? 11 : 10) * scale, color: s.hp <= 25 ? "#ff9a9f" : "#fff2dc", weight: 900, align: "right", baseline: "middle", stroke: true,
    });

    drawUiIcon("guard", iconX, guardCenterY, 21 * scale, { alpha: 0.9 });
    text("방어", status.x + 31 * scale, guardCenterY, { size: statusLabelSize, color: "#a9edff", weight: 850, baseline: "middle", stroke: true });
    const guardGauge = snapCssRect(gaugeX, guardCenterY - 4 * scale, gaugeW, 8 * scale);
    segmentedGauge(guardGauge.x, guardGauge.y, guardGauge.w, guardGauge.h, s.guard / s.guardMax, 6, "#2785a9", "#6de1ff");
    text(`${Math.ceil(s.guard)}/${s.guardMax}`, valueRight, snapCssY(guardCenterY + 1 * scale), {
      size: (mobile ? 10.5 : 9.5) * scale, color: "#a9edff", weight: 850, align: "right", baseline: "middle", stroke: true,
    });
    const mpReady = s.mp >= s.mpCost;
    drawUiIcon("mp", iconX, mpCenterY, 21 * scale, { alpha: mpReady ? 1 : 0.58 });
    text("MP", status.x + 31 * scale, mpCenterY, { size: statusLabelSize, color: "#bce6ff", weight: 850, baseline: "middle", stroke: true });
    const mpGauge = snapCssRect(gaugeX, mpCenterY - 4 * scale, gaugeW, 8 * scale);
    segmentedGauge(mpGauge.x, mpGauge.y, mpGauge.w, mpGauge.h, s.mp / s.mpMax, 10, MP_COL[0], MP_COL[1], {
      pulse: mpReady && !s.reducedMotion ? 0.25 + 0.25 * Math.sin(s.t * 6) : 0,
      dim: s.mpPaused,
    });
    text(`${Math.floor(s.mp)}/${s.mpMax}`, valueRight, snapCssY(mpCenterY + 1 * scale), {
      size: statusLabelSize, color: mpReady ? "#bce6ff" : "#b5c3d8", weight: 800, align: "right", baseline: "middle", stroke: true,
    });
    const mpStatus = mpReady ? `${s.skillName || "기술"} 준비` : s.mpPaused ? "공격 중 · 충전 대기" : "쉬는 중 · MP 충전";
    text(mpStatus, status.x + 31 * scale, status.y + status.h + 12 * scale, {
      size: statusLabelSize, color: mpReady ? "#bce6ff" : s.mpPaused ? "#b5c3d8" : "#9fdcff", weight: 800, stroke: true,
    });

    if (s.mugetsuT > 0) {
      text(`무월 ${s.mugetsuT.toFixed(1)}s`, status.x, status.y + status.h + 29 * scale, { size: 11 * scale, color: "#d8c9ff", weight: 900, stroke: true });
    }
    if (s.spearRageT > 0) {
      const y = status.y + status.h + (s.mugetsuT > 0 ? 45 : 29) * scale;
      text(`용의 기세 ${s.spearRageT.toFixed(1)}s`, status.x, y, { size: 11 * scale, color: "#9fdcff", weight: 900, stroke: true });
    }

    const special = s.stageType && s.stageType !== "normal";
    const waveMeta = (s.waveCount || 1) > 1 ? `${Math.min(s.waveIndex + 1, s.waveCount)}/${s.waveCount}` : "";
    const stageMeta = [special ? s.stageLabel : "", waveMeta].filter(Boolean).join(" · ");
    const stageText = `스테이지 ${s.stage + 1}`;
    const stageWidth = Math.max(
      measureTextWidth(stageText, { size: 12.5 * scale, weight: 850 }),
      measureTextWidth(stageMeta, { size: 9.5 * scale, weight: 850 }),
    );
    const stage = snapCssRect(status.x, 10 * scale, stageWidth, (stageMeta ? 36 : 20) * scale);
    const stageTitleY = snapCssY(stage.y + 10 * scale);
    text(stageText, stage.x, stageTitleY, {
      size: 12.5 * scale, color: special ? s.stageColor : TEXT, weight: 850, baseline: "middle", stroke: true,
    });
    if (stageMeta && !s.boss) {
      text(stageMeta, stage.x, snapCssY(stage.y + 29 * scale), {
        size: 9.5 * scale, color: s.stageColor, weight: 850, baseline: "middle", stroke: true,
      });
    }

    let boss = null;
    if (s.boss) {
      const bossW = Math.min(bounds.width - 28 * scale, (mobile ? 282 : 322) * scale);
      const bossY = 64 * scale;
      boss = snapCssRect(centerX - bossW / 2, bossY, bossW, 43 * scale);
      hudWash(boss, { anchor: 0.5, strength: 0.76 });
      text(s.boss.name || "폭풍 구름", boss.x + 4 * scale, boss.y + 10 * scale, { size: 10.5 * scale, color: "#ffe2a3", weight: 900, stroke: true });
      text(s.boss.action || "하강 중", boss.x + boss.w - 4 * scale, boss.y + 10 * scale, { size: 9 * scale, color: "#d1c4d4", weight: 800, align: "right", stroke: true });
      const hpRatio = clamp(s.boss.hp / Math.max(1, s.boss.maxHp), 0, 1);
      bar(boss.x + 4 * scale, boss.y + 19 * scale, boss.w - 8 * scale, 8 * scale, hpRatio, "#c83d54", "#f7b16e");
      text(`${Math.round(hpRatio * 100)}%`, boss.x + 4 * scale, boss.y + 40 * scale, { size: 9 * scale, color: "#ffdda5", weight: 850, stroke: true });
    }

    const score = snapCssRect(right - 96 * scale, (mobile ? (s.boss ? 114 : 44) : stackedDesktop ? 56 : 18) * scale, 84 * scale, 62 * scale);
    const scoreRight = snapCssX(score.x + score.w);
    const scoreValue = String(s.score);
    const scoreSize = fitTextSize(scoreValue, (mobile ? 20 : 22) * scale, score.w, { font: SANS, weight: 900 });
    hudWash(score, { anchor: 0.76, strength: 0.52 });
    text("점수", scoreRight, snapCssY(score.y + 5 * scale), { size: 9 * scale, color: "#d8d4e4", align: "right", weight: 850, baseline: "middle", stroke: true });
    text(scoreValue, scoreRight, snapCssY(score.y + 27 * scale), { size: scoreSize, color: "#ffd477", weight: 900, align: "right", baseline: "middle", font: SANS, stroke: true });
    const shardY = snapCssY(score.y + 50 * scale);
    const shardValue = String(s.shards);
    const shardSize = fitTextSize(shardValue, 10.5 * scale, score.w - 28 * scale, { font: SANS, weight: 900 });
    const shardTextW = measureTextWidth(shardValue, { size: shardSize, font: SANS, weight: 900 });
    const shardIconSize = 21 * scale;
    const shardTextLeft = snapCssX(scoreRight - shardTextW);
    const shardIconX = snapCssX(shardTextLeft - 6 * scale - shardIconSize / 2);
    drawUiIcon("shards", shardIconX, shardY, shardIconSize, { alpha: 0.92 });
    text(shardValue, scoreRight, snapCssY(shardY + 1 * scale), { size: shardSize, color: "#d7f3ff", weight: 900, align: "right", baseline: "middle", stroke: true });

    // A compact, unboxed arrival cue replaces the long empty-sky wait.
    let approach = null;
    const approaching = s.approach?.offscreen;
    if (approaching) {
      const cx = centerX;
      const y = snapCssY(12 * scale);
      approach = snapCssRect(cx - 58 * scale, y - 8 * scale, 116 * scale, 56 * scale);
      const pulse = 0.72 + Math.sin(s.t * 8) * 0.18;
      const progress = clamp(s.approach.progress || 0, 0, 1);
      drawUiIcon("down", cx, snapCssY(y + 6 * scale), 30 * scale, { alpha: pulse });
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = TEXT;
      const approachTrack = snapCssRect(cx - 48 * scale, y + 26 * scale, 96 * scale, 2 * scale);
      ctx.fillRect(approachTrack.x, approachTrack.y, approachTrack.w, approachTrack.h);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = s.stageType === "boss" ? "#ff8a8f" : GOLD;
      ctx.fillRect(approachTrack.x, approachTrack.y, snapCssX(approachTrack.w * progress), approachTrack.h);
      ctx.restore();
      text("적이 접근 중입니다", cx, snapCssY(y + 43 * scale), {
        size: 10.5 * scale,
        color: s.stageType === "boss" ? "#ffb0b3" : "#ffe2a3",
        weight: 800,
        align: "center",
        stroke: true,
      });
    }

    // Combo stays off the combat axis. The centered burst supports the tier-colored digits.
    let combo = null;
    let comboDetails = null;
    if (s.combo >= 2) {
      const tier = comboTier(s.combo);
      if (!tier) throw new Error("콤보 등급 아틀라스 데이터가 없습니다");
      const popDuration = 0.18;
      const popProgress = clamp(s.comboPopT / popDuration, 0, 1);
      const pop = 1 + (tier?.pop || 0.16) * Math.pow(1 - easeOutCubic(popProgress), 2);
      const comboLife = clamp(1 - s.comboIdleTimer / 5, 0, 1);
      const emphasis = !s.hazardActive && (s.comboCelebration || s.combo === tier.min);
      const comboScale = scale * (emphasis ? 0.76 : 0.52);
      const cx = snapCssX(right - 48 * scale);
      const cy = snapCssY((mobile ? (s.boss ? 299 : 252) : stackedDesktop ? 206 : 184) * scale);
      combo = snapCssRect(cx - 76 * comboScale, cy - 66 * comboScale, 152 * comboScale, 128 * comboScale);
      const impactDuration = comboAtlas?.impact?.frameDuration || 0.055;
      const impactTier = comboAtlas?.impact?.tiers?.find((candidate) => candidate.id === tier?.id);
      const impactFrames = impactTier?.frames?.length || 0;
      const impactFrame = emphasis && !s.reducedMotion && impactFrames && s.comboPopT < impactDuration * impactFrames
        ? Math.min(impactFrames - 1, Math.floor(s.comboPopT / impactDuration))
        : -1;
      const impactBox = snapCssRect(cx - 70 * comboScale, cy - 61 * comboScale, 140 * comboScale, 112 * comboScale);
      const digitHeight = 49 * comboScale * (tier?.size || 1);
      const digitMaxWidth = 144 * comboScale;
      const digitLayout = comboDigitLayout(String(s.combo), digitHeight, digitMaxWidth, tier);
      if (!digitLayout) throw new Error("콤보 숫자 아틀라스 데이터가 없습니다");
      const digitX = cx - digitLayout.width / 2;
      const digitY = cy - digitLayout.height / 2 - 8 * comboScale;
      ctx.save();
      ctx.globalAlpha = s.hazardActive ? 0.5 : 1;
      ctx.translate(cx, cy);
      if (impactFrame >= 0) {
        drawComboImpact(
          tier,
          impactFrame,
          impactBox.x - cx,
          impactBox.y - cy,
          impactBox.w,
          impactBox.h,
          1,
        );
      }
      ctx.save();
      ctx.scale(emphasis && !s.reducedMotion ? pop : 1, emphasis && !s.reducedMotion ? pop : 1);
      ctx.shadowColor = tier?.glow || "#35bfff";
      ctx.shadowBlur = s.hazardActive ? 0 : (3 + (tier?.index || 0)) * comboScale;
      const digitBox = drawComboDigits(
        String(s.combo),
        tier,
        digitX - cx,
        digitY - cy,
        digitHeight,
        digitMaxWidth,
        1,
      );
      if (!digitBox) throw new Error("콤보 숫자 아틀라스를 렌더할 수 없습니다");
      ctx.restore();
      text("콤보", 0, 34 * comboScale, {
        size: 10 * scale,
        color: tier?.highlight || "#fff2d2",
        weight: 900,
        align: "center",
        stroke: true,
      });
      ctx.restore();
      const finalDigitBox = snapCssRect(digitX, digitY, digitLayout.width, digitLayout.height);
      const comboLifeBar = snapCssRect(cx - 43 * comboScale, cy + 48 * comboScale, 86 * comboScale, 3 * comboScale);
      bar(
        comboLifeBar.x,
        comboLifeBar.y,
        comboLifeBar.w,
        comboLifeBar.h,
        comboLife,
        tier?.glow || GOLD,
        tier?.highlight || "#ffd98a",
      );
      comboDetails = {
        digits: finalDigitBox,
        impact: impactFrame >= 0 ? impactBox : null,
        impactFrame,
        tier: tier ? { id: tier.id, label: tier.label, index: tier.index, min: tier.min } : null,
        impactCenterOffset: Number(((impactBox.x + impactBox.w / 2) - (finalDigitBox.x + finalDigitBox.w / 2)).toFixed(3)),
        lifeBar: comboLifeBar,
        offsetFromCenter: cx - centerX,
        emphasis: Boolean(emphasis),
        hazardDimmed: Boolean(s.hazardActive),
      };
    }

    const learningHint = s.hazardActive ? null : (Object.hasOwn(s, "hint") ? s.hint : (s.showHints ? "약한 칸을 깨면 가로줄 전체가 끊어집니다" : null));
    let hint = null;
    if (learningHint) {
      const hintW = Math.min(bounds.width - 36 * scale, 370 * scale);
      const trayTop = layout?.combatProjection?.touchTrayCssTop;
      const hintY = mobile && Number.isFinite(trayTop)
        ? (trayTop - 31) / (layout.cssScaleY || 1)
        : (stackedDesktop ? 222 : 143) * scale;
      hint = snapCssRect(centerX - hintW / 2, hintY, hintW, 34 * scale);
      hudWash(hint, { anchor: 0.5, strength: 0.65 });
      text(learningHint, centerX, hintY + 20 * scale, { size: fitTextSize(learningHint, 10.5 * scale, hintW - 12 * scale), color: "#fff0c9", align: "center", weight: 850, stroke: true });
    }

    if (s.upgrades.length && !mobile) {
      let x = left + 12 * scale;
      const y = H - 26 * scale;
      for (const u of s.upgrades) {
        const label = u.count > 1 ? `${u.name} ×${u.count}` : u.name;
        ctx.font = `600 ${11 * scale}px ${SANS}`;
        const w = ctx.measureText(label).width + 22 * scale;
        ctx.fillStyle = RANK_STYLE[u.rank]?.color || TEXT;
        ctx.beginPath();
        ctx.arc(x + 10 * scale, y - 3 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
        text(label, x + 17 * scale, y - 2 * scale, { size: 11 * scale, color: TEXT, baseline: "middle", stroke: true });
        x += w + 6 * scale;
        if (x > right - 160 * scale) break;
      }
    }
    metrics.hud = {
      status,
      statusRows: {
        hp: { ...hpRow, iconX, gauge: hpGauge, valueRight },
        guard: { ...guardRow, iconX, gauge: guardGauge, valueRight },
        mp: { ...mpRow, iconX, gauge: mpGauge, valueRight },
      },
      stage,
      stageOrnament: null,
      score,
      scoreRows: {
        value: snapCssRect(scoreRight - measureTextWidth(scoreValue, { size: scoreSize, font: SANS, weight: 900 }), score.y + 15 * scale, measureTextWidth(scoreValue, { size: scoreSize, font: SANS, weight: 900 }), 24 * scale),
        shards: {
          icon: snapCssRect(shardIconX - shardIconSize / 2, shardY - shardIconSize / 2, shardIconSize, shardIconSize),
          value: snapCssRect(shardTextLeft, shardY - 8 * scale, scoreRight - shardTextLeft, 16 * scale),
        },
      },
      approach,
      combo,
      comboDetails,
      boss,
      hint,
      mpStatus,
      bounds,
    };
  }

  function primaryActionButton(cx, cy, w, h, label, id, {
    selected = true,
    scale = 1,
    showPlayIcon = false,
    fontSize = 20,
  } = {}) {
    const left = cx - w / 2;
    ctx.save();
    const glow = ctx.createLinearGradient(left, 0, left + w, 0);
    glow.addColorStop(0, "rgba(7,17,43,0)");
    glow.addColorStop(0.18, selected ? "rgba(12,24,54,0.68)" : "rgba(12,24,54,0.25)");
    glow.addColorStop(0.82, selected ? "rgba(12,24,54,0.68)" : "rgba(12,24,54,0.25)");
    glow.addColorStop(1, "rgba(7,17,43,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.strokeStyle = selected ? "rgba(255,218,126,0.9)" : "rgba(210,225,255,0.22)";
    ctx.lineWidth = selected ? 2 * scale : 1 * scale;
    ctx.beginPath();
    ctx.moveTo(left + 18 * scale, cy + h / 2 - 1 * scale);
    ctx.lineTo(left + w - 18 * scale, cy + h / 2 - 1 * scale);
    ctx.stroke();
    if (showPlayIcon) {
      const playX = cx - 70 * scale;
      ctx.fillStyle = selected ? GOLD : "#aaa6bb";
      ctx.beginPath();
      ctx.moveTo(playX - 5 * scale, cy - 8 * scale);
      ctx.lineTo(playX + 8 * scale, cy);
      ctx.lineTo(playX - 5 * scale, cy + 8 * scale);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    text(label, cx + (showPlayIcon ? 10 * scale : 0), cy + 1 * scale, {
      size: fontSize * scale,
      color: selected ? "#fff8e5" : "#b5b1c2",
      weight: 900,
      align: "center",
      baseline: "middle",
    });
    region(left, cy - h / 2, w, h, id);
    return { x: left, y: cy - h / 2, w, h, id, label, selected };
  }

  // === title ===
  function drawTitle({ t, best, bestName, index, bankShards = null }) {
    const bounds = safeBounds();
    const cx = bounds.cx;
    const mobile = isMobileLayout();
    const verticalTitle = mobile || W / H < 1.15;
    const cinematicWide = !verticalTitle && W / H > 1.25;
    const scale = screenUiScale();
    const actionScale = isShortLandscape() ? baseUiScale() : clamp(scale, 1.05, 1.5);
    const titleCx = cinematicWide ? bounds.left + 205 : cx;

    const keyArtName = mobile
      ? "title_keyart_mobile_v5"
      : verticalTitle
        ? "title_keyart_square_v5"
        : "title_keyart_wide_v5";
    const keyArt = sprites[keyArtName];
    const artScale = Math.max(W / keyArt.width, H / keyArt.height);
    const artW = keyArt.width * artScale;
    const artH = keyArt.height * artScale;
    const artX = (W - artW) / 2;
    const artY = (H - artH) / 2;

    ctx.save();
    ctx.drawImage(keyArt, artX, artY, artW, artH);
    if (cinematicWide) {
      let shade = ctx.createLinearGradient(0, 0, W * 0.58, 0);
      shade.addColorStop(0, "rgba(2,10,35,0.62)");
      shade.addColorStop(0.62, "rgba(2,10,35,0.2)");
      shade.addColorStop(1, "rgba(2,10,35,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      shade = ctx.createLinearGradient(0, H * 0.52, 0, H);
      shade.addColorStop(0, "rgba(2,8,28,0)");
      shade.addColorStop(1, "rgba(2,8,28,0.5)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, H * 0.52, W, H * 0.48);
    }
    ctx.restore();
    metrics.titleKeyArtBox = { left: 0, right: W, top: 0, bottom: H };
    metrics.titleKeyArtMode = keyArtName;

    ctx.save();
    for (let i = 0; i < 6; i += 1) {
      const phase = i * 1.37;
      const ax = bounds.left + 42 + ((i * 173) % Math.max(120, bounds.width - 84));
      const ay = ((t * (7 + i % 2 * 3) + phase * 109) % (H + 100)) - 50;
      ctx.globalAlpha = 0.1 + (i % 2) * 0.035;
      ctx.fillStyle = i % 2 ? "#6fb7ff" : "#fff2c8";
      ctx.save();
      ctx.translate(ax + Math.sin(t * 0.9 + phase) * 7, ay);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
      ctx.restore();
    }
    ctx.restore();

    const logo = sprites.title_logo_v4;
    const logoW = verticalTitle ? 420 : cinematicWide ? 400 : 460;
    const logoH = logo.height / logo.width * logoW;
    const logoTop = verticalTitle ? 105 : cinematicWide ? 45 : 112;
    ctx.save();
    ctx.filter = "drop-shadow(0 10px 12px rgba(2,7,23,0.54))";
    ctx.drawImage(logo, titleCx - logoW / 2, logoTop, logoW, logoH);
    ctx.restore();
    metrics.titleLogoBox = {
      left: Math.round(titleCx - logoW / 2),
      right: Math.round(titleCx + logoW / 2),
      top: Math.round(logoTop),
      bottom: Math.round(logoTop + logoH),
      width: Math.round(logoW),
    };

    const menuCx = isShortLandscape() ? bounds.cx : cinematicWide ? bounds.right - 220 : cx;
    const menuY = verticalTitle ? 824 : cinematicWide ? H - 210 * baseUiScale() : H - 186 * baseUiScale();
    let titleBank = null;
    if (bankShards !== null) {
      const bankValue = Math.max(0, Math.round(Number(bankShards) || 0));
      const bankLabel = `보관 파편  ${bankValue.toLocaleString("ko-KR")}`;
      const bankSize = 11.5 * actionScale;
      const bankWidth = measureTextWidth(bankLabel, { size: bankSize, weight: 900 });
      const bankY = menuY - 43 * actionScale;
      crystalIcon(menuCx - bankWidth / 2 - 12 * actionScale, bankY - 4 * actionScale, 6 * actionScale, "#8fe3ff");
      text(bankLabel, menuCx, bankY, { size: bankSize, color: "#bfeeff", weight: 900, align: "center", stroke: true });
      titleBank = {
        x: menuCx - bankWidth / 2 - 24 * actionScale,
        y: bankY - 15 * actionScale,
        w: bankWidth + 24 * actionScale,
        h: 21 * actionScale,
        value: bankValue,
      };
    }
    const primarySelected = index === 0;
    const actionW = Math.min(bounds.width - 54, (mobile ? 278 : 250) * actionScale);
    const actionH = 48 * actionScale;
    const actionLeft = menuCx - actionW / 2;
    primaryActionButton(menuCx, menuY, actionW, actionH, "모험 시작", "title:0", {
      selected: primarySelected,
      scale: actionScale,
      showPlayIcon: true,
      fontSize: 20,
    });

    const rankY = menuY + 56 * actionScale;
    const rankSelected = index === 1;
    const rankColor = rankSelected ? "#ffe19b" : "#c6c7d4";
    const rankIconX = menuCx - 47 * actionScale;
    ctx.save();
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 2 * actionScale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rankIconX - 8 * actionScale, rankY - 8 * actionScale);
    ctx.lineTo(rankIconX + 8 * actionScale, rankY - 8 * actionScale);
    ctx.lineTo(rankIconX + 6 * actionScale, rankY + 2 * actionScale);
    ctx.quadraticCurveTo(rankIconX, rankY + 8 * actionScale, rankIconX - 6 * actionScale, rankY + 2 * actionScale);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rankIconX - 8 * actionScale, rankY - 5 * actionScale);
    ctx.quadraticCurveTo(rankIconX - 15 * actionScale, rankY - 5 * actionScale, rankIconX - 12 * actionScale, rankY + 1 * actionScale);
    ctx.quadraticCurveTo(rankIconX - 10 * actionScale, rankY + 4 * actionScale, rankIconX - 6 * actionScale, rankY + 3 * actionScale);
    ctx.moveTo(rankIconX + 8 * actionScale, rankY - 5 * actionScale);
    ctx.quadraticCurveTo(rankIconX + 15 * actionScale, rankY - 5 * actionScale, rankIconX + 12 * actionScale, rankY + 1 * actionScale);
    ctx.quadraticCurveTo(rankIconX + 10 * actionScale, rankY + 4 * actionScale, rankIconX + 6 * actionScale, rankY + 3 * actionScale);
    ctx.moveTo(rankIconX, rankY + 7 * actionScale);
    ctx.lineTo(rankIconX, rankY + 12 * actionScale);
    ctx.moveTo(rankIconX - 7 * actionScale, rankY + 13 * actionScale);
    ctx.lineTo(rankIconX + 7 * actionScale, rankY + 13 * actionScale);
    ctx.stroke();
    if (rankSelected) {
      ctx.strokeStyle = "rgba(255,218,126,0.72)";
      ctx.beginPath();
      ctx.moveTo(menuCx - 68 * actionScale, rankY + 16 * actionScale);
      ctx.lineTo(menuCx + 68 * actionScale, rankY + 16 * actionScale);
      ctx.stroke();
    }
    ctx.restore();
    text("순위표", menuCx + 17 * actionScale, rankY, {
      size: 14 * actionScale,
      color: rankColor,
      weight: rankSelected ? 800 : 650,
      align: "center",
      baseline: "middle",
    });
    region(menuCx - 86 * actionScale, rankY - 22 * actionScale, 172 * actionScale, 42 * actionScale, "title:1");

    metrics.titlePrimaryBox = { left: actionLeft, right: actionLeft + actionW, top: menuY - actionH / 2, bottom: menuY + actionH / 2 };
    metrics.titleRankBox = { left: menuCx - 86 * actionScale, right: menuCx + 86 * actionScale, top: rankY - 22 * actionScale, bottom: rankY + 20 * actionScale };
    metrics.titleBank = titleBank;

    if (best > 0) {
      const bestY = rankY + 31 * actionScale;
      text(`최고 기록  ${bestName}  ${best}`, menuCx, bestY, {
        size: 10.5 * actionScale, color: "rgba(255,226,163,0.8)", align: "center", weight: 700,
      });
    }
    keyHint([{ k: ["A", "D"], t: "이동" }, { k: ["J"], t: "공격 / 확인" }, { k: ["W"], t: "점프" }, { k: ["S"], t: "방어" }, { k: ["K"], t: "기술" }], H - 25 * baseUiScale());
  }

  function ornament(cx, y, halfW) {
    ctx.save();
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx - 12, y);
    ctx.moveTo(cx + 12, y);
    ctx.lineTo(cx + halfW, y);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
  }

  function drawPreparation({
    section = "main",
    weapon = null,
    bankShards = 0,
    ticketStock = 0,
    carryTickets = 0,
    carryLimit = 2,
    freeRerolls = 1,
    growthItems = [],
    ticketPrice = 50,
    focusedIndex = 0,
    notice = "",
    saveError = "",
    canTransact = true,
    enterT = 0,
  } = {}) {
    const mobile = isMobileLayout();
    const landscape = isShortLandscape();
    const bounds = landscape ? shortLandscapeBounds(760) : safeBounds();
    const cx = bounds.cx;
    const scale = landscape
      ? baseUiScale()
      : Math.min(sceneUiScale(), H / (mobile ? 690 : 720));
    const balance = Math.max(0, Math.round(Number(bankShards) || 0));
    const stock = Math.max(0, Math.round(Number(ticketStock) || 0));
    const carried = Math.max(0, Math.min(Math.round(Number(carryLimit) || 0), Math.round(Number(carryTickets) || 0)));
    const limit = Math.max(0, Math.round(Number(carryLimit) || 0));
    const requestedFocus = Math.max(0, Math.round(Number(focusedIndex) || 0));
    const canWrite = canTransact !== false;
    const growth = (Array.isArray(growthItems) && growthItems.length ? growthItems : [
      { id: "hp", name: "최대 체력", level: 0, maxLevel: 3, current: 100, next: 105, cost: 150 },
      { id: "guard", name: "최대 방어", level: 0, maxLevel: 3, current: 100, next: 105, cost: 150 },
    ]).slice(0, 2).map((item, index) => {
      const level = Math.max(0, Math.round(Number(item.level) || 0));
      const maxLevel = Math.max(level, Math.round(Number(item.maxLevel) || 3));
      const maxed = item.maxed === true || level >= maxLevel;
      const cost = Math.max(0, Math.round(Number(item.cost) || 0));
      return {
        ...item,
        id: item.id || (index === 0 ? "hp" : "guard"),
        name: item.name || (index === 0 ? "최대 체력" : "최대 방어"),
        level,
        maxLevel,
        maxed,
        cost,
        canBuy: canWrite && (item.canBuy === undefined ? !maxed && balance >= cost : Boolean(item.canBuy)),
      };
    });
    const focusOrders = {
      main: ["weapon", "growth", "tickets", "carryLess", "carryMore", "start", "back"],
      growth: ["buyHp", "buyGuard", "home"],
      tickets: ["buyTicket", "home"],
    };
    const focusOrder = focusOrders[section] || focusOrders.main;
    const focus = Math.min(Math.max(0, focusOrder.length - 1), requestedFocus);
    const selected = id => focusOrder[focus] === id;
    const boxes = {};

    const titleY = (landscape ? 31 : mobile ? 46 : 48) * scale;
    text(section === "growth" ? "영구 성장" : section === "tickets" ? "리롤권 상점" : "모험 준비", cx, titleY, {
      size: (landscape ? 24 : mobile ? 27 : 31) * scale,
      color: "#fff5da", font: SERIF, weight: 900, align: "center", spacing: 4 * scale, stroke: true,
    });
    ornament(cx, titleY + (landscape ? 14 : 18) * scale, (landscape ? 100 : 126) * scale);
    const bankY = titleY + (landscape ? 29 : 39) * scale;
    const bankText = `보관 파편 ${balance.toLocaleString("ko-KR")}  ·  리롤권 ${stock.toLocaleString("ko-KR")}`;
    const bankSize = fitTextSize(bankText, (landscape ? 11 : 12.5) * scale, Math.min(bounds.width - 56 * scale, 330 * scale), { weight: 900 });
    const bankWidth = measureTextWidth(bankText, { size: bankSize, weight: 900 });
    crystalIcon(cx - bankWidth / 2 - 12 * scale, bankY - 4 * scale, 6 * scale, "#8fe3ff");
    text(bankText, cx, bankY, { size: bankSize, color: "#bfeeff", weight: 900, align: "center" });

    const drawWeaponSummary = (box, focusId = "weapon") => {
      const active = selected(focusId);
      panel(box.x, box.y, box.w, box.h, { alpha: active ? 0.88 : 0.7, border: active ? GOLD : GOLD_DIM, radius: 10 * scale });
      const weaponId = weapon?.id || "chokento";
      const iconSize = Math.min(box.h * 0.52, (landscape ? 76 : 88) * scale);
      const iconX = box.x + Math.min(box.w * 0.24, 86 * scale);
      const iconY = box.y + box.h / 2;
      if (sprites[WEAPON_SPRITE[weaponId]]) weaponIcon(weaponId, iconX, iconY, iconSize, { rotation: weaponId === "chokento" || weaponId === "katana" ? -Math.PI * 3 / 4 : 0 });
      const textX = box.x + Math.min(box.w * 0.43, 154 * scale);
      text("선택한 무기", textX, box.y + 28 * scale, { size: 10.5 * scale, color: MUTED, weight: 800 });
      text(weapon?.name || WEAPON_LABEL[weaponId] || "장검", textX, box.y + 57 * scale, {
        size: fitTextSize(weapon?.name || WEAPON_LABEL[weaponId] || "장검", 21 * scale, box.x + box.w - textX - 18 * scale, { font: SERIF, weight: 900 }),
        color: active ? GOLD : "#fff2d0", font: SERIF, weight: 900,
      });
      const role = weapon?.role || WEAPON_ROLE[weaponId] || "";
      if (role) text(role, textX, box.y + 80 * scale, { size: fitTextSize(role, 11.5 * scale, box.x + box.w - textX - 18 * scale), color: "#c6d4e8", weight: 700 });
      text("눌러서 무기 변경", textX, box.y + box.h - 18 * scale, { size: 10.5 * scale, color: active ? "#ffe2a3" : MUTED, weight: 800 });
      region(box.x, box.y, box.w, box.h, "preparation:weapon");
      boxes.weapon = { ...box, selected: active, weaponId };
    };

    const growthSummary = growth.length
      ? growth.map((item) => `${mobile && !landscape ? item.name.replace("최대 ", "") : item.name} ${item.level}/${item.maxLevel}`).join(" · ")
      : "성장 항목 없음";
    const drawAccessCard = (box, id, titleLabel, detail, iconName) => {
      const active = selected(id);
      const compactCard = mobile && !landscape && box.w < 220 * scale;
      panel(box.x, box.y, box.w, box.h, { alpha: active ? 0.86 : 0.65, border: active ? GOLD : "rgba(150,170,205,0.34)", radius: 9 * scale });
      drawUiIcon(iconName, box.x + (compactCard ? 25 : 27) * scale, box.y + (compactCard ? 29 * scale : box.h / 2), 31 * scale, { alpha: active ? 1 : 0.78 });
      text(titleLabel, box.x + (compactCard ? 48 : 51) * scale, box.y + 30 * scale, { size: 14 * scale, color: active ? "#fff2c8" : TEXT, weight: 900 });
      text(detail, compactCard ? box.x + box.w / 2 : box.x + 51 * scale, box.y + (compactCard ? 76 : 53) * scale, {
        size: fitTextSize(detail, 10.5 * scale, compactCard ? box.w - 20 * scale : box.w - 66 * scale),
        color: active ? "#ffe2a3" : MUTED, weight: 700, align: compactCard ? "center" : "left",
      });
      region(box.x, box.y, box.w, box.h, `preparation:${id}`);
      boxes[id] = { ...box, selected: active };
    };

    if (section === "main") {
      if (landscape) {
        const top = 77 * scale;
        const gap = 14 * scale;
        const leftW = 350 * scale;
        const rightX = bounds.right - 382 * scale;
        drawWeaponSummary({ x: bounds.left, y: top, w: leftW, h: 184 * scale });
        drawAccessCard({ x: rightX, y: top, w: 382 * scale, h: 72 * scale }, "growth", "영구 성장", growthSummary, "hp");
        drawAccessCard({ x: rightX, y: top + 82 * scale, w: 382 * scale, h: 72 * scale }, "tickets", "리롤권 구매", `1장 ${Math.max(0, Number(ticketPrice) || 0).toLocaleString("ko-KR")} 파편 · 보유 ${stock}`, "reroll");
        const carryY = top + 164 * scale;
        const carryW = 382 * scale;
        panel(rightX, carryY, carryW, 64 * scale, { alpha: 0.68, border: "rgba(143,227,255,0.34)", radius: 9 * scale });
        text(`다음 모험 반입  ${carried}/${limit}`, rightX + 18 * scale, carryY + 24 * scale, { size: 12 * scale, color: "#bfeeff", weight: 900 });
        text(`무료 ${Math.max(0, Number(freeRerolls) || 0)}회 + 구매권`, rightX + 18 * scale, carryY + 47 * scale, { size: 10.5 * scale, color: MUTED, weight: 700 });
        boxes.carryLess = outlinedActionButton(rightX + carryW - 82 * scale, carryY + 32 * scale, 48 * scale, 42 * scale, "−", "preparation:carryLess", { selected: selected("carryLess"), disabled: !canWrite || carried <= 0, scale, fontSize: 19 });
        boxes.carryMore = outlinedActionButton(rightX + carryW - 29 * scale, carryY + 32 * scale, 48 * scale, 42 * scale, "+", "preparation:carryMore", { selected: selected("carryMore"), disabled: !canWrite || carried >= Math.min(limit, stock), scale, fontSize: 19 });
        const footerY = 334 * scale;
        boxes.back = outlinedActionButton(cx - 207 * scale, footerY, 174 * scale, 44 * scale, "타이틀로", "preparation:back", { selected: selected("back"), scale, fontSize: 13 });
        boxes.start = outlinedActionButton(cx + 90 * scale, footerY, 406 * scale, 48 * scale, `모험 시작 · 리롤 ${Math.max(0, Number(freeRerolls) || 0) + carried}회`, "preparation:start", { selected: selected("start"), disabled: !canWrite, scale, fontSize: 15 });
      } else if (mobile) {
        const contentW = Math.min(bounds.width - 28 * scale, 520 * scale);
        const left = cx - contentW / 2;
        const weaponY = 105 * scale;
        drawWeaponSummary({ x: left, y: weaponY, w: contentW, h: 128 * scale });
        const gap = 10 * scale;
        const cardW = (contentW - gap) / 2;
        drawAccessCard({ x: left, y: 247 * scale, w: cardW, h: 104 * scale }, "growth", "영구 성장", growthSummary, "hp");
        drawAccessCard({ x: left + cardW + gap, y: 247 * scale, w: cardW, h: 104 * scale }, "tickets", "리롤권", `1장 ${Math.max(0, Number(ticketPrice) || 0)} 파편`, "reroll");
        const carryY = 365 * scale;
        panel(left, carryY, contentW, 82 * scale, { alpha: 0.68, border: "rgba(143,227,255,0.34)", radius: 9 * scale });
        text(`다음 모험 반입  ${carried}/${limit}`, left + 18 * scale, carryY + 30 * scale, { size: 13 * scale, color: "#bfeeff", weight: 900 });
        text(`무료 ${Math.max(0, Number(freeRerolls) || 0)}회 + 구매권 ${carried}장`, left + 18 * scale, carryY + 57 * scale, { size: 11 * scale, color: MUTED, weight: 700 });
        boxes.carryLess = outlinedActionButton(left + contentW - 84 * scale, carryY + 41 * scale, 48 * scale, 48 * scale, "−", "preparation:carryLess", { selected: selected("carryLess"), disabled: !canWrite || carried <= 0, scale, fontSize: 20 });
        boxes.carryMore = outlinedActionButton(left + contentW - 30 * scale, carryY + 41 * scale, 48 * scale, 48 * scale, "+", "preparation:carryMore", { selected: selected("carryMore"), disabled: !canWrite || carried >= Math.min(limit, stock), scale, fontSize: 20 });
        const message = saveError || notice;
        if (message) text(message, cx, 472 * scale, { size: fitTextSize(message, 11 * scale, contentW), color: saveError ? "#ffaaaa" : "#b9c9e1", align: "center", weight: 750 });
        boxes.start = outlinedActionButton(cx, 526 * scale, Math.min(contentW, 300 * scale), 58 * scale, `모험 시작 · 리롤 ${Math.max(0, Number(freeRerolls) || 0) + carried}회`, "preparation:start", { selected: selected("start"), disabled: !canWrite, scale, fontSize: 17 });
        boxes.back = outlinedActionButton(cx, 602 * scale, Math.min(contentW, 210 * scale), 44 * scale, "타이틀로", "preparation:back", { selected: selected("back"), scale, fontSize: 12.5 });
      } else {
        const contentW = Math.min(bounds.width - 44 * scale, 850 * scale);
        const left = cx - contentW / 2;
        const gap = 18 * scale;
        const leftW = 370 * scale;
        const rightW = contentW - leftW - gap;
        const top = 118 * scale;
        drawWeaponSummary({ x: left, y: top, w: leftW, h: 300 * scale });
        drawAccessCard({ x: left + leftW + gap, y: top, w: rightW, h: 94 * scale }, "growth", "영구 성장", growthSummary, "hp");
        drawAccessCard({ x: left + leftW + gap, y: top + 108 * scale, w: rightW, h: 94 * scale }, "tickets", "리롤권 구매", `1장 ${Math.max(0, Number(ticketPrice) || 0).toLocaleString("ko-KR")} 파편 · 보유 ${stock}`, "reroll");
        const carryY = top + 216 * scale;
        panel(left + leftW + gap, carryY, rightW, 84 * scale, { alpha: 0.68, border: "rgba(143,227,255,0.34)", radius: 9 * scale });
        text(`다음 모험 반입  ${carried}/${limit}`, left + leftW + gap + 18 * scale, carryY + 31 * scale, { size: 13 * scale, color: "#bfeeff", weight: 900 });
        text(`무료 ${Math.max(0, Number(freeRerolls) || 0)}회 + 구매권 ${carried}장`, left + leftW + gap + 18 * scale, carryY + 59 * scale, { size: 11 * scale, color: MUTED, weight: 700 });
        boxes.carryLess = outlinedActionButton(left + contentW - 88 * scale, carryY + 42 * scale, 48 * scale, 48 * scale, "−", "preparation:carryLess", { selected: selected("carryLess"), disabled: !canWrite || carried <= 0, scale, fontSize: 20 });
        boxes.carryMore = outlinedActionButton(left + contentW - 32 * scale, carryY + 42 * scale, 48 * scale, 48 * scale, "+", "preparation:carryMore", { selected: selected("carryMore"), disabled: !canWrite || carried >= Math.min(limit, stock), scale, fontSize: 20 });
        const message = saveError || notice;
        if (message) text(message, cx, 456 * scale, { size: fitTextSize(message, 11.5 * scale, contentW), color: saveError ? "#ffaaaa" : "#b9c9e1", align: "center", weight: 750 });
        boxes.start = outlinedActionButton(cx, 512 * scale, 350 * scale, 58 * scale, `모험 시작 · 리롤 ${Math.max(0, Number(freeRerolls) || 0) + carried}회`, "preparation:start", { selected: selected("start"), disabled: !canWrite, scale, fontSize: 18 });
        boxes.back = outlinedActionButton(cx, 581 * scale, 190 * scale, 42 * scale, "타이틀로", "preparation:back", { selected: selected("back"), scale, fontSize: 12.5 });
      }
    } else if (section === "growth") {
      const contentW = Math.min(bounds.width - 32 * scale, (landscape ? 730 : mobile ? 520 : 820) * scale);
      const left = cx - contentW / 2;
      const gap = (landscape ? 14 : 18) * scale;
      const horizontal = landscape || !mobile;
      const top = (landscape ? 82 : 126) * scale;
      const cardW = horizontal ? (contentW - gap) / 2 : contentW;
      const cardH = (landscape ? 198 : mobile ? 172 : 250) * scale;
      growth.forEach((item, index) => {
        const focusId = index === 0 ? "buyHp" : "buyGuard";
        const x = horizontal ? left + index * (cardW + gap) : left;
        const y = horizontal ? top : top + index * (cardH + gap);
        panel(x, y, cardW, cardH, { alpha: selected(focusId) ? 0.88 : 0.7, border: selected(focusId) ? GOLD : GOLD_DIM, radius: 10 * scale });
        drawUiIcon(index === 0 ? "hp" : "guard", x + 35 * scale, y + 38 * scale, 42 * scale, { alpha: 0.92 });
        text(item.name, x + 66 * scale, y + 35 * scale, { size: 18 * scale, color: selected(focusId) ? GOLD : "#fff2d0", font: SERIF, weight: 900 });
        text(`단계 ${item.level}/${item.maxLevel}`, x + 66 * scale, y + 57 * scale, { size: 10.5 * scale, color: MUTED, weight: 800 });
        const current = Number.isFinite(Number(item.current)) ? Number(item.current) : 100 + item.level * 5;
        const next = Number.isFinite(Number(item.next)) ? Number(item.next) : current + 5;
        text(item.maxed ? `현재 ${current} · 최대 단계` : `현재 ${current}  →  구매 후 ${next}`, x + cardW / 2, y + (landscape ? 92 : 96) * scale, {
          size: fitTextSize(item.maxed ? `현재 ${current} · 최대 단계` : `현재 ${current}  →  구매 후 ${next}`, 14 * scale, cardW - 34 * scale),
          color: item.maxed ? "#b9c9e1" : "#bcebb6", weight: 900, align: "center",
        });
        const label = item.maxed ? "최대 단계"
          : !canWrite ? "저장 사용 불가"
          : item.canBuy ? `강화 · ${item.cost.toLocaleString("ko-KR")} 파편`
            : `파편 부족 · ${item.cost.toLocaleString("ko-KR")}`;
        const actionId = `preparation:${focusId}`;
        boxes[focusId] = outlinedActionButton(x + cardW / 2, y + cardH - 38 * scale, cardW - 34 * scale, 48 * scale, label, actionId, {
          selected: selected(focusId), disabled: item.maxed || !item.canBuy, scale, fontSize: 12.5,
        });
        boxes[focusId].itemId = item.id;
      });
      const message = saveError || notice || "구매한 성장은 다음 모험부터 적용됩니다";
      const noteY = horizontal ? top + cardH + 26 * scale : top + cardH * 2 + gap + 25 * scale;
      text(message, cx, noteY, { size: fitTextSize(message, 11.5 * scale, contentW), color: saveError ? "#ffaaaa" : MUTED, align: "center", weight: 750 });
      const homeY = landscape ? 335 * scale : Math.min(noteY + 54 * scale, H - 42 * scale);
      boxes.home = outlinedActionButton(cx, homeY, 210 * scale, 44 * scale, "모험 준비로", "preparation:home", { selected: selected("home"), scale, fontSize: 13 });
    } else {
      const contentW = Math.min(bounds.width - 34 * scale, (landscape ? 620 : mobile ? 500 : 620) * scale);
      const left = cx - contentW / 2;
      const top = (landscape ? 83 : 132) * scale;
      const cardH = (landscape ? 198 : mobile ? 260 : 280) * scale;
      panel(left, top, contentW, cardH, { alpha: 0.78, border: selected("buyTicket") ? GOLD : GOLD_DIM, radius: 12 * scale });
      drawUiIcon("reroll", cx, top + (landscape ? 42 : 50) * scale, 58 * scale, { alpha: 0.96 });
      text(`리롤권 1장`, cx, top + (landscape ? 82 : 94) * scale, { size: 22 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center" });
      text(`${Math.max(0, Math.round(Number(ticketPrice) || 0)).toLocaleString("ko-KR")} 파편`, cx, top + (landscape ? 108 : 124) * scale, { size: 15 * scale, color: GOLD, weight: 900, align: "center" });
      text(`현재 재고 ${stock}장 · 구매 후 잔액 ${Math.max(0, balance - Math.max(0, Number(ticketPrice) || 0)).toLocaleString("ko-KR")}`, cx, top + (landscape ? 132 : 151) * scale, {
        size: fitTextSize(`현재 재고 ${stock}장 · 구매 후 잔액 ${Math.max(0, balance - Math.max(0, Number(ticketPrice) || 0)).toLocaleString("ko-KR")}`, 11.5 * scale, contentW - 34 * scale), color: MUTED, weight: 750, align: "center",
      });
      const canBuyTicket = canWrite && balance >= Math.max(0, Number(ticketPrice) || 0) && Math.max(0, Number(ticketPrice) || 0) > 0;
      const ticketLabel = !canWrite ? "저장 사용 불가" : canBuyTicket ? "리롤권 구매" : "파편 부족";
      boxes.buyTicket = outlinedActionButton(cx, top + cardH - (landscape ? 29 : 39) * scale, contentW - 46 * scale, 50 * scale, ticketLabel, "preparation:buyTicket", {
        selected: selected("buyTicket"), disabled: !canBuyTicket, scale, fontSize: 14,
      });
      const message = saveError || notice || "구매한 권은 준비 화면에서 다음 모험에 반입합니다";
      text(message, cx, top + cardH + 29 * scale, { size: fitTextSize(message, 11 * scale, contentW), color: saveError ? "#ffaaaa" : MUTED, align: "center", weight: 750 });
      boxes.home = outlinedActionButton(cx, landscape ? 335 * scale : top + cardH + 81 * scale, 210 * scale, 44 * scale, "모험 준비로", "preparation:home", { selected: selected("home"), scale, fontSize: 13 });
    }

    metrics.preparation = {
      section,
      focusedIndex: focus,
      focusedId: focusOrder[focus] || null,
      focusOrder,
      balance,
      ticketStock: stock,
      carryTickets: carried,
      carryLimit: limit,
      freeRerolls: Math.max(0, Math.round(Number(freeRerolls) || 0)),
      growthItems: growth.map(({ id, name, level, maxLevel, maxed, cost, canBuy }) => ({ id, name, level, maxLevel, maxed, cost, canBuy })),
      boxes,
      notice: saveError || notice || null,
      saveError: saveError || null,
      canTransact: canWrite,
      enterT: Number(enterT) || 0,
      landscape,
    };
  }

  // === weapon select ===
  const WEAPON_SPRITE = {
    chokento: "wpn_longsword_v2",
    katana: "wpn_katana_v2",
    axe: "wpn_axe_v2",
    spear: "wpn_spear_v2",
    bow: "wpn_bow_v2",
  };
  const WEAPON_LABEL = { chokento: "장검", katana: "일본도", axe: "도끼", spear: "창", bow: "활" };
  const WEAPON_ROLE = { chokento: "균형 잡힌 연속 공격", katana: "빠른 연타", axe: "강한 한 방", spear: "위쪽 관통", bow: "긴 사거리" };

  function weaponIcon(id, x, y, size, { rotation = 0 } = {}) {
    const sprite = sprites[WEAPON_SPRITE[id]];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.imageSmoothingEnabled = true;
    ctx.shadowColor = "rgba(205,225,255,0.55)";
    ctx.shadowBlur = 5;
    const h = size;
    const w = h * sprite.width / sprite.height;
    if (id === "bow") {
      ctx.rotate(-Math.PI / 4);
    }
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function attackSpeedLabel(weapon) {
    const cooldown = Math.max(0.08, weapon.cooldown || 0.28);
    return `${(1 / cooldown).toFixed(1)}회/초`;
  }

  function drawWeaponSelectLandscape({
    weapons,
    index,
    t,
    deniedT,
    assetsLoading,
    assetsFailed,
    preparation,
  }) {
    const bounds = shortLandscapeBounds(760);
    const cx = bounds.cx;
    const scale = baseUiScale();
    const prep = preparation || null;
    text("무기 선택", cx, 33 * scale, {
      size: 25 * scale, color: "#fff5da", font: SERIF, weight: 900, align: "center", spacing: 4 * scale, stroke: true,
    });
    ornament(cx, 49 * scale, 100 * scale);
    const status = assetsLoading ? "모험 장비를 준비하는 중"
      : assetsFailed ? "선택을 눌러 다시 시도해주세요"
        : prep ? `보관 파편 ${Math.max(0, Number(prep.bankShards) || 0).toLocaleString("ko-KR")} · 리롤권 ${Math.max(0, Number(prep.ticketStock) || 0)} · 반입 ${Math.max(0, Number(prep.carryTickets) || 0)}` : "";
    if (status) text(status, cx, 65 * scale, {
      size: fitTextSize(status, 10.5 * scale, 420 * scale), color: assetsFailed ? "#ffaaaa" : prep ? "#bfeeff" : "#ffe2a3", weight: 800, align: "center",
    });

    const gap = 8 * scale;
    const slotY = 76 * scale;
    const slotH = 126 * scale;
    const slotW = (bounds.width - gap * Math.max(0, weapons.length - 1)) / Math.max(1, weapons.length);
    const slotBoxes = [];
    weapons.forEach((weapon, i) => {
      const enter = clamp((t - i * 0.05) / 0.3, 0, 1);
      const selected = i === index;
      const x = bounds.left + i * (slotW + gap);
      const shake = selected && weapon.locked && deniedT > 0 ? Math.sin(t * 60) * 3 * scale : 0;
      const y = slotY + (1 - easeOutCubic(enter)) * 14 * scale;
      ctx.save();
      ctx.globalAlpha = enter;
      drawUiFrame("weaponFrame", x + shake, y, slotW, slotH, { alpha: selected ? 1 : weapon.locked ? 0.36 : 0.58 });
      const cardCx = x + shake + slotW / 2;
      const iconSize = (selected ? 58 : 51) * scale;
      const iconY = y + 47 * scale;
      if (sprites[WEAPON_SPRITE[weapon.id]]) weaponIcon(weapon.id, cardCx, iconY, iconSize, {
        rotation: weapon.id === "chokento" || weapon.id === "katana" ? -Math.PI * 3 / 4 : 0,
      });
      const nameSize = fitTextSize(weapon.name, (selected ? 15 : 13.5) * scale, slotW - 14 * scale, { weight: 900 });
      text(weapon.name, cardCx, y + 106 * scale, { size: nameSize, color: selected ? GOLD : weapon.locked ? MUTED : TEXT, weight: 900, align: "center", stroke: true });
      if (weapon.locked) drawUiIcon("lock", x + slotW - 16 * scale, y + 17 * scale, 24 * scale, { alpha: 0.86 });
      ctx.restore();
      region(x, y, slotW, slotH, `weapon:${i}`);
      slotBoxes.push({
        x, y, w: slotW, h: slotH, selected, locked: Boolean(weapon.locked),
        content: {
          weapon: { x: cardCx - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          name: { x: x + 7 * scale, y: y + 88 * scale, w: slotW - 14 * scale, h: 22 * scale },
          lock: weapon.locked ? { x: x + slotW - 29 * scale, y: y + 5 * scale, w: 26 * scale, h: 26 * scale } : null,
        },
      });
    });

    const sel = weapons[index] || weapons[0];
    const infoY = 212 * scale;
    const infoH = 70 * scale;
    const infoW = bounds.width;
    panel(bounds.left, infoY, infoW, infoH, { alpha: 0.58, border: sel?.locked ? "rgba(255,122,122,0.45)" : GOLD_DIM, radius: 8 * scale });
    const infoTitle = sel?.locked ? `${sel.name} · 잠김` : sel?.name || "장검";
    text(infoTitle, bounds.left + 18 * scale, infoY + 27 * scale, { size: 18 * scale, color: sel?.locked ? "#ffaaaa" : GOLD, font: SERIF, weight: 900 });
    const detail = sel?.locked ? (sel.unlock?.label || "도전을 계속하면 해금") : (sel?.role || WEAPON_ROLE[sel?.id] || "");
    text(detail, bounds.left + 18 * scale, infoY + 52 * scale, { size: fitTextSize(detail, 10.5 * scale, 295 * scale), color: sel?.locked ? "#ffe2a3" : "#c6d4e8", weight: 700 });
    const stats = [
      ["공격", String(Math.round(sel?.damage || 0))],
      ["사거리", String(Math.round(sel?.range || 0))],
      ["공속", sel ? attackSpeedLabel(sel) : "—"],
    ];
    const statsLeft = bounds.right - 390 * scale;
    stats.forEach(([label, value], i) => {
      const x = statsLeft + i * 126 * scale;
      text(label, x, infoY + 25 * scale, { size: 10 * scale, color: MUTED, weight: 800 });
      text(value, x, infoY + 51 * scale, { size: 14 * scale, color: "#fff2d0", weight: 900 });
    });

    let preparationBox = null;
    if (prep) {
      preparationBox = outlinedActionButton(cx - 224 * scale, 332 * scale, 196 * scale, 46 * scale, "모험 준비로", "weapon:preparation", { scale, fontSize: 13 });
    }
    const confirmW = prep ? 420 * scale : 360 * scale;
    const confirmCx = prep ? cx + 112 * scale : cx;
    const confirmBox = outlinedActionButton(confirmCx, 332 * scale, confirmW, 48 * scale,
      assetsFailed ? "다시 시도" : prep ? "이 무기로 준비" : "선    택", "weapon:confirm", {
        selected: assetsFailed || (!sel?.locked && !assetsLoading), scale, fontSize: 16,
      });
    metrics.weaponSelect = {
      assetsLoading,
      assetsFailed,
      role: sel?.role || WEAPON_ROLE[sel?.id] || "",
      unlockProgress: sel?.unlockProgress || null,
      title: { x: cx - 120 * scale, y: 8 * scale, w: 240 * scale, h: 60 * scale },
      slots: slotBoxes,
      info: { x: bounds.left, y: infoY, w: infoW, h: infoH, content: {} },
      confirm: confirmBox,
      preparation: prep ? { ...prep, access: preparationBox } : null,
      landscape: true,
    };
  }

  function drawWeaponSelect({
    weapons,
    index,
    t,
    deniedT,
    assetsLoading = false,
    assetsFailed = false,
    preparation = null,
    bankShards = null,
    ticketStock = null,
    carryTickets = null,
  }) {
    const preparationSummary = preparation || (bankShards !== null || ticketStock !== null || carryTickets !== null ? {
      bankShards: Math.max(0, Number(bankShards) || 0),
      ticketStock: Math.max(0, Number(ticketStock) || 0),
      carryTickets: Math.max(0, Number(carryTickets) || 0),
    } : null);
    if (isShortLandscape()) {
      drawWeaponSelectLandscape({ weapons, index, t, deniedT, assetsLoading, assetsFailed, preparation: preparationSummary });
      return;
    }
    const bounds = safeBounds();
    const cx0 = bounds.cx;
    const mobile = isMobileLayout();
    const scale = mobile ? Math.min(screenUiScale(), H / 810) : screenUiScale();
    const titleSize = (mobile ? 26 : 30) * scale;
    const titleY = mobile ? 52 : isWideLayout() ? 50 : 48;
    const ornamentY = titleY + 17;
    const titleOrnamentW = Math.min(bounds.width * 0.54, (mobile ? 250 : 310) * scale);
    if (!preparationSummary) drawUiFrame("stageOrnament", cx0 - titleOrnamentW / 2, ornamentY * scale, titleOrnamentW, 24 * scale, { alpha: 0.92 });
    text("무기 선택", cx0, titleY * scale, {
      size: titleSize, color: "#fff5da", font: SERIF, weight: 900, align: "center", spacing: 5 * scale, stroke: true,
    });
    let preparationAccess = null;
    if (preparationSummary) {
      preparationAccess = outlinedActionButton(bounds.left + 50 * scale, 32 * scale, 86 * scale, 40 * scale, "준비로", "weapon:preparation", {
        scale, fontSize: 11.5,
      });
    }
    if (assetsLoading) {
      text("모험 장비를 준비하는 중", cx0, (titleY + 34) * scale, {
        size: (mobile ? 11.5 : 13.5) * scale, color: "#ffe2a3", weight: 800, align: "center",
      });
    } else if (assetsFailed) {
      text("선택을 눌러 다시 시도해주세요", cx0, (titleY + 34) * scale, {
        size: (mobile ? 11.5 : 13.5) * scale, color: "#ffb0b3", weight: 800, align: "center",
      });
    } else if (preparationSummary) {
      const prepText = `파편 ${Math.max(0, Number(preparationSummary.bankShards) || 0).toLocaleString("ko-KR")} · 권 ${Math.max(0, Number(preparationSummary.ticketStock) || 0)} · 반입 ${Math.max(0, Number(preparationSummary.carryTickets) || 0)}`;
      text(prepText, cx0, (titleY + 34) * scale, {
        size: fitTextSize(prepText, (mobile ? 10.5 : 12.5) * scale, Math.min(bounds.width - 132 * scale, 390 * scale)), color: "#bfeeff", weight: 850, align: "center",
      });
    }

    const columns = mobile ? 2 : weapons.length;
    const gapX = (mobile ? 12 : 16) * scale;
    const maxRowW = Math.max(1, bounds.width - (mobile ? 24 : 42) * scale);
    const slotW = Math.floor((maxRowW - (columns - 1) * gapX) / columns);
    const slotH = (mobile ? 116 : 130) * scale;
    const gapY = mobile ? 12 * scale : 0;
    const slotY = (mobile ? 103 : isWideLayout() ? 112 : 106) * scale;
    const slotBoxes = [];
    weapons.forEach((weapon, i) => {
      const enter = clamp((t - i * 0.05) / 0.3, 0, 1);
      const row = Math.floor(i / columns);
      const col = i % columns;
      const rowCount = mobile ? Math.min(columns, weapons.length - row * columns) : weapons.length;
      const rowW = rowCount * slotW + (rowCount - 1) * gapX;
      const startX = cx0 - rowW / 2;
      const x = startX + col * (slotW + gapX);
      const selected = i === index;
      const shake = selected && weapon.locked && deniedT > 0 ? Math.sin(t * 60) * 3 * scale : 0;
      const stanceY = selected ? (mobile ? -4 : -10) : (mobile ? 0 : 6);
      const y = slotY + row * (slotH + gapY) + (1 - easeOutCubic(enter)) * 24 * scale + stanceY * scale;
      const displayRotation = weapon.id === "chokento" || weapon.id === "katana" ? -Math.PI * 3 / 4 : 0;
      ctx.save();
      ctx.globalAlpha = enter;
      drawUiFrame("weaponFrame", x + shake, y, slotW, slotH, {
        alpha: selected ? 1 : weapon.locked ? 0.36 : 0.58,
      });
      const cx = x + shake + slotW / 2;
      const weaponSize = selected ? (mobile ? 72 : 84) * scale : (mobile ? 60 : 68) * scale;
      const weaponY = y + (mobile ? 39 : 43) * scale;
      weaponIcon(
        weapon.id,
        cx,
        weaponY,
        weaponSize,
        { rotation: displayRotation },
      );
      const weaponNameSize = (selected
        ? (mobile ? 16.5 : 19)
        : (mobile ? 14.5 : 17)) * scale;
      const weaponNameY = y + (mobile ? 96 : 108) * scale;
      text(weapon.name, cx, weaponNameY, {
        size: weaponNameSize,
        color: selected ? GOLD : weapon.locked ? MUTED : TEXT,
        align: "center",
        weight: 900,
        stroke: true,
      });
      if (weapon.locked) {
        drawUiIcon("lock", x + shake + slotW - 18 * scale, y + 19 * scale, 26 * scale, { alpha: selected ? 0.94 : 0.7 });
      }
      ctx.restore();
      region(x, y, slotW, slotH, `weapon:${i}`);
      slotBoxes.push({
        x, y, w: slotW, h: slotH, selected, locked: Boolean(weapon.locked), displayRotation,
        content: {
          weapon: { x: cx - weaponSize / 2, y: weaponY - weaponSize / 2, w: weaponSize, h: weaponSize },
          name: { x: x + 18 * scale, y: weaponNameY - weaponNameSize, w: slotW - 36 * scale, h: weaponNameSize * 1.2 },
          lock: weapon.locked ? { x: x + slotW - 34 * scale, y: y + 6 * scale, w: 29 * scale, h: 29 * scale } : null,
        },
      });
    });

    const sel = weapons[index];
    const gridRows = Math.ceil(weapons.length / columns);
    const infoW = Math.min((mobile ? 440 : 670) * scale, bounds.width - 30 * scale);
    const infoX = cx0 - infoW / 2;
    const infoY = mobile
      ? slotY + gridRows * slotH + (gridRows - 1) * gapY + 16 * scale
      : slotY + slotH + 34 * scale;
    const infoTitleY = infoY + 17 * scale;
    const infoTitle = sel.locked ? `${sel.name} · 잠김` : sel.name;
    const infoTitleMaxW = mobile ? infoW - 8 * scale : Math.max(120 * scale, infoW - 360 * scale);
    const infoTitleSize = fitTextSize(infoTitle, (mobile ? 18 : 22) * scale, infoTitleMaxW, { font: SERIF, weight: 900 });
    text(infoTitle, infoX + 4 * scale, infoTitleY, {
      size: infoTitleSize, color: sel.locked ? "#ffb0b3" : GOLD, font: SERIF, weight: 900, stroke: true,
    });
    const stats = [
      ["power", "공격력", String(Math.round(sel.damage))],
      ["range", "사거리", String(Math.round(sel.range || 0))],
      ["speed", "공격 속도", attackSpeedLabel(sel)],
    ];
    const role = sel.role || WEAPON_ROLE[sel.id] || "";
    text(role, infoX + 4 * scale, infoY + 37 * scale, { size: (mobile ? 11 : 12) * scale, color: "#fff2d0", weight: 750, stroke: true });
    const statsTop = infoY + (mobile ? 61 : 5) * scale;
    const statsStartX = mobile ? infoX : infoX + infoW - 330 * scale;
    const statW = (mobile ? infoW : 330 * scale) / 3;
    stats.forEach(([icon, label, value], i) => {
      const x = statsStartX + statW * i + statW / 2;
      drawUiIcon(icon, x - 22 * scale, statsTop + 10 * scale, 27 * scale, { alpha: 0.9 });
      text(label, x - 4 * scale, statsTop + 4 * scale, { size: (mobile ? 8.5 : 10.5) * scale, color: MUTED, weight: 800, align: "left" });
      text(value, x - 4 * scale, statsTop + 21 * scale, { size: (mobile ? 12 : 14.5) * scale, color: "#fff2d0", weight: 900, align: "left" });
    });
    const dividerY = infoY + (mobile ? 95 : 51) * scale;
    drawUiFrame("stageOrnament", cx0 - infoW * 0.26, dividerY - 11 * scale, infoW * 0.52, 28 * scale, { alpha: 0.55 });
    if (sel.locked) {
      const unlockLabel = sel.unlock?.label || "도전을 계속하면 해금";
      const unlockSize = fitTextSize(unlockLabel, (mobile ? 12.5 : 15) * scale, infoW - 8 * scale, { weight: 800 });
      text(unlockLabel, infoX + 4 * scale, dividerY + 31 * scale, {
        size: unlockSize, color: "#ffe2a3", weight: 800,
      });
      if (sel.unlockProgress) {
        const progress = sel.unlockProgress;
        const value = Math.min(progress.value || 0, progress.target || sel.unlock?.threshold || 0);
        const target = progress.target || sel.unlock?.threshold || 0;
        text(`현재 ${value.toLocaleString()} / ${target.toLocaleString()}`, infoX + 4 * scale, dividerY + 56 * scale, { size: 12 * scale, color: "#bce6ff", weight: 800 });
        bar(infoX + 4 * scale, dividerY + 67 * scale, infoW - 8 * scale, 4 * scale, target > 0 ? value / target : 0, "#548bc5", "#c3eaff");
      }
    } else if (sel.trait) {
      const traitSize = fitTextSize(sel.trait, (mobile ? 12.5 : 15) * scale, infoW - 8 * scale, { weight: 700 });
      text(sel.trait, infoX + 4 * scale, dividerY + 26 * scale, { size: traitSize, color: TEXT, weight: 700 });
    }
    if (!sel.locked && sel.skill) {
      drawUiIcon("skill", infoX + 15 * scale, dividerY + 51 * scale, 28 * scale, { alpha: 0.9 });
      const skillLabel = `기술 「${sel.skill}」`;
      const skillLabelSize = fitTextSize(skillLabel, (mobile ? 12.5 : 15) * scale, infoW - 42 * scale, { weight: 900 });
      const skillDesc = sel.skillDesc || "";
      const skillDescSize = fitTextSize(skillDesc, (mobile ? 11.5 : 13.5) * scale, infoW - 42 * scale, { weight: 650 });
      text(skillLabel, infoX + 36 * scale, dividerY + 49 * scale, { size: skillLabelSize, color: "#bfe8ff", weight: 900 });
      text(skillDesc, infoX + 36 * scale, dividerY + 68 * scale, { size: skillDescSize, color: MUTED, weight: 650 });
      if (sel.bossSkillDesc) {
        text(sel.bossSkillDesc, infoX + 36 * scale, dividerY + 86 * scale, {
          size: fitTextSize(sel.bossSkillDesc, 10.5 * scale, infoW - 42 * scale), color: "#d4b786", weight: 650,
        });
      }
    }

    const infoH = (mobile ? 187 : 144) * scale;
    const confirmW = Math.min(bounds.width - 54 * scale, (mobile ? 268 : 340) * scale);
    const confirmH = (mobile ? 64 : 68) * scale;
    const confirmY = Math.min(infoY + infoH + 28 * scale, H - 22 * scale - confirmH);
    const confirmBox = primaryActionButton(
      cx0,
      confirmY + confirmH / 2,
      confirmW,
      confirmH,
      assetsFailed ? "다시 시도" : preparationSummary ? "이 무기로 준비" : "선    택",
      "weapon:confirm",
      {
        selected: assetsFailed || (!sel.locked && !assetsLoading),
        scale,
        fontSize: mobile ? 18 : 21,
      },
    );

    metrics.weaponSelect = {
      assetsLoading,
      assetsFailed,
      role,
      unlockProgress: sel.unlockProgress || null,
      title: { x: cx0 - titleOrnamentW / 2, y: titleY * scale - 28 * scale, w: titleOrnamentW, h: 62 * scale },
      slots: slotBoxes,
      info: {
        x: infoX, y: infoY, w: infoW, h: infoH,
        content: {
          title: { x: infoX + 4 * scale, y: infoTitleY - infoTitleSize, w: infoTitleMaxW, h: infoTitleSize * 1.2 },
          stats: { x: statsStartX, y: statsTop - 8 * scale, w: mobile ? infoW : 330 * scale, h: 38 * scale },
          detail: { x: infoX + 4 * scale, y: dividerY + 12 * scale, w: infoW - 8 * scale, h: sel.locked ? 30 * scale : sel.bossSkillDesc ? 82 * scale : 64 * scale },
        },
      },
      confirm: confirmBox,
      preparation: preparationSummary ? { ...preparationSummary, access: preparationAccess } : null,
      landscape: false,
    };
  }

  // === forge ===
  function forgeCardIcon(id, x, y, scale = 1) {
    const atlas = forgeAtlas;
    const image = sprites.forge_atlas;
    const pos = atlas?.icons?.[id];
    if (!image || !atlas || !pos) return;
    const cell = atlas.cell || 256;
    const plate = atlas.plate || {};
    const content = atlas.content || {};
    const display = atlas.display || {};
    const sourceSize = content.size || plate.size || 200;
    const sourceOffset = plate.offset || 28;
    const contentOffset = content.offset || 0;
    const drawSize = (display.size || 40) * scale;
    const radius = ((plate.radius || 24) / (plate.size || 200)) * drawSize;
    const sx = pos[0] * cell + sourceOffset + contentOffset;
    const sy = pos[1] * cell + sourceOffset + contentOffset;
    ctx.save();
    rr(x - drawSize / 2, y - drawSize / 2, drawSize, drawSize, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
    ctx.restore();
  }

  function forgeRankGemSprite(rankKey) {
    if (forgeGemCache.has(rankKey)) return forgeGemCache.get(rankKey);
    const image = sprites.ui_frame_atlas_v1;
    const record = uiAtlas?.frame?.frames?.forgeFrame;
    const grid = uiAtlas?.frame?.sliceGrid?.forgeFrame;
    const style = RANK_STYLE[rankKey] || RANK_STYLE.common;
    const centerColumn = grid ? Math.floor((grid.x.length - 1) / 2) : -1;
    if (!image || !record?.rect || !grid || centerColumn < 0) return null;

    const sourceX = grid.x[centerColumn];
    const sourceY = grid.y[0];
    const sourceW = grid.x[centerColumn + 1] - sourceX;
    const sourceH = grid.y[1] - sourceY;
    const canvas = document.createElement("canvas");
    canvas.width = sourceW;
    canvas.height = sourceH;
    const gemCtx = canvas.getContext("2d", { willReadFrequently: true });
    if (!gemCtx) return null;
    gemCtx.drawImage(
      image,
      record.rect[0] + sourceX,
      record.rect[1] + sourceY,
      sourceW,
      sourceH,
      0,
      0,
      sourceW,
      sourceH,
    );

    try {
      const pixels = gemCtx.getImageData(0, 0, sourceW, sourceH);
      const data = pixels.data;
      let minX = sourceW;
      let minY = sourceH;
      let maxX = -1;
      let maxY = -1;
      for (let py = 0; py < sourceH; py += 1) {
        for (let px = 0; px < sourceW; px += 1) {
          const index = (py * sourceW + px) * 4;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];
          const diamond = Math.abs((px + 0.5 - sourceW * 0.5) / (sourceW * 0.21))
            + Math.abs((py + 0.5 - sourceH * 0.36) / (sourceH * 0.26));
          const gemstonePixel = alpha > 8
            && diamond <= 1
            && blue > red + 10
            && green > red + 4
            && blue + green > 105;
          if (!gemstonePixel) {
            data[index + 3] = 0;
            continue;
          }
          const value = Math.max(red, green, blue) / 255;
          const highlight = clamp((value - 0.7) / 0.3, 0, 1);
          const shade = 0.34 + value * 0.76;
          for (let channel = 0; channel < 3; channel += 1) {
            const base = style.gemRgb[channel] * shade;
            data[index + channel] = Math.round(clamp(base * (1 - highlight) + 255 * highlight, 0, 255));
          }
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      }
      gemCtx.clearRect(0, 0, sourceW, sourceH);
      gemCtx.putImageData(pixels, 0, 0);
      const result = {
        canvas,
        bbox: maxX >= 0
          ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
          : { x: sourceW * 0.25, y: sourceH * 0.08, w: sourceW * 0.5, h: sourceH * 0.58 },
      };
      forgeGemCache.set(rankKey, result);
      return result;
    } catch {
      forgeGemCache.set(rankKey, null);
      return null;
    }
  }

  function forgeRarityGlowSprite(w, h, rank, selected, scale) {
    if (!rank.neonColor || !selected) return;
    const key = `${rank.neonColor}:${selected ? 1 : 0}:${Math.round(w * 10)}:${Math.round(h * 10)}`;
    if (forgeGlowCache.has(key)) return forgeGlowCache.get(key);
    const radius = Math.min(18 * scale, w * 0.08, h * 0.12);
    const glowRadiusX = w * 0.62;
    const glowRadiusY = h * 0.62;
    const padX = Math.ceil(glowRadiusX - w / 2 + 8 * scale);
    const padY = Math.ceil(glowRadiusY - h / 2 + 8 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w + padX * 2);
    canvas.height = Math.ceil(h + padY * 2);
    canvas.__zanRarityGlowColor = rank.neonColor;
    canvas.__zanRarityGlowMode = "point-source";
    canvas.__zanRarityGlowRayCount = FORGE_RAY_COUNT;
    canvas.__zanRarityGlowPrimaryRayCount = FORGE_PRIMARY_RAY_COUNT;
    canvas.__zanRarityGlowPrimaryRayWidth = FORGE_PRIMARY_RAY_WIDTH;
    canvas.__zanRarityGlowHasRim = true;
    canvas.__zanRarityGlowRotates = true;
    const glowCtx = canvas.getContext("2d");
    if (!glowCtx) return null;
    const roundedPath = (left, top, width, height, cornerRadius) => {
      glowCtx.beginPath();
      glowCtx.moveTo(left + cornerRadius, top);
      glowCtx.arcTo(left + width, top, left + width, top + height, cornerRadius);
      glowCtx.arcTo(left + width, top + height, left, top + height, cornerRadius);
      glowCtx.arcTo(left, top + height, left, top, cornerRadius);
      glowCtx.arcTo(left, top, left + width, top, cornerRadius);
      glowCtx.closePath();
    };
    const roundedFill = (left, top, width, height, cornerRadius) => {
      roundedPath(left, top, width, height, cornerRadius);
      glowCtx.fill();
    };
    const sourceX = padX + w * 0.5;
    const sourceY = padY + h * 0.5;
    const [red, green, blue] = rank.gemRgb;
    const coreRed = Math.round(red + (255 - red) * 0.72);
    const coreGreen = Math.round(green + (255 - green) * 0.72);
    const coreBlue = Math.round(blue + (255 - blue) * 0.72);
    glowCtx.save();
    glowCtx.translate(sourceX, sourceY);
    glowCtx.scale(1, glowRadiusY / glowRadiusX);
    const bloom = glowCtx.createRadialGradient(0, 0, 0, 0, 0, glowRadiusX);
    bloom.addColorStop(0, `rgba(${red},${green},${blue},1)`);
    bloom.addColorStop(0.18, `rgba(${red},${green},${blue},0.94)`);
    bloom.addColorStop(0.42, `rgba(${red},${green},${blue},0.72)`);
    bloom.addColorStop(0.66, `rgba(${red},${green},${blue},0.46)`);
    bloom.addColorStop(0.84, `rgba(${red},${green},${blue},0.22)`);
    bloom.addColorStop(1, `rgba(${red},${green},${blue},0)`);
    glowCtx.fillStyle = bloom;
    glowCtx.fillRect(-glowRadiusX, -glowRadiusX, glowRadiusX * 2, glowRadiusX * 2);
    glowCtx.restore();

    const wideCard = w / h > 1.25;
    const rimInsetX = 2.5 * scale;
    const rimInsetY = (wideCard ? 2.5 : 8.5) * scale;
    const rimRadius = Math.max(3 * scale, radius - Math.min(rimInsetX, rimInsetY));
    glowCtx.save();
    glowCtx.globalCompositeOperation = "lighter";
    glowCtx.strokeStyle = `rgba(${red},${green},${blue},0.72)`;
    glowCtx.lineWidth = 4.4 * scale;
    glowCtx.shadowColor = `rgba(${red},${green},${blue},0.98)`;
    glowCtx.shadowBlur = 16 * scale;
    roundedPath(
      padX + rimInsetX,
      padY + rimInsetY,
      w - rimInsetX * 2,
      h - rimInsetY * 2,
      rimRadius,
    );
    glowCtx.stroke();
    glowCtx.shadowBlur = 5 * scale;
    glowCtx.strokeStyle = `rgba(${coreRed},${coreGreen},${coreBlue},0.86)`;
    glowCtx.lineWidth = Math.max(1, 1.2 * scale);
    glowCtx.stroke();
    glowCtx.restore();

    glowCtx.globalCompositeOperation = "destination-out";
    glowCtx.globalAlpha = 1;
    glowCtx.fillStyle = "#000";
    const eraseInsetX = 5 * scale;
    const eraseInsetY = (wideCard ? 5 : 12) * scale;
    roundedFill(
      padX + eraseInsetX,
      padY + eraseInsetY,
      w - eraseInsetX * 2,
      h - eraseInsetY * 2,
      Math.max(2 * scale, radius - Math.min(eraseInsetX, eraseInsetY)),
    );
    const result = { canvas, padX, padY };
    forgeGlowCache.set(key, result);
    return result;
  }

  function drawForgeRotatingRays(x, y, w, h, rank, t, selected, scale) {
    if (!rank.neonColor || !selected) return;
    const rotation = t * FORGE_RAY_ROTATION_SPEED;
    const sourceX = x + w * 0.5;
    const sourceY = y + h * 0.5;
    const wideCard = w / h > 1.25;
    const rayStep = Math.PI * 2 / FORGE_RAY_COUNT;
    const [red, green, blue] = rank.gemRgb;
    const coreRed = Math.round(red + (255 - red) * 0.72);
    const coreGreen = Math.round(green + (255 - green) * 0.72);
    const coreBlue = Math.round(blue + (255 - blue) * 0.72);
    const rayNoise = (index, salt) => {
      const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const groups = [
      { matches: (index) => index % 8 === 0, length: 30, width: FORGE_PRIMARY_RAY_WIDTH, alpha: 0.9, core: true },
      { matches: (index) => index % 16 === 4, length: 23, width: 1.65, alpha: 0.62, core: true },
      { matches: (index) => index % 8 !== 0 && index % 16 !== 4, length: 15, width: 0.64, alpha: 0.34, core: false },
    ];
    const rayInsetX = 0;
    const rayInsetY = wideCard ? 0 : 8.5 * scale;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.shadowColor = `rgba(${red},${green},${blue},0.86)`;
    for (const group of groups) {
      ctx.beginPath();
      for (let index = 0; index < FORGE_RAY_COUNT; index += 1) {
        if (!group.matches(index)) continue;
        const angle = -Math.PI + index * rayStep + (rayNoise(index, 1) - 0.5) * rayStep * 0.54 + rotation;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        const edgeDistance = Math.min(
          (w * 0.5 - rayInsetX) / Math.max(0.001, Math.abs(dx)),
          (h * 0.5 - rayInsetY) / Math.max(0.001, Math.abs(dy)),
        );
        const primaryDirection = wideCard ? horizontal : !horizontal;
        const directionLength = primaryDirection ? 1 : 0.68;
        const rayLength = group.length * scale * directionLength * (0.72 + rayNoise(index, 2) * 0.42);
        const baseWidth = group.width * scale * (0.76 + rayNoise(index, 3) * 0.42);
        const startDistance = edgeDistance - 3 * scale;
        const endDistance = edgeDistance + rayLength;
        const startX = sourceX + dx * startDistance;
        const startY = sourceY + dy * startDistance;
        const endX = sourceX + dx * endDistance;
        const endY = sourceY + dy * endDistance;
        const tangentX = -dy * baseWidth;
        const tangentY = dx * baseWidth;
        ctx.moveTo(startX + tangentX, startY + tangentY);
        ctx.lineTo(startX - tangentX, startY - tangentY);
        ctx.lineTo(endX, endY);
        ctx.closePath();
      }
      ctx.globalAlpha = group.alpha;
      ctx.shadowBlur = (group.core ? 5.5 : 3.5) * scale;
      ctx.fillStyle = group.core
        ? `rgb(${coreRed},${coreGreen},${coreBlue})`
        : `rgb(${red},${green},${blue})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawForgeRarityGlow(x, y, w, h, rank, t, selected, scale) {
    const sprite = forgeRarityGlowSprite(w, h, rank, selected, scale);
    if (!sprite) return;
    const pulse = 0.96 + Math.sin(t * 2.5) * 0.04;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = pulse;
    ctx.drawImage(sprite.canvas, x - sprite.padX, y - sprite.padY);
    ctx.restore();
    drawForgeRotatingRays(x, y, w, h, rank, t, selected, scale);
  }

  function drawForgeRankGem(rankKey, x, y, w, h, alpha, selected) {
    const record = uiAtlas?.frame?.frames?.forgeFrame;
    const grid = uiAtlas?.frame?.sliceGrid?.forgeFrame;
    const style = RANK_STYLE[rankKey] || RANK_STYLE.common;
    if (!record?.rect || !grid) return { x: x + w / 2 - 1, y, w: 2, h: 2 };
    const frameScale = Math.min(w / record.rect[2], h / record.rect[3]);
    const columns = sliceAxis(record.rect[2], grid.x, grid.xStretch, w, frameScale);
    const rows = sliceAxis(record.rect[3], grid.y, grid.yStretch, h, frameScale);
    const centerColumn = Math.floor(columns.length / 2);
    const column = columns[centerColumn];
    const row = rows[0];
    const sprite = forgeRankGemSprite(rankKey);
    if (!sprite) return {
      x: x + w / 2 - 15 * frameScale,
      y: y + 6 * frameScale,
      w: 30 * frameScale,
      h: 42 * frameScale,
    };

    const drawX = x + column.target;
    const drawY = y + row.target;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.shadowColor = style.neonColor || "rgba(0,0,0,0)";
    ctx.shadowBlur = style.neonColor && selected ? 10 * frameScale : 0;
    ctx.drawImage(sprite.canvas, drawX, drawY, column.targetLength, row.targetLength);
    ctx.shadowBlur = 0;
    ctx.drawImage(sprite.canvas, drawX, drawY, column.targetLength, row.targetLength);
    ctx.restore();
    return {
      x: drawX + sprite.bbox.x / sprite.canvas.width * column.targetLength,
      y: drawY + sprite.bbox.y / sprite.canvas.height * row.targetLength,
      w: sprite.bbox.w / sprite.canvas.width * column.targetLength,
      h: sprite.bbox.h / sprite.canvas.height * row.targetLength,
    };
  }

  function drawForgeLandscape({
    cards,
    selected,
    freeRerolls,
    purchasedRerolls,
    stackOf,
    deniedT,
    enterT,
    t,
    stage,
    rewardNote,
    previewOf,
    canReroll,
    reducedMotion,
    deniedReason = "",
  }) {
    const bounds = shortLandscapeBounds(760);
    const cx = bounds.cx;
    const scale = baseUiScale();
    const totalRerolls = freeRerolls + purchasedRerolls;
    const rerollDisabled = canReroll === null ? totalRerolls <= 0 : !canReroll;
    const denied = deniedT > 0;
    const deniedLabel = String(deniedReason || "리롤권 없음").trim() || "리롤권 없음";
    const stageText = `스테이지 ${stage + 1} 클리어`;
    text(stageText, cx, 18 * scale, { size: 10.5 * scale, color: "#b9c9e1", align: "center", spacing: 1.8 * scale, weight: 800, stroke: true });
    text("단조", cx, 46 * scale, { size: 27 * scale, color: "#fff4d8", font: SERIF, weight: 900, align: "center", spacing: 6 * scale, stroke: true });
    const rewardText = rewardNote || "하나를 골라 무기에 새긴다";
    text(rewardText, cx, 64 * scale, { size: fitTextSize(rewardText, 10.5 * scale, 290 * scale), color: rewardNote ? GOLD : MUTED, align: "center", weight: rewardNote ? 800 : 650 });

    const quit = outlinedActionButton(bounds.left + 59 * scale, 38 * scale, 118 * scale, 46 * scale, "모험 종료", "pause:quit", {
      danger: true, scale, fontSize: 11.5,
    });

    const rerollW = 166 * scale;
    const rerollH = 48 * scale;
    const rerollX = bounds.right - rerollW + (denied ? Math.sin(t * 55) * 3 * scale : 0);
    const rerollY = 14 * scale;
    panel(rerollX, rerollY, rerollW, rerollH, { alpha: rerollDisabled ? 0.36 : 0.7, border: rerollDisabled ? "rgba(150,140,190,0.2)" : "rgba(143,227,255,0.48)", radius: 8 * scale });
    if (!denied) drawUiIcon("reroll", rerollX + 24 * scale, rerollY + rerollH / 2, 30 * scale, { alpha: rerollDisabled ? 0.42 : 0.96 });
    const rerollLabelX = denied ? rerollX + rerollW / 2 : rerollX + 47 * scale;
    const rerollLabelMaxW = denied ? rerollW - 16 * scale : rerollW - 55 * scale;
    text(denied ? deniedLabel : "리롤권 사용", rerollLabelX, rerollY + 17 * scale, {
      size: fitTextSize(denied ? deniedLabel : "리롤권 사용", 10.5 * scale, rerollLabelMaxW),
      color: denied ? "#ffaaaa" : rerollDisabled ? "#8f8998" : "#fff2d2", weight: 900,
      align: denied ? "center" : "left",
    });
    const rerollText = `무료 ${freeRerolls} · 구매 ${purchasedRerolls}`;
    text(rerollText, rerollX + 47 * scale, rerollY + 36 * scale, {
      size: fitTextSize(rerollText, 11.5 * scale, rerollW - 55 * scale), color: rerollDisabled ? "#6f7284" : "#8fdcff", weight: 900,
    });
    region(rerollX, rerollY, rerollW, rerollH, "forge:reroll");

    const gap = 12 * scale;
    const cardW = (bounds.width - gap * 2) / 3;
    const cardH = 205 * scale;
    const startY = 76 * scale;
    const cardBoxes = [];
    cards.forEach((card, i) => {
      const enter = clamp((enterT - i * 0.07) / 0.32, 0, 1);
      const rank = RANK_STYLE[card.rank] || RANK_STYLE.common;
      const selectedCard = i === selected;
      const x = bounds.left + i * (cardW + gap);
      const y = startY + (1 - easeOutBack(enter)) * 20 * scale;
      ctx.save();
      ctx.globalAlpha = enter;
      drawForgeRarityGlow(x, y, cardW, cardH, rank, reducedMotion ? 0 : t + i * 0.4, selectedCard, scale);
      drawUiFrame("forgeFrame", x, y, cardW, cardH, { alpha: selectedCard ? 1 : 0.68 });
      const gemBox = drawForgeRankGem(card.rank, x, y, cardW, cardH, selectedCard ? 1 : 0.84, selectedCard);
      const iconSize = Math.max(46 * scale, Math.min(72 * scale, cardW - 118 * scale));
      const iconX = x + 54 * scale;
      const iconY = y + 77 * scale;
      forgeCardIcon(card.id, iconX, iconY, iconSize / 80);
      const textX = x + 103 * scale;
      const textW = Math.max(70 * scale, cardW - 118 * scale);
      const nameSize = fitTextSize(card.name, 17 * scale, textW, { font: SERIF, weight: 900 });
      text(card.name, textX, y + 48 * scale, { size: nameSize, color: rank.color, font: SERIF, weight: 900, stroke: true });
      const scopeLabel = card.weapon ? `${WEAPON_LABEL[card.weapon] || card.weapon} 전용` : "모든 무기";
      text(scopeLabel, textX, y + 70 * scale, { size: 9.5 * scale, color: "#b8c8df", weight: 800 });
      const descY = y + 95 * scale;
      const descLastY = wrapText(card.desc, textX, descY, textW, 10.5 * scale, TEXT, 3 * scale, "left", 650);
      const preview = previewOf?.(card.id);
      const previewText = typeof preview === "string" ? preview : preview ? `${preview.label}  ${preview.before} → ${preview.after}` : "";
      let previewBox = null;
      if (previewText) {
        const previewSize = fitTextSize(previewText, 10.5 * scale, cardW - 30 * scale);
        const previewY = y + cardH - 23 * scale;
        text(previewText, x + cardW / 2, previewY, { size: previewSize, color: "#bcebb6", weight: 850, align: "center", stroke: true });
        previewBox = { x: x + 15 * scale, y: previewY - previewSize, w: cardW - 30 * scale, h: previewSize * 1.2 };
      }
      const stack = stackOf?.(card.id) || 0;
      if (!card.unique && stack > 0) text(`×${stack}`, x + cardW - 17 * scale, y + 36 * scale, { size: 10 * scale, color: "#c3d1e4", weight: 800, align: "right", stroke: true });
      ctx.restore();
      region(x, y, cardW, cardH, `forge:${i}`);
      cardBoxes.push({
        x, y, w: cardW, h: cardH, selected: selectedCard, rank: card.rank, preview: previewText,
        rarityVisual: {
          gemColor: rank.gemColor, neonColor: rank.neonColor, glowEligible: Boolean(rank.neonColor),
          glowVisible: selectedCard && Boolean(rank.neonColor), glowMode: selectedCard && rank.neonColor ? "point-source" : "none",
          glowOrigin: rank.neonColor ? { x: 0.5, y: 0.5 } : null,
          glowRays: selectedCard && rank.neonColor ? FORGE_RAY_COUNT : 0,
          glowPrimaryRays: selectedCard && rank.neonColor ? FORGE_PRIMARY_RAY_COUNT : 0,
          glowPrimaryRayWidth: selectedCard && rank.neonColor ? FORGE_PRIMARY_RAY_WIDTH : 0,
          glowRim: Boolean(selectedCard && rank.neonColor), glowRotates: Boolean(selectedCard && rank.neonColor && !reducedMotion),
          glowRotation: selectedCard && rank.neonColor ? (t * FORGE_RAY_ROTATION_SPEED) % (Math.PI * 2) : null,
          glowRotationSpeed: selectedCard && rank.neonColor ? FORGE_RAY_ROTATION_SPEED : 0,
          glowAttachmentInset: selectedCard && rank.neonColor ? { x: 2.5 * scale, y: 2.5 * scale } : null,
          labelVisible: false,
        },
        content: {
          icon: { x: iconX - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          title: { x: textX, y: y + 48 * scale - nameSize, w: textW, h: nameSize * 1.2 },
          gem: gemBox,
          scope: { x: textX, y: y + 57 * scale, w: textW, h: 18 * scale },
          description: { x: textX, y: descY - 10.5 * scale, w: textW, h: descLastY - descY + 13 * scale },
          preview: previewBox,
        },
      });
    });
    const confirm = outlinedActionButton(cx, 337 * scale, 390 * scale, 48 * scale, "선    택", "forge:confirm", { selected: true, scale, fontSize: 17 });
    const headerW = 280 * scale;
    metrics.forge = {
      rewardText,
      header: { x: cx - headerW / 2, y: 3 * scale, w: headerW, h: 64 * scale },
      headerContent: {},
      cards: cardBoxes,
      confirm,
      quit,
      reroll: {
        x: rerollX, y: rerollY, w: rerollW, h: rerollH, count: totalRerolls,
        free: freeRerolls, purchased: purchasedRerolls, disabled: rerollDisabled,
        currency: "ticket", deniedReason: denied ? deniedLabel : null,
      },
      landscape: true,
    };
  }

  function drawForge({
    cards,
    selected,
    rerolls = 0,
    freeRerolls = null,
    purchasedRerolls = null,
    carriedRerolls = null,
    stackOf,
    deniedT,
    enterT,
    t,
    stage,
    rewardNote,
    previewOf = null,
    canReroll = null,
    reducedMotion = false,
    deniedReason = "",
  }) {
    const freeCount = Math.max(0, Math.round(Number(freeRerolls === null ? rerolls : freeRerolls) || 0));
    const purchasedCount = Math.max(0, Math.round(Number(purchasedRerolls === null ? (carriedRerolls === null ? 0 : carriedRerolls) : purchasedRerolls) || 0));
    if (isShortLandscape()) {
      drawForgeLandscape({
        cards, selected, freeRerolls: freeCount, purchasedRerolls: purchasedCount, stackOf, deniedT, enterT, t,
        stage, rewardNote, previewOf, canReroll, reducedMotion, deniedReason,
      });
      return;
    }
    const bounds = safeBounds();
    const cx = bounds.cx;
    const mobile = isMobileLayout();
    // Fit the complete stack and its action together, including a bottom margin.
    // Clamping only the action position lets it slide over the final card.
    const mobileHeight = 144 + cards.length * 158 + Math.max(0, cards.length - 1) * 14 + 28 + 64 + 32;
    const scale = mobile ? Math.min(sceneUiScale(), H / mobileHeight) : sceneUiScale();
    const headerW = Math.min(bounds.width * (mobile ? 0.48 : 0.54), 278 * scale);
    const headerStageY = 24 * scale;
    const headerStageSize = (mobile ? 11 : 13) * scale;
    const headerTitleY = (mobile ? 62 : 68) * scale;
    const headerTitleSize = (mobile ? 30 : 34) * scale;
    const headerOrnament = snapCssRect(cx - headerW / 2, (mobile ? 78 : 86) * scale, headerW, 22 * scale);
    drawUiFrame("stageOrnament", headerOrnament.x, headerOrnament.y, headerOrnament.w, headerOrnament.h, { alpha: 0.92 });
    const stageText = `스테이지 ${stage + 1} 클리어`;
    text(stageText, cx, headerStageY, { size: headerStageSize, color: "#b9c9e1", align: "center", spacing: 2.4 * scale, weight: 800, stroke: true });
    text("단조", cx, headerTitleY, { size: headerTitleSize, color: "#fff4d8", font: SERIF, weight: 900, align: "center", spacing: 8 * scale, stroke: true });
    const rewardText = rewardNote || "하나를 골라 무기에 새긴다";
    const rewardSize = fitTextSize(rewardText, (mobile ? 11.5 : 13.5) * scale, Math.min(bounds.width - 48 * scale, 330 * scale), { weight: rewardNote ? 800 : 650 });
    const headerRewardY = (mobile ? 120 : 132) * scale;
    text(rewardText, cx, headerRewardY, {
      size: rewardSize, color: rewardNote ? GOLD : MUTED, align: "center", weight: rewardNote ? 800 : 650,
    });

    const quitW = (mobile ? 68 : 98) * scale;
    const quitH = 44 * scale;
    const quit = outlinedActionButton(bounds.left + 8 * scale + quitW / 2, 14 * scale + quitH / 2, quitW, quitH, mobile ? "종료" : "모험 종료", "pause:quit", {
      danger: true, scale, fontSize: mobile ? 10.5 : 11.5,
    });

    const denied = deniedT > 0;
    const deniedLabel = String(deniedReason || "리롤권 없음").trim() || "리롤권 없음";
    const totalRerolls = freeCount + purchasedCount;
    const rerollDisabled = canReroll === null ? totalRerolls <= 0 : !canReroll;
    const rerollW = (mobile ? 84 : 112) * scale;
    const rerollH = 52 * scale;
    const rerollX = bounds.right - rerollW - 8 * scale + (denied ? Math.sin(t * 55) * 3 * scale : 0);
    const rerollY = 66 * scale;
    const rerollIconX = rerollX + 16 * scale;
    const rerollTextX = rerollX + 34 * scale;
    const rerollAlpha = rerollDisabled ? 0.42 : 0.96;
    if (!denied) drawUiIcon("reroll", rerollIconX, rerollY + rerollH / 2, 27 * scale, { alpha: rerollAlpha });
    const rerollLabelX = denied ? rerollX + rerollW / 2 : rerollTextX;
    const rerollLabelMaxW = denied ? rerollW - 12 * scale : rerollW - 35 * scale;
    text(denied ? deniedLabel : "리롤권 사용", rerollLabelX, rerollY + 14 * scale, {
      size: fitTextSize(denied ? deniedLabel : "리롤권 사용", (mobile ? 9.5 : 11.5) * scale, rerollLabelMaxW),
      color: denied ? "#ff8a8f" : (rerollDisabled ? "#8f8998" : "#fff2d2"),
      weight: 900,
      baseline: "middle",
      align: denied ? "center" : "left",
    });
    const rerollText = `무료 ${freeCount} · 구매 ${purchasedCount}`;
    text(rerollText, rerollTextX, rerollY + 31 * scale, {
      size: fitTextSize(rerollText, (mobile ? 12 : 14) * scale, rerollW - 35 * scale),
      color: denied ? "#ff8a8f" : (rerollDisabled ? "#6f7284" : "#8fdcff"),
      weight: 900,
      baseline: "middle",
      stroke: !rerollDisabled,
    });
    region(rerollX, rerollY, rerollW, rerollH, "forge:reroll");

    const gap = (mobile ? 14 : 20) * scale;
    const desktopCardTopInset = mobile ? 0 : 38;
    const cardW = mobile
      ? Math.min(508 * scale, bounds.width - 28 * scale)
      : Math.floor((bounds.width - 44 * scale - gap * 2) / 3);
    const cardH = (mobile ? 158 : 394) * scale;
    const rowWidth = cardW * (mobile ? 1 : 3) + gap * (mobile ? 0 : 2);
    const startX = cx - rowWidth / 2;
    const startY = (mobile ? 144 : 176) * scale;
    const cardBoxes = [];
    cards.forEach((card, i) => {
      const enter = clamp((enterT - i * 0.07) / 0.32, 0, 1);
      const rank = RANK_STYLE[card.rank] || RANK_STYLE.common;
      const selectedCard = i === selected;
      const x = startX + (mobile ? 0 : i * (cardW + gap));
      const baseY = startY + (mobile ? i * (cardH + gap) : 0);
      const y = baseY + (1 - easeOutBack(enter)) * 34 * scale;
      ctx.save();
      ctx.globalAlpha = enter;
      drawForgeRarityGlow(x, y, cardW, cardH, rank, reducedMotion ? 0 : t + i * 0.4, selectedCard, scale);
      drawUiFrame("forgeFrame", x, y, cardW, cardH, {
        alpha: selectedCard ? 1 : 0.68,
      });
      const gemBox = drawForgeRankGem(card.rank, x, y, cardW, cardH, selectedCard ? 1 : 0.84, selectedCard);

      const iconX = mobile ? x + 59 * scale : x + cardW / 2;
      const iconY = mobile ? y + 73 * scale : y + (109 + desktopCardTopInset) * scale;
      const textX = mobile ? x + 119 * scale : x + cardW / 2;
      const iconSize = mobile
        ? 86.4 * scale
        : Math.min(113.6 * scale, cardW - 188 * scale);
      const iconScale = iconSize / 80;
      forgeCardIcon(card.id, iconX, iconY, iconScale);
      const nameMaxW = mobile
        ? Math.max(80 * scale, Math.min(cardW - 151 * scale, cardW / 2 - 26 * scale - (textX - x)))
        : cardW - 56 * scale;
      const nameSize = fitTextSize(card.name, (mobile ? 18.5 : 24) * scale, nameMaxW, { font: SERIF, weight: 900 });
      const nameWidth = measureTextWidth(card.name, { size: nameSize, font: SERIF, weight: 900 });
      const nameY = mobile ? y + 58 * scale : y + (202 + desktopCardTopInset) * scale;
      text(card.name, textX, nameY, {
        size: nameSize,
        color: rank.color,
        font: SERIF,
        weight: 900,
        align: mobile ? "left" : "center",
        stroke: true,
      });
      const scopeLabel = card.weapon ? `${WEAPON_LABEL[card.weapon] || card.weapon} 전용` : "모든 무기";
      const scopeY = mobile ? y + 77 * scale : y + (228 + desktopCardTopInset) * scale;
      if (card.weapon) weaponIcon(card.weapon, mobile ? textX + 7 * scale : textX - 42 * scale, scopeY, 16 * scale, rank.color);
      text(scopeLabel, mobile ? textX + (card.weapon ? 19 : 0) * scale : textX + (card.weapon ? 9 : 0) * scale, scopeY, {
        size: (mobile ? 10 : 12.5) * scale, color: "#b8c8df", weight: 800, align: mobile ? "left" : "center", baseline: "middle",
      });
      const dividerY = mobile ? y + 87 * scale : y + (246 + desktopCardTopInset) * scale;
      const dividerX = mobile ? textX : x + 26 * scale;
      const dividerW = mobile ? x + cardW - 22 * scale - textX : cardW - 52 * scale;
      drawUiFrame("stageOrnament", dividerX, dividerY - 7 * scale, Math.max(52 * scale, dividerW), 20 * scale, { alpha: 0.34 });
      const descriptionY = mobile ? y + 105 * scale : y + (270 + desktopCardTopInset) * scale;
      const descriptionSize = (mobile ? 12 : 14.5) * scale;
      const descriptionLastY = wrapText(
        card.desc,
        mobile ? textX : x + cardW / 2,
        descriptionY,
        mobile ? cardW - 141 * scale : cardW - 52 * scale,
        descriptionSize,
        TEXT,
        4 * scale,
        mobile ? "left" : "center",
        650,
      );

      const preview = previewOf?.(card.id);
      const previewText = typeof preview === "string" ? preview : preview ? `${preview.label}  ${preview.before} → ${preview.after}` : "";
      let previewBox = null;
      if (previewText) {
        const previewW = mobile ? cardW - 141 * scale : cardW - 52 * scale;
        const previewSize = fitTextSize(previewText, (mobile ? 11 : 12.5) * scale, previewW);
        const previewY = y + cardH - (mobile ? 19 : 42) * scale;
        text(previewText, mobile ? textX : x + cardW / 2, previewY, {
          size: previewSize, color: "#bcebb6", weight: 850, align: mobile ? "left" : "center", stroke: true,
        });
        previewBox = { x: mobile ? textX : x + 26 * scale, y: previewY - previewSize, w: previewW, h: previewSize * 1.2 };
      }

      const stack = stackOf(card.id);
      if (!card.unique && stack > 0) {
        text(`×${stack}`, mobile ? x + 59 * scale : x + cardW - 22 * scale, mobile ? y + 130 * scale : y + 58 * scale, { size: (mobile ? 10 : 12) * scale, color: "#c3d1e4", weight: 800, align: mobile ? "center" : "right", stroke: true });
      }
      ctx.restore();
      region(x, y, cardW, cardH, `forge:${i}`);
      cardBoxes.push({
        x, y, w: cardW, h: cardH, selected: selectedCard, rank: card.rank, preview: previewText,
        rarityVisual: {
          gemColor: rank.gemColor,
          neonColor: rank.neonColor,
          glowEligible: Boolean(rank.neonColor),
          glowVisible: selectedCard && Boolean(rank.neonColor),
          glowMode: selectedCard && rank.neonColor ? "point-source" : "none",
          glowOrigin: rank.neonColor ? { x: 0.5, y: 0.5 } : null,
          glowRays: selectedCard && rank.neonColor ? FORGE_RAY_COUNT : 0,
          glowPrimaryRays: selectedCard && rank.neonColor ? FORGE_PRIMARY_RAY_COUNT : 0,
          glowPrimaryRayWidth: selectedCard && rank.neonColor ? FORGE_PRIMARY_RAY_WIDTH : 0,
          glowRim: Boolean(selectedCard && rank.neonColor),
          glowRotates: Boolean(selectedCard && rank.neonColor && !reducedMotion),
          glowRotation: selectedCard && rank.neonColor ? (t * FORGE_RAY_ROTATION_SPEED) % (Math.PI * 2) : null,
          glowRotationSpeed: selectedCard && rank.neonColor ? FORGE_RAY_ROTATION_SPEED : 0,
          glowAttachmentInset: selectedCard && rank.neonColor
            ? { x: 2.5 * scale, y: (mobile ? 2.5 : 8.5) * scale }
            : null,
          labelVisible: false,
        },
        content: mobile ? {
          icon: { x: iconX - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          title: { x: textX, y: nameY - nameSize, w: nameWidth, h: nameSize * 1.2 },
          gem: gemBox,
          scope: { x: textX, y: y + 68 * scale, w: cardW - 141 * scale, h: 20 * scale },
          description: { x: textX, y: descriptionY - descriptionSize, w: cardW - 141 * scale, h: descriptionLastY - descriptionY + descriptionSize * 1.2 },
          preview: previewBox,
        } : {
          icon: { x: iconX - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          title: { x: textX - nameWidth / 2, y: nameY - nameSize, w: nameWidth, h: nameSize * 1.2 },
          gem: gemBox,
          scope: { x: x + 28 * scale, y: y + (217 + desktopCardTopInset) * scale, w: cardW - 56 * scale, h: 22 * scale },
          description: { x: x + 26 * scale, y: descriptionY - descriptionSize, w: cardW - 52 * scale, h: descriptionLastY - descriptionY + descriptionSize * 1.2 },
          preview: previewBox,
        },
      });
    });

    const cardBottom = mobile
      ? startY + cards.length * cardH + Math.max(0, cards.length - 1) * gap
      : startY + cardH + 6 * scale;
    const footerY = mobile ? cardBottom + 28 * scale : Math.min(cardBottom + 42 * scale, H - 116 * scale);
    const confirmW = Math.min(bounds.width - 54 * scale, (mobile ? 268 : 340) * scale);
    const confirmH = (mobile ? 64 : 68) * scale;
    const confirmX = cx - confirmW / 2;
    primaryActionButton(cx, footerY + confirmH / 2, confirmW, confirmH, "선    택", "forge:confirm", {
      selected: true,
      scale,
      fontSize: mobile ? 18 : 21,
    });

    const headerStageW = measureTextWidth(stageText, { size: headerStageSize, weight: 800, spacing: 2.4 * scale });
    const headerTitleW = measureTextWidth("단조", { size: headerTitleSize, font: SERIF, weight: 900, spacing: 8 * scale });
    const headerRewardW = measureTextWidth(rewardText, { size: rewardSize, weight: rewardNote ? 800 : 650 });
    metrics.forge = {
      rewardText,
      header: snapCssRect(cx - headerW / 2, 10 * scale, headerW, (mobile ? 116 : 130) * scale),
      headerContent: {
        stage: { x: cx - headerStageW / 2, y: headerStageY - headerStageSize, w: headerStageW, h: headerStageSize * 1.2 },
        title: { x: cx - headerTitleW / 2, y: headerTitleY - headerTitleSize, w: headerTitleW, h: headerTitleSize * 1.2 },
        ornament: headerOrnament,
        reward: { x: cx - headerRewardW / 2, y: headerRewardY - rewardSize, w: headerRewardW, h: rewardSize * 1.2 },
      },
      cards: cardBoxes,
      confirm: { x: confirmX, y: footerY, w: confirmW, h: confirmH },
      quit,
      reroll: {
        x: rerollX, y: rerollY, w: rerollW, h: rerollH, count: totalRerolls,
        free: freeCount, purchased: purchasedCount, currency: "ticket", disabled: rerollDisabled,
        deniedReason: denied ? deniedLabel : null,
      },
      landscape: false,
    };
  }

  function drawQuitConfirm({ shards = 0, enterT = 0, focusedIndex = 0, saveError = "" } = {}) {
    const landscape = isShortLandscape();
    const bounds = landscape ? shortLandscapeBounds(760) : safeBounds();
    const scale = landscape ? baseUiScale() : Math.min(screenUiScale(), H / 640);
    const cx = bounds.cx;
    const count = Math.max(0, Math.round(Number(shards) || 0));
    const focus = Math.max(0, Math.min(1, Math.round(Number(focusedIndex) || 0)));
    const width = Math.min(bounds.width - 28 * scale, (landscape ? 560 : 470) * scale);
    const height = (landscape ? 250 : 286) * scale;
    const top = (H - height) / 2;
    ctx.save();
    ctx.globalAlpha = clamp(0.78 + Math.max(0, Number(enterT) || 0) * 0.25, 0.78, 0.94);
    ctx.fillStyle = "rgba(5,3,12,0.9)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Keep pause/system controls behind the confirmation from receiving taps.
    // The two explicit actions below are registered afterwards and win hitAt().
    region(0, 0, W, H, "quit:block");
    panel(cx - width / 2, top, width, height, { alpha: 0.97, border: "rgba(255,122,122,0.55)", radius: 12 * scale });
    text("모험을 마칠까요?", cx, top + 47 * scale, {
      size: (landscape ? 24 : 27) * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center", spacing: 2 * scale,
    });
    ornament(cx, top + 66 * scale, 105 * scale);
    crystalIcon(cx - 94 * scale, top + 106 * scale, 8 * scale, "#8fe3ff");
    text(`이번 모험 파편 ${count.toLocaleString("ko-KR")}개를 받고 돌아갑니다`, cx, top + 111 * scale, {
      size: fitTextSize(`이번 모험 파편 ${count.toLocaleString("ko-KR")}개를 받고 돌아갑니다`, 14 * scale, width - 48 * scale), color: "#bfeeff", weight: 900, align: "center",
    });
    text(saveError || "종료하면 현재 스테이지와 단조 강화는 끝납니다", cx, top + 145 * scale, {
      size: fitTextSize(saveError || "종료하면 현재 스테이지와 단조 강화는 끝납니다", 11 * scale, width - 46 * scale), color: saveError ? "#ffaaaa" : MUTED, weight: 700, align: "center",
    });
    const gap = 12 * scale;
    const actionW = (width - 48 * scale - gap) / 2;
    const actionY = top + height - 50 * scale;
    const continueBox = outlinedActionButton(cx - (actionW + gap) / 2, actionY, actionW, 48 * scale, "계속하기", "quit:continue", {
      selected: focus === 0, scale, fontSize: 13.5,
    });
    const confirmBox = outlinedActionButton(cx + (actionW + gap) / 2, actionY, actionW, 48 * scale, "종료하고 정산", "quit:confirm", {
      selected: focus === 1, danger: true, scale, fontSize: 13.5,
    });
    metrics.quitConfirm = {
      blocker: { x: 0, y: 0, w: W, h: H, id: "quit:block" },
      panel: { x: cx - width / 2, y: top, w: width, h: height },
      shards: count,
      focusedIndex: focus,
      focusOrder: ["continue", "confirm"],
      continue: continueBox,
      confirm: confirmBox,
      saveError: saveError || null,
      landscape,
    };
  }

  function drawResultsLandscape({
    score,
    bestCombo,
    floors,
    stage,
    weapon,
    weaponId,
    attacks,
    skills,
    unlocked,
    registered,
    enterT,
    saveError,
    profileSaved,
    personalBest,
    personalBestStage,
    deathCause,
    endReason,
    earnedShards,
    bankBefore,
    bankAfter,
    returnedTickets,
    settlementError,
  }) {
    const bounds = shortLandscapeBounds(760);
    const cx = bounds.cx;
    const scale = baseUiScale();
    const quit = ["quit", "manual", "abandoned", "exit"].includes(endReason);
    const verdict = quit ? "모험 종료" : "사망";
    const flavor = quit ? "획득한 파편을 챙겨 돌아왔다"
      : deathCause === "debris" ? "보스의 잔해에 맞아 쓰러졌다" : "몬스터에게 짓눌렸다";
    const hasSettlement = earnedShards !== null || bankAfter !== null || bankBefore !== null || returnedTickets !== null;
    const settlementFailed = Boolean(settlementError) || (hasSettlement && profileSaved === false);
    text("이번 모험", cx, 29 * scale, { size: 25 * scale, color: TEXT, font: SERIF, weight: 900, align: "center", spacing: 4 * scale });
    ornament(cx, 44 * scale, 95 * scale);
    text(`${verdict} · ${flavor}`, cx, 62 * scale, { size: 10.5 * scale, color: quit ? "#bfeeff" : "#ffacac", align: "center", weight: 750 });

    const sideW = 238 * scale;
    const sideH = 184 * scale;
    const sideY = 78 * scale;
    const leftX = bounds.left;
    const rightX = bounds.right - sideW;
    panel(leftX, sideY, sideW, sideH, { alpha: 0.58, border: GOLD_DIM, radius: 9 * scale });
    text(personalBest ? "개인 최고 기록" : "이번 점수", leftX + 18 * scale, sideY + 26 * scale, { size: 10.5 * scale, color: personalBest ? "#ffe2a3" : MUTED, weight: 800 });
    const shownScore = Math.round(score * easeOutCubic(clamp((enterT - 0.36) / 0.7, 0, 1)));
    text(shownScore.toLocaleString("ko-KR"), leftX + sideW - 18 * scale, sideY + 58 * scale, { size: 30 * scale, color: GOLD, weight: 900, align: "right" });
    const stats = [
      ["무기", weapon || "장검"], ["도달", `스테이지 ${stage}`], ["최대 콤보", String(bestCombo)], ["붕괴", `${floors}줄`],
    ];
    stats.forEach(([label, value], i) => {
      const y = sideY + (84 + i * 27) * scale;
      text(label, leftX + 18 * scale, y, { size: 10 * scale, color: MUTED, weight: 800 });
      text(value, leftX + sideW - 18 * scale, y, { size: 11.5 * scale, color: TEXT, weight: 850, align: "right" });
    });

    let heroBox = null;
    const hero = sprites[`motion_${weaponId}_hurt_v1`];
    if (hero) {
      const frame = 7;
      const drawH = 156 * scale;
      const drawW = drawH * 480 / 528;
      const heroX = cx - drawW / 2;
      const heroY = 105 * scale;
      heroBox = { x: heroX, y: heroY, w: drawW, h: drawH };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = clamp(enterT / 0.45, 0, 1);
      ctx.drawImage(hero, (frame % 4) * 480, Math.floor(frame / 4) * 528, 480, 528, heroX, heroY, drawW, drawH);
      ctx.restore();
    }

    panel(rightX, sideY, sideW, sideH, { alpha: 0.62, border: hasSettlement ? "rgba(143,227,255,0.5)" : GOLD_DIM, radius: 9 * scale });
    text(hasSettlement ? "파편 정산" : "전투 기록", rightX + 18 * scale, sideY + 29 * scale, { size: 15 * scale, color: hasSettlement ? "#bfeeff" : GOLD, font: SERIF, weight: 900 });
    const settlementRows = hasSettlement ? [
      ["이번 획득", `+${Math.max(0, Number(earnedShards) || 0).toLocaleString("ko-KR")}`],
      ["정산 전", Math.max(0, Number(bankBefore) || 0).toLocaleString("ko-KR")],
      ["정산 후", Math.max(0, Number(bankAfter) || 0).toLocaleString("ko-KR")],
      ["반환 리롤권", `+${Math.max(0, Number(returnedTickets) || 0)}`],
    ] : [
      ["공격", `${attacks || 0}회`], ["기술", `${skills || 0}회`], ["최대 콤보", String(bestCombo)], ["붕괴", `${floors}줄`],
    ];
    settlementRows.forEach(([label, value], i) => {
      const y = sideY + (62 + i * 31) * scale;
      text(label, rightX + 18 * scale, y, { size: 10.5 * scale, color: MUTED, weight: 800 });
      text(value, rightX + sideW - 18 * scale, y, { size: 12.5 * scale, color: hasSettlement && i === 2 ? "#bcebb6" : TEXT, weight: 900, align: "right" });
    });

    const achievement = unlocked.length ? `${unlocked.join(" · ")} 새로 해금!`
      : personalBestStage ? `개인 최고 도달 · 스테이지 ${personalBestStage}` : `이번 최고 콤보 · ${bestCombo}`;
    text(achievement, cx, 292 * scale, { size: fitTextSize(achievement, 13.5 * scale, 470 * scale), color: "#ffe2a3", align: "center", weight: 900, stroke: true });
    const note = settlementError || (settlementFailed ? "정산 저장을 완료하지 못했습니다" : "") || saveError || (registered ? "이 기기의 순위표에 기록되었습니다"
      : profileSaved === true ? "파편과 성장 기록을 이 기기에 저장했습니다" : "이름을 남겨 이 기기의 순위표에 기록하세요");
    text(note, cx, 311 * scale, { size: fitTextSize(note, 9.5 * scale, 560 * scale), color: settlementFailed || saveError ? "#ffaaaa" : "#9fdcff", align: "center", weight: 750 });
    const gap = 10 * scale;
    const primaryW = 188 * scale;
    const retryW = 270 * scale;
    const skipW = 154 * scale;
    const rowW = primaryW + retryW + skipW + gap * 2;
    const rowLeft = cx - rowW / 2;
    const primary = outlinedActionButton(rowLeft + primaryW / 2, 348 * scale, primaryW, 44 * scale,
      settlementFailed ? "정산 다시 시도" : registered ? "순위표 보기" : "이름 남기고 기록",
      settlementFailed ? "results:retrySave" : "results:primary", { selected: settlementFailed, danger: settlementFailed, scale, fontSize: 11.5 });
    const retry = outlinedActionButton(rowLeft + primaryW + gap + retryW / 2, 348 * scale, retryW, 44 * scale, "같은 준비로 재도전", "results:retry", { selected: !settlementFailed, disabled: settlementFailed, scale, fontSize: 13 });
    const skip = outlinedActionButton(rowLeft + primaryW + retryW + gap * 2 + skipW / 2, 348 * scale, skipW, 44 * scale, "모험 준비", "results:skip", { disabled: settlementFailed, scale, fontSize: 11.5 });
    metrics.results = {
      hero: heroBox,
      stats: { x: leftX, y: sideY, w: sideW, h: sideH },
      settlement: hasSettlement ? {
        x: rightX, y: sideY, w: sideW, h: sideH,
        earnedShards: Math.max(0, Number(earnedShards) || 0), bankBefore: Math.max(0, Number(bankBefore) || 0),
        bankAfter: Math.max(0, Number(bankAfter) || 0), returnedTickets: Math.max(0, Number(returnedTickets) || 0),
      } : null,
      achievement: { text: achievement, x: cx - 235 * scale, y: 277 * scale, w: 470 * scale, h: 22 * scale },
      note: { text: note, x: cx - 280 * scale, y: 299 * scale, w: 560 * scale, h: 20 * scale },
      actions: { primary, retry, skip },
      saveError: saveError || settlementError || null,
      settlementFailed,
      deathCause,
      endReason: quit ? "quit" : "death",
      landscape: true,
    };
  }

  // === results ===
  function drawResults({
    score,
    bestCombo,
    floors,
    stage,
    weapon,
    weaponId,
    attacks,
    skills,
    unlocked = [],
    registered,
    enterT,
    saveError = "",
    profileSaved = null,
    personalBest = false,
    personalBestStage = null,
    deathCause = "contact",
    endReason = "death",
    earnedShards = null,
    bankBefore = null,
    bankAfter = null,
    returnedTickets = null,
    settlementError = "",
  }) {
    if (isShortLandscape()) {
      drawResultsLandscape({
        score, bestCombo, floors, stage, weapon, weaponId, attacks, skills, unlocked, registered, enterT,
        saveError, profileSaved, personalBest, personalBestStage, deathCause, endReason, earnedShards,
        bankBefore, bankAfter, returnedTickets, settlementError,
      });
      return;
    }
    const bounds = safeBounds();
    const cx = bounds.cx;
    const mobile = isMobileLayout();
    const scale = Math.min(mobile ? sceneUiScale() : screenUiScale() * 0.86, H / (mobile ? 780 : 680));
    const contentW = Math.min(bounds.width - 36 * scale, 530 * scale);
    const statsW = mobile ? contentW : contentW * 0.59;
    const statsLeft = mobile ? cx - statsW / 2 : cx - contentW / 2;
    const statsTop = 219 * scale;
    const quit = ["quit", "manual", "abandoned", "exit"].includes(endReason);
    const hasSettlement = earnedShards !== null || bankAfter !== null || bankBefore !== null || returnedTickets !== null;
    const settlementFailed = Boolean(settlementError) || (hasSettlement && profileSaved === false);
    let heroBox = null;
    const hero = sprites[`motion_${weaponId}_hurt_v1`];
    if (hero) {
      const frame = 7;
      const sourceX = (frame % 4) * 480;
      const sourceY = Math.floor(frame / 4) * 528;
      const drawH = (hasSettlement ? mobile ? 138 : 154 : mobile ? 188 : 224) * scale;
      const drawW = drawH * 480 / 528;
      const heroX = mobile ? cx - drawW / 2 : cx + contentW * 0.31 - drawW / 2;
      const heroY = hasSettlement ? (mobile ? 387 : 340) * scale : mobile ? 330 * scale : 197 * scale;
      heroBox = { x: heroX, y: heroY, w: drawW, h: drawH };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = clamp(enterT / 0.45, 0, 1);
      ctx.drawImage(
        hero,
        sourceX,
        sourceY,
        480,
        528,
        heroX,
        heroY,
        drawW,
        drawH,
      );
      ctx.restore();
    }
    text("이번 모험", cx, 56 * scale, { size: 28 * scale, color: TEXT, font: SERIF, weight: 800, align: "center", spacing: 6 * scale });
    ornament(cx, 76 * scale, 110 * scale);

    const verdict = quit ? "모험 종료" : "사망";
    const flavor = quit ? "획득한 파편을 챙겨 돌아왔다"
      : deathCause === "debris" ? "보스의 잔해에 맞아 쓰러졌다" : "몬스터에게 짓눌렸다";
    if (enterT > 0.15) {
      const k = clamp((enterT - 0.15) / 0.25, 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      text(`${verdict} · ${flavor}`, cx, 108 * scale, { size: 11.5 * scale, color: quit ? "#bfeeff" : "#ffacac", align: "center" });
      ctx.restore();
    }

    const shownScore = Math.round(score * easeOutCubic(clamp((enterT - 0.36) / 0.7, 0, 1)));
    text(personalBest ? "개인 최고 기록" : "이번 점수", cx, 143 * scale, { size: 11 * scale, color: personalBest ? "#ffe2a3" : MUTED, align: "center", weight: 800 });
    text(shownScore.toLocaleString(), cx, 184 * scale, { size: 38 * scale, color: GOLD, weight: 900, align: "center" });

    const allStats = [
      ["무기", weapon || "장검"],
      ["도달", `스테이지 ${stage}`],
      ["최대 콤보", String(bestCombo)],
      ["붕괴", `${floors}줄`],
      ["공격", `${attacks || 0}회`],
      ["기술", `${skills || 0}회`],
    ];
    const stats = hasSettlement && mobile ? allStats.slice(0, 4) : allStats;
    const colW = statsW / (mobile ? 2 : 1);
    stats.forEach(([label, value], i) => {
      const at = 0.4 + i * 0.12;
      if (enterT < at) return;
      const k = clamp((enterT - at) / 0.2, 0, 1);
      const col = mobile ? i % 2 : 0;
      const row = mobile ? Math.floor(i / 2) : i;
      const x = statsLeft + col * colW;
      const y = statsTop + row * (mobile ? 37 : 32) * scale;
      ctx.save();
      ctx.globalAlpha = k;
      text(label, x + 8 * scale, y, { size: 10.5 * scale, color: MUTED, weight: 800 });
      text(value, x + colW - 8 * scale, y, { size: (mobile ? 12.5 : 14) * scale, color: TEXT, weight: 800, align: "right" });
      ctx.strokeStyle = "rgba(236,230,244,0.18)";
      ctx.beginPath();
      ctx.moveTo(x + 8 * scale, y + 10 * scale);
      ctx.lineTo(x + colW - 8 * scale, y + 10 * scale);
      ctx.stroke();
      ctx.restore();
    });

    let settlementBox = null;
    if (hasSettlement) {
      const settlementX = mobile ? statsLeft : statsLeft + statsW + 12 * scale;
      const settlementY = mobile ? statsTop + 82 * scale : statsTop - 14 * scale;
      const settlementW = mobile ? statsW : contentW - statsW - 12 * scale;
      const settlementH = (mobile ? 78 : 122) * scale;
      panel(settlementX, settlementY, settlementW, settlementH, { alpha: 0.62, border: "rgba(143,227,255,0.48)", radius: 9 * scale });
      text("파편 정산", settlementX + 14 * scale, settlementY + 23 * scale, { size: (mobile ? 12.5 : 15) * scale, color: "#bfeeff", font: SERIF, weight: 900 });
      if (mobile) {
        text(`이번 +${Math.max(0, Number(earnedShards) || 0).toLocaleString("ko-KR")}`, settlementX + 14 * scale, settlementY + 49 * scale, { size: 11.5 * scale, color: TEXT, weight: 850 });
        text(`보관 ${Math.max(0, Number(bankBefore) || 0).toLocaleString("ko-KR")} → ${Math.max(0, Number(bankAfter) || 0).toLocaleString("ko-KR")}`, settlementX + settlementW - 14 * scale, settlementY + 49 * scale, { size: 11.5 * scale, color: "#bcebb6", weight: 900, align: "right" });
        if (Math.max(0, Number(returnedTickets) || 0) > 0) text(`미사용 리롤권 +${Math.max(0, Number(returnedTickets) || 0)} 반환`, settlementX + settlementW / 2, settlementY + 68 * scale, { size: 9.5 * scale, color: "#ffe2a3", weight: 800, align: "center" });
      } else {
        const rows = [
          ["이번 획득", `+${Math.max(0, Number(earnedShards) || 0).toLocaleString("ko-KR")}`],
          ["정산 전", Math.max(0, Number(bankBefore) || 0).toLocaleString("ko-KR")],
          ["정산 후", Math.max(0, Number(bankAfter) || 0).toLocaleString("ko-KR")],
          ["권 반환", `+${Math.max(0, Number(returnedTickets) || 0)}`],
        ];
        rows.forEach(([label, value], i) => {
          const y = settlementY + (47 + i * 19) * scale;
          text(label, settlementX + 14 * scale, y, { size: 9.5 * scale, color: MUTED, weight: 750 });
          text(value, settlementX + settlementW - 14 * scale, y, { size: 10.5 * scale, color: i === 2 ? "#bcebb6" : TEXT, weight: 900, align: "right" });
        });
      }
      settlementBox = {
        x: settlementX, y: settlementY, w: settlementW, h: settlementH,
        earnedShards: Math.max(0, Number(earnedShards) || 0),
        bankBefore: Math.max(0, Number(bankBefore) || 0),
        bankAfter: Math.max(0, Number(bankAfter) || 0),
        returnedTickets: Math.max(0, Number(returnedTickets) || 0),
      };
    }

    if (enterT > 1.0) {
      const achievement = unlocked.length ? `${unlocked.join(" · ")} 새로 해금!`
        : personalBestStage ? `개인 최고 도달 · 스테이지 ${personalBestStage}`
          : `이번 최고 콤보 · ${bestCombo}`;
      const achievementY = H - (mobile ? 238 : 224) * scale;
      text(achievement, cx, achievementY, { size: fitTextSize(achievement, 16 * scale, contentW), color: "#ffe2a3", align: "center", weight: 900, stroke: true });
      const note = settlementError || (settlementFailed ? "정산 저장을 완료하지 못했습니다" : "") || saveError || (registered ? "이 기기의 순위표에 기록되었습니다"
        : profileSaved === true ? hasSettlement ? "파편과 성장 기록을 이 기기에 저장했습니다" : "이 기기에 성장 기록이 저장되었습니다" : "이름을 남겨 이 기기의 순위표에 기록하세요");
      const noteY = H - (mobile ? 202 : 183) * scale;
      wrapText(note, cx, noteY, contentW, 11 * scale, settlementFailed || saveError ? "#ffaaaa" : "#9fdcff", 5 * scale, "center", 750);
      const primaryLabel = settlementFailed ? "정산 다시 시도" : registered ? "순위표 보기" : "이름 남기고 기록";
      const primaryId = settlementFailed ? "results:retrySave" : "results:primary";
      let primaryBox;
      let retryBox;
      let skipBox;
      if (mobile) {
        retryBox = outlinedActionButton(cx, H - 134 * scale, 232 * scale, 54 * scale, hasSettlement ? "같은 준비로 재도전" : "같은 무기로 재도전", "results:retry", { selected: !settlementFailed, disabled: settlementFailed, scale, fontSize: 12.5 });
        primaryBox = outlinedActionButton(cx - 91 * scale, H - 78 * scale, 166 * scale, 52 * scale, primaryLabel, primaryId, { selected: settlementFailed, danger: settlementFailed, scale, fontSize: 10.5 });
        skipBox = outlinedActionButton(cx + 91 * scale, H - 78 * scale, 126 * scale, 52 * scale, hasSettlement ? "모험 준비" : "타이틀로", "results:skip", { disabled: settlementFailed, scale, fontSize: 10.5 });
      } else {
        primaryBox = outlinedActionButton(cx - 210 * scale, H - 78 * scale, 184 * scale, 44 * scale, primaryLabel, primaryId, { selected: settlementFailed, danger: settlementFailed, scale, fontSize: 11.5 });
        retryBox = outlinedActionButton(cx, H - 78 * scale, 214 * scale, 46 * scale, hasSettlement ? "같은 준비로 재도전" : "같은 무기로 재도전", "results:retry", { selected: !settlementFailed, disabled: settlementFailed, scale, fontSize: 12.5 });
        skipBox = outlinedActionButton(cx + 198 * scale, H - 78 * scale, 142 * scale, 44 * scale, hasSettlement ? "모험 준비" : "타이틀로", "results:skip", { disabled: settlementFailed, scale, fontSize: 11.5 });
      }
      keyHint(settlementFailed ? [
        { k: ["J"], t: "정산 다시 시도" },
      ] : [
        { k: ["J"], t: registered ? "순위표" : "순위 등록" },
        { k: ["L"], t: "재도전" },
        { k: ["K"], t: hasSettlement ? "모험 준비" : "타이틀" },
      ], H - 28 * baseUiScale());
      metrics.results = {
        hero: heroBox,
        stats: { x: statsLeft, y: statsTop - 14 * scale, w: statsW, h: (mobile ? (hasSettlement ? 72 : 103) : 184) * scale },
        settlement: settlementBox,
        achievement: { text: achievement, x: cx - contentW / 2, y: achievementY - 19 * scale, w: contentW, h: 24 * scale },
        note: { text: note, x: cx - contentW / 2, y: noteY - 12 * scale, w: contentW, h: 38 * scale },
        actions: { primary: primaryBox, retry: retryBox, skip: skipBox },
        saveError: settlementError || saveError || null,
        settlementFailed,
        deathCause,
        endReason: quit ? "quit" : "death",
        landscape: false,
      };
    }
  }

  // === ranking board ===
  function rankingEndReasonLabel(reason) {
    if (["quit", "manual", "abandoned", "exit"].includes(reason)) return "도중 종료";
    if (reason === "death_debris") return "잔해 사망";
    if (reason === "death_contact") return "접촉 사망";
    if (typeof reason === "string" && reason.startsWith("death")) return "사망";
    return "종료 사유 미상";
  }

  function rankingRowMeta(entry) {
    const rawVersion = entry?.rulesVersion;
    const hasGrowthRules = rawVersion !== undefined
      && rawVersion !== null
      && rawVersion !== ""
      && Number.isFinite(Number(rawVersion));
    if (!hasGrowthRules) {
      return {
        text: "이전 규칙",
        legacy: true,
        rulesVersion: null,
        growthLevels: null,
        endReason: null,
      };
    }
    const level = value => Math.max(0, Math.floor(Number(value) || 0));
    const growthLevels = {
      maxHp: level(entry?.growthLevels?.maxHp),
      maxGuard: level(entry?.growthLevels?.maxGuard),
    };
    const endReason = rankingEndReasonLabel(entry?.endReason);
    return {
      text: `성장 체력 ${growthLevels.maxHp}단 · 방어 ${growthLevels.maxGuard}단 · ${endReason}`,
      legacy: false,
      rulesVersion: Number(rawVersion),
      growthLevels,
      endReason,
    };
  }

  function drawRankingLandscape({ entries, highlight, enterT }) {
    const bounds = shortLandscapeBounds(780);
    const cx = bounds.cx;
    const scale = baseUiScale();
    text("이 기기의 순위표", cx, 28 * scale, { size: 23 * scale, color: TEXT, font: SERIF, weight: 900, align: "center", spacing: 3 * scale });
    text("현재 브라우저에 저장된 모험 기록 · 성장 단계와 종료 사유", cx, 48 * scale, {
      size: 9.5 * scale, color: MUTED, align: "center", weight: 650,
    });
    ornament(cx, 58 * scale, 108 * scale);

    const columnGap = 14 * scale;
    const columnW = (bounds.width - columnGap) / 2;
    const headerY = 76 * scale;
    const rowsTop = 83 * scale;
    const rowPitch = 42 * scale;
    const rowH = 38 * scale;
    const visibleEntries = entries.slice(0, 10);
    const rows = [];
    const headers = [];

    for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
      const columnLeft = bounds.left + columnIndex * (columnW + columnGap);
      const columnRight = columnLeft + columnW;
      const col = {
        rank: columnLeft + 19 * scale,
        name: columnLeft + 38 * scale,
        weapon: columnRight - 126 * scale,
        stage: columnRight - 72 * scale,
        score: columnRight - 10 * scale,
      };
      const headerSize = 9 * scale;
      text("순위", col.rank, headerY, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "center" });
      text("이름", col.name, headerY, { size: headerSize, color: "rgba(190,202,224,0.78)" });
      text("무기", col.weapon, headerY, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });
      text("도달", col.stage, headerY, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });
      text("점수", col.score, headerY, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });
      headers.push({ x: columnLeft, y: headerY - 12 * scale, w: columnW, h: 15 * scale });

      for (let localIndex = 0; localIndex < 5; localIndex += 1) {
        const i = columnIndex * 5 + localIndex;
        const entry = visibleEntries[i];
        if (!entry) continue;
        const at = 0.1 + i * 0.06;
        if (enterT < at) continue;
        const k = clamp((enterT - at) / 0.18, 0, 1);
        const y = rowsTop + localIndex * rowPitch;
        const mine = i === highlight;
        const meta = rankingRowMeta(entry);
        const name = String(entry.name || "무명");
        const weapon = String(entry.weapon || "—");
        const stage = String(entry.stage ?? "—");
        const score = String(entry.score ?? 0);
        ctx.save();
        ctx.globalAlpha = k;
        if (mine) panel(columnLeft, y, columnW, rowH, { alpha: 0.4, border: GOLD, radius: 6 * scale });
        const rankColor = i === 0 ? GOLD : i < 3 ? "#d8c9a0" : MUTED;
        text(String(i + 1), col.rank, y + 13 * scale, { size: 12 * scale, color: rankColor, weight: 800, align: "center" });
        text(name, col.name, y + 13 * scale, {
          size: fitTextSize(name, 11.5 * scale, col.weapon - col.name - 8 * scale, { weight: mine ? 800 : 650, minSize: 8 * scale }),
          color: mine ? GOLD : TEXT, weight: mine ? 800 : 650,
        });
        text(weapon, col.weapon, y + 13 * scale, {
          size: fitTextSize(weapon, 9.5 * scale, col.stage - col.weapon - 8 * scale, { minSize: 7.5 * scale }),
          color: MUTED, align: "right",
        });
        text(stage, col.stage, y + 13 * scale, { size: 10 * scale, color: "#9fdcff", weight: 750, align: "right" });
        text(score, col.score, y + 13 * scale, {
          size: fitTextSize(score, 11.5 * scale, col.score - col.stage - 8 * scale, { weight: 850, minSize: 8 * scale }),
          color: mine ? GOLD : TEXT, weight: 850, align: "right",
        });
        const metaW = columnRight - col.name - 10 * scale;
        const metaSize = fitTextSize(meta.text, 8.5 * scale, metaW, { weight: 700, minSize: 7 * scale });
        text(meta.text, col.name, y + 29 * scale, {
          size: metaSize, color: meta.legacy ? "rgba(190,202,224,0.72)" : "rgba(167,226,255,0.9)", weight: 700,
        });
        ctx.restore();
        rows.push({
          index: i, x: columnLeft, y, w: columnW, h: rowH,
          meta: { ...meta, x: col.name, y: y + 18 * scale, w: metaW, h: 14 * scale },
        });
      }
    }

    if (!visibleEntries.length) {
      text("아직 아무도 이름을 남기지 않았다", cx, 178 * scale, { size: 13 * scale, color: MUTED, align: "center" });
    }
    const back = outlinedActionButton(cx, H - 56 * scale, 118 * scale, 40 * scale,
      "타이틀로", "ranking:back", { selected: true, scale, fontSize: 12 });
    keyHint([{ k: ["J"], t: "타이틀로" }], H - 17 * scale);
    metrics.ranking = {
      landscape: true,
      headers,
      rows,
      back,
    };
  }

  function drawRanking({ entries, highlight, enterT }) {
    if (isShortLandscape()) {
      drawRankingLandscape({ entries, highlight, enterT });
      return;
    }
    const bounds = safeBounds();
    const cx = bounds.cx;
    const scale = sceneUiScale();
    const mobile = isMobileLayout();
    text("이 기기의 순위표", cx, 72 * scale, { size: 25 * scale, color: TEXT, font: SERIF, weight: 800, align: "center", spacing: 3 * scale });
    text("현재 브라우저에 저장된 모험 기록", cx, 99 * scale, { size: 10.5 * scale, color: MUTED, align: "center", weight: 650 });
    ornament(cx, 109 * scale, 130 * scale);

    // column headers
    const tableLeft = bounds.left + 22 * scale;
    const tableRight = bounds.right - 22 * scale;
    const tableW = tableRight - tableLeft;
    const col = mobile
      ? {
          rank: tableLeft + tableW * 0.05,
          name: tableLeft + tableW * 0.14,
          weapon: tableLeft + tableW * 0.62,
          stage: tableLeft + tableW * 0.78,
          score: tableRight,
        }
      : {
          rank: cx - 188 * scale,
          name: cx - 160 * scale,
          weapon: cx + 42 * scale,
          stage: cx + 112 * scale,
          score: cx + 196 * scale,
        };
    const headerSize = (mobile ? 9.5 : 10.5) * scale;
    text("순위", col.rank, 126 * scale, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "center" });
    text("이름", col.name, 126 * scale, { size: headerSize, color: "rgba(190,202,224,0.78)" });
    text("무기", col.weapon, 126 * scale, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });
    text("도달", col.stage, 126 * scale, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });
    text("점수", col.score, 126 * scale, { size: headerSize, color: "rgba(190,202,224,0.78)", align: "right" });

    if (!entries.length) {
      text("아직 아무도 이름을 남기지 않았다", cx, 220 * scale, { size: 13.5 * scale, color: MUTED, align: "center" });
    }

    const rows = [];
    entries.slice(0, 10).forEach((e, i) => {
      const at = 0.1 + i * 0.06;
      if (enterT < at) return;
      const k = clamp((enterT - at) / 0.18, 0, 1);
      const y = (138 + i * 36) * scale;
      const mine = i === highlight;
      const meta = rankingRowMeta(e);
      const name = String(e.name || "무명");
      const weapon = String(e.weapon || "—");
      const stage = String(e.stage ?? "—");
      const score = String(e.score ?? 0);
      ctx.save();
      ctx.globalAlpha = k;
      if (mine) {
        panel(mobile ? tableLeft : cx - 208 * scale, y, mobile ? tableW : 416 * scale, 34 * scale, { alpha: 0.4, border: GOLD, radius: 6 * scale });
      }
      const rankColor = i === 0 ? GOLD : i < 3 ? "#d8c9a0" : MUTED;
      text(String(i + 1), col.rank, y + 13 * scale, { size: (mobile ? 12 : 14) * scale, color: rankColor, weight: 800, align: "center" });
      text(name, col.name, y + 13 * scale, {
        size: fitTextSize(name, (mobile ? 11.5 : 13.5) * scale, col.weapon - col.name - 8 * scale, { weight: mine ? 800 : 650, minSize: (mobile ? 8 : 9) * scale }),
        color: mine ? GOLD : TEXT, weight: mine ? 800 : 650,
      });
      text(weapon, col.weapon, y + 13 * scale, {
        size: fitTextSize(weapon, (mobile ? 9.5 : 11) * scale, col.stage - col.weapon - 8 * scale, { minSize: 7.5 * scale }),
        color: MUTED, align: "right",
      });
      text(stage, col.stage, y + 13 * scale, { size: (mobile ? 10 : 11.5) * scale, color: "#9fdcff", weight: 700, align: "right" });
      text(score, col.score, y + 13 * scale, {
        size: fitTextSize(score, (mobile ? 11.5 : 13.5) * scale, col.score - col.stage - 8 * scale, { weight: 800, minSize: (mobile ? 8 : 9) * scale }),
        color: mine ? GOLD : TEXT, weight: 800, align: "right",
      });
      const metaW = tableRight - col.name;
      text(meta.text, col.name, y + 28 * scale, {
        size: fitTextSize(meta.text, (mobile ? 8.5 : 9.5) * scale, metaW, { weight: 700, minSize: 7 * scale }),
        color: meta.legacy ? "rgba(190,202,224,0.72)" : "rgba(167,226,255,0.9)", weight: 700,
      });
      ctx.restore();
      rows.push({
        index: i, x: mobile ? tableLeft : cx - 208 * scale, y, w: mobile ? tableW : 416 * scale, h: 34 * scale,
        meta: { ...meta, x: col.name, y: y + 17 * scale, w: metaW, h: 14 * scale },
      });
    });

    const back = outlinedActionButton(cx, H - 72 * scale, 118 * scale, 40 * scale,
      "타이틀로", "ranking:back", { selected: true, scale, fontSize: 12 });
    keyHint([{ k: ["J"], t: "타이틀로" }], H - 26 * baseUiScale());
    metrics.ranking = {
      landscape: false,
      headers: [{ x: tableLeft, y: 113 * scale, w: tableW, h: 17 * scale }],
      rows,
      back,
    };
  }

  function vignette() {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.44, W / 2, H / 2, H * 0.85);
    grad.addColorStop(0, "rgba(5,3,12,0)");
    grad.addColorStop(1, "rgba(5,3,12,0.42)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function fadeOverlay(alpha) {
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(3,2,8,${clamp(alpha, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }

  return {
    beginFrame,
    hitAt,
    drawHud,
    drawTitle,
    drawPreparation,
    drawWeaponSelect,
    drawForge,
    drawQuitConfirm,
    drawResults,
    drawRanking,
    drawSystemControls,
    drawPauseOverlay,
    vignette,
    fadeOverlay,
    panel,
    text,
    metrics: () => metrics,
  };
}
