// HUD and screen chrome. Registers mouse hit-regions for menu buttons each
// frame (scenes.js resolves clicks). Terminology policy: plain Korean only.
import * as engine from "./engine.js";
import { idleFrameAt, weaponCharacterScale } from "./attack-motion.js";

export const SANS = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
export const SERIF = '"Nanum Myeongjo", "AppleMyungjo", "Noto Serif KR", serif';

const GOLD = "#e8b34b";
const GOLD_DIM = "rgba(232,179,75,0.4)";
const INK = "#0a0718";
const TEXT = "#ece6f4";
const MUTED = "#b5bfd2";
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
  let pointer = { x: -1, y: -1, down: false };
  const forgeGemCache = new Map();
  const forgeGlowCache = new Map();
  const tiledFrameCache = new Map();

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

  function setPointer(x, y, down = false) {
    pointer = { x, y, down };
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
    if (layoutState.menuSafeWidth) return layoutState.menuSafeWidth;
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
    return Boolean(layoutState.menuPortrait ?? layoutState.portrait);
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
    if (layoutState.portrait) return safeBounds({ combat: true });
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

  function frameScaleFor(record, grid, w, h, preferredScale) {
    const fixed = (cuts, stretch) => cuts.slice(0, -1).reduce((total, start, i) =>
      total + (stretch?.includes(i) ? 0 : cuts[i + 1] - start), 0);
    const natural = Math.min(w / record.rect[2], h / record.rect[3]);
    return Math.min(preferredScale ?? natural, w / fixed(grid.x, grid.xStretch), h / fixed(grid.y, grid.yStretch));
  }

  function tiledFrame(name, image, record, grid, w, h, scale) {
    const key = `${name}:${w}:${h}:${scale}`;
    if (tiledFrameCache.has(key)) return tiledFrameCache.get(key);
    const canvas = document.createElement("canvas");
    // Assemble on the atlas pixel grid, then scale the complete surface once.
    // Fractional per-tile destinations leave hairline alpha seams on Canvas.
    canvas.width = Math.ceil(w / scale);
    canvas.height = Math.ceil(h / scale);
    const target = canvas.getContext("2d");
    const [sx, sy, sw, sh] = record.rect;
    const snap = segments => segments.map(segment => ({ ...segment, target: Math.round(segment.target),
      targetLength: Math.round(segment.target + segment.targetLength) - Math.round(segment.target) }));
    const columns = snap(sliceAxis(sw, grid.x, grid.xStretch, canvas.width, 1));
    const rows = snap(sliceAxis(sh, grid.y, grid.yStretch, canvas.height, 1));
    target.imageSmoothingEnabled = true;
    if (grid.fill) {
      const [fx, fy, fw, fh] = grid.fill;
      const left = grid.edgeWidth || columns[0].targetLength;
      const right = grid.edgeWidth || columns.at(-1).targetLength;
      const top = rows[0].targetLength;
      target.drawImage(image, sx + fx, sy + fy, fw, fh,
        left, top, canvas.width - left - right, canvas.height - top - rows.at(-1).targetLength);
    }
    rows.forEach((row, ri) => columns.forEach((column, ci) => {
      if (grid.borderOnly && ri > 0 && ri < rows.length - 1 && ci > 0 && ci < columns.length - 1) return;
      if (grid.edgeWidth && ri > 0 && ri < rows.length - 1) {
        // The middle rail is narrower than the corner ornaments. Repeating
        // the whole corner-width column would also repeat blocks of backing.
        const right = ci === columns.length - 1;
        column = { ...column, source: right ? sw - grid.edgeWidth : 0, length: grid.edgeWidth,
          target: right ? canvas.width - grid.edgeWidth : 0, targetLength: grid.edgeWidth };
      }
      if (column.targetLength <= 0 || row.targetLength <= 0) return;
      const repeatX = grid.xRepeat?.includes(ci);
      const repeatY = grid.yRepeat?.includes(ri);
      const tileW = repeatX ? column.length : column.targetLength;
      const tileH = repeatY ? row.length : row.targetLength;
      // Crop the final tile at its natural scale. Stretching the remainder
      // would distort exactly the small metal details this path preserves.
      for (let ty = 0; ty < row.targetLength - 0.0001; ty += tileH) {
        const dh = Math.min(tileH, row.targetLength - ty);
        for (let tx = 0; tx < column.targetLength - 0.0001; tx += tileW) {
          const dw = Math.min(tileW, column.targetLength - tx);
          target.drawImage(image, sx + column.source, sy + row.source,
            repeatX ? dw : column.length, repeatY ? dh : row.length,
            column.target + tx, row.target + ty, dw, dh);
        }
      }
    }));
    // Only assembled surfaces are cached; source atlas pixels stay untouched.
    if (tiledFrameCache.size >= 6) tiledFrameCache.delete(tiledFrameCache.keys().next().value);
    tiledFrameCache.set(key, canvas);
    return canvas;
  }

  function drawUiFrame(name, x, y, w, h, { alpha = 1, frameScale = null } = {}) {
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
    const scale = frameScaleFor(record, grid, w, h, frameScale);
    if (grid.xRepeat?.length || grid.yRepeat?.length) {
      const surface = tiledFrame(name, image, record, grid, w, h, scale);
      return drawAtlasRegion(surface, [0, 0, w / scale, h / scale], x, y, w, h, alpha);
    }
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
    if (paused) {
      metrics.systemControls = {};
      return;
    }
    const bounds = scene === "run"
      ? combatHudBounds()
      : isShortLandscape() ? shortLandscapeBounds() : safeBounds();
    const scale = hudUiScale();
    if (scene !== "run") {
      const x = snapCssX(bounds.right - 28 * scale);
      const y = snapCssY(32 * scale);
      speakerIcon(x, y, muted, 0.82 * scale);
      region(x - 22 * scale, y - 22 * scale, 44 * scale, 44 * scale, "system:mute");
      metrics.systemControls = { mute: snapCssRect(x - 22 * scale, y - 22 * scale, 44 * scale, 44 * scale) };
      return;
    }

    const mobile = Boolean(layoutState.portrait);
    const hitSize = 44 * scale;
    const controlsY = (mobile ? 26 : 108) * scale;
    const scoreBottom = metrics.hud?.score ? metrics.hud.score.y + metrics.hud.score.h : 0;
    const y = snapCssY(mobile ? controlsY : Math.max(controlsY, scoreBottom + hitSize / 2 + 4 * scale));
    const muteX = snapCssX(bounds.right - 22 * scale);
    const pauseX = snapCssX(bounds.right - 70 * scale);
    pauseIcon(pauseX, y, 0.75 * scale);
    speakerIcon(muteX, y, muted, 0.78 * scale);
    const pauseBox = snapCssRect(pauseX - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    const muteBox = snapCssRect(muteX - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    region(pauseBox.x, pauseBox.y, pauseBox.w, pauseBox.h, "system:pause");
    region(muteBox.x, muteBox.y, muteBox.w, muteBox.h, "system:mute");
    metrics.systemControls = { pause: pauseBox, mute: muteBox, rowY: y };
  }

  function drawPauseOverlayLandscape(options = {}) {
    drawPauseOverlay({ ...options, compactLandscape: true });
  }

  function drawPauseOverlay({
    upgrades = [], weaponName = "", stats = null, reducedMotion = false, shards = 0,
    section = "main", focusedIndex = 0, scrollOffset = 0, muted = false,
    touchInput = Boolean(layoutState.coarsePointer || layoutState.touchVisible), compactLandscape = false,
  } = {}) {
    if (isShortLandscape() && !compactLandscape) {
      drawPauseOverlayLandscape({ upgrades, weaponName, stats, reducedMotion, shards, section, focusedIndex, scrollOffset, muted, touchInput });
      return;
    }
    const landscape = compactLandscape;
    const bounds = landscape ? shortLandscapeBounds(760) : safeBounds();
    // Keep type and touch targets in CSS pixels; only the list gives up height.
    const scale = baseUiScale();
    const cx = bounds.cx;
    const width = Math.min(bounds.width - (landscape ? 0 : 24) * scale, (section === "upgrades" ? 400 : 360) * scale);
    const left = cx - width / 2;
    const titles = { main: "일시정지", upgrades: "강화 보기", settings: "설정", controls: "조작법" };
    const activeSection = Object.hasOwn(titles, section) ? section : "main";
    const focusOrders = {
      main: ["pause:resume", "pause:upgrades", "pause:settings", "pause:quit"],
      upgrades: ["pause:back"],
      settings: ["system:mute", "system:motion", "pause:controls", "pause:back"],
      controls: ["pause:back"],
    };
    const focusOrder = focusOrders[activeSection];
    const focus = clamp(Math.round(Number(focusedIndex) || 0), 0, focusOrder.length - 1);
    const heights = {
      main: landscape ? 276 : 316,
      settings: landscape ? 306 : 352,
      controls: landscape ? 306 : touchInput ? 306 : 346,
      upgrades: Math.min((H / scale) - 32, 242 + Math.max(1, upgrades.length) * 44, 550),
    };
    const height = heights[activeSection] * scale;
    const top = (H - height) / 2;
    ctx.save();
    ctx.fillStyle = "rgba(5,8,20,0.66)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    region(0, 0, W, H, "pause:block");
    panel(left, top, width, height, { alpha: 0.96, border: "rgba(232,179,75,0.28)", radius: 10 * scale });
    text(titles[activeSection], cx, top + (landscape ? 39 : 46) * scale, {
      size: 26 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center",
    });
    const actionWidth = width - 40 * scale;
    const actions = { resume: null, quit: null, upgrades: null, settings: null, back: null, mute: null, motion: null, controls: null };
    const drawAction = (name, label, id, y, { x = cx, w = actionWidth, h = 48 * scale, primary = false, danger = false, fontSize = 16 } = {}) => {
      actions[name] = primaryActionButton(x, y, w, h, label, id, {
        selected: primary || focusOrder[focus] === id, focused: focusOrder[focus] === id,
        primary, danger, scale, fontSize,
      });
      return actions[name];
    };
    let scroll = null;
    const rows = [];
    if (activeSection === "main") {
      drawAction("resume", "계속하기", "pause:resume", top + (landscape ? 94 : 116) * scale, { h: 54 * scale, primary: true, fontSize: 18 });
      const gap = 12 * scale;
      const halfWidth = (actionWidth - gap) / 2;
      const secondaryY = top + (landscape ? 158 : 188) * scale;
      drawAction("upgrades", "강화 보기", "pause:upgrades", secondaryY, { x: cx - (halfWidth + gap) / 2, w: halfWidth });
      drawAction("settings", "설정", "pause:settings", secondaryY, { x: cx + (halfWidth + gap) / 2, w: halfWidth });
      drawAction("quit", "모험 종료", "pause:quit", top + height - 46 * scale, { danger: true, w: actionWidth * 0.76, fontSize: 15 });
    } else if (activeSection === "settings") {
      const firstY = top + (landscape ? 86 : 99) * scale;
      const rowGap = (landscape ? 51 : 60) * scale;
      drawAction("mute", `소리  ${muted ? "꺼짐" : "켜짐"}`, "system:mute", firstY);
      drawAction("motion", `화면 효과  ${reducedMotion ? "약하게" : "기본"}`, "system:motion", firstY + rowGap);
      drawAction("controls", "조작법", "pause:controls", firstY + rowGap * 2);
    } else if (activeSection === "controls") {
      const controls = touchInput
        ? [["이동", "좌우 버튼"], ["공격·방어", "길게 누르기"], ["점프·기술", "한 번 누르기"]]
        : [["이동", "A / D"], ["공격·방어", "J / S"], ["점프·기술", "W / K"], ["일시정지·소리", "P / M"]];
      const firstY = top + (landscape ? 83 : 97) * scale;
      controls.forEach(([label, value], index) => {
        const y = firstY + index * (landscape ? 36 : 40) * scale;
        text(label, left + 25 * scale, y, { size: 14 * scale, color: MUTED, weight: 650 });
        text(value, left + width - 25 * scale, y, { size: 15 * scale, color: TEXT, weight: 800, align: "right" });
      });
    } else if (activeSection === "upgrades") {
      const contentX = left + 24 * scale;
      const contentW = width - 48 * scale;
      text(weaponName, contentX, top + 85 * scale, { size: 17 * scale, color: "#fff2c8", weight: 850 });
      if (stats) {
        const stat = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "—";
        const cells = [["공격", stat(stats.power)], ["사거리", stat(stats.range)], ["초당", `${stat(stats.speed)}회`]];
        cells.forEach(([label, value], index) => {
          const x = contentX + index * contentW / 3;
          text(label, x, top + 111 * scale, { size: 14 * scale, color: MUTED, weight: 650 });
          text(value, x, top + 135 * scale, { size: 16 * scale, color: TEXT, weight: 850 });
        });
      }
      const rowHeight = 44 * scale;
      const viewport = { x: contentX, y: top + 153 * scale, w: contentW, h: Math.max(44 * scale, height - 237 * scale) };
      const contentHeight = Math.max(1, upgrades.length) * rowHeight;
      const maxOffset = Math.max(0, contentHeight - viewport.h);
      const offset = clamp(Number(scrollOffset) || 0, 0, maxOffset);
      scroll = { ...viewport, offset, maxOffset, contentHeight, rowHeight };
      ctx.save();
      ctx.beginPath();
      ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
      ctx.clip();
      if (!upgrades.length) {
        text("강화 없음", cx, viewport.y + 27 * scale, { size: 14 * scale, color: MUTED, align: "center" });
      }
      upgrades.forEach((upgrade, index) => {
        const y = viewport.y + index * rowHeight - offset;
        if (y + rowHeight <= viewport.y || y >= viewport.y + viewport.h) return;
        ctx.strokeStyle = "rgba(185,199,219,0.13)";
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(viewport.x, y + rowHeight - scale);
        ctx.lineTo(viewport.x + viewport.w - 10 * scale, y + rowHeight - scale);
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.rect(viewport.x, y, viewport.w - 54 * scale, rowHeight);
        ctx.clip();
        text(upgrade.name, viewport.x, y + rowHeight / 2, { size: 15 * scale, color: TEXT, weight: 700, baseline: "middle" });
        ctx.restore();
        if (upgrade.count > 1) text(`×${upgrade.count}`, viewport.x + viewport.w - 12 * scale, y + rowHeight / 2, {
          size: 14 * scale, color: GOLD, weight: 850, align: "right", baseline: "middle",
        });
        rows.push({ index, name: upgrade.name, count: upgrade.count || 1, x: viewport.x, y, w: viewport.w, h: rowHeight });
      });
      ctx.restore();
      if (maxOffset > 0) {
        const thumbH = Math.max(24 * scale, viewport.h * viewport.h / contentHeight);
        ctx.fillStyle = "rgba(232,179,75,0.6)";
        ctx.fillRect(viewport.x + viewport.w - 3 * scale, viewport.y + (viewport.h - thumbH) * offset / maxOffset, 2 * scale, thumbH);
      }
    }
    if (activeSection !== "main") drawAction("back", "이전으로", "pause:back", top + height - 43 * scale, { w: actionWidth * 0.78 });
    metrics.pause = {
      x: left, y: top, w: width, h: height, landscape, reducedMotion, muted,
      section: activeSection, focusOrder, focusedIndex: focus, ...actions, scroll, rows,
      upgradeNames: upgrades.map(upgrade => upgrade.name), shards: Math.max(0, Number(shards) || 0), touchInput,
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
    primary = ["preparation:start", "weapon:confirm", "forge:confirm", "results:retry", "pause:resume", "quit:continue", "preparation:buyHp", "preparation:buyGuard", "preparation:buyTicket"].includes(id),
  } = {}) {
    const box = primaryActionButton(cx, cy, w, h, label, id, {
      selected: primary || selected, focused: selected, primary,
      danger, disabled, scale, fontSize,
      showPlayIcon: id === "preparation:start",
    });
    return { ...box, selected, danger, disabled, primary };
  }

  // === run HUD ===
  function drawHud(s) {
    const mobile = Boolean(layoutState.portrait);
    const bounds = combatHudBounds();
    const left = bounds.left;
    const right = bounds.right;
    const centerX = snapCssX(W / 2);
    const scale = hudUiScale();
    const boundsCssWidth = bounds.width * (layoutState.cssScaleX || 1);
    const railT = mobile ? 0 : clamp((boundsCssWidth - 900) / 320, 0, 1);
    const stackedDesktop = !mobile && boundsCssWidth < 900;
    const statusUnits = mobile ? 194 : 240 + 36 * railT;
    const hasStageMeta = Boolean((s.stageType && s.stageType !== "normal") || (s.waveCount || 1) > 1);
    const hpFlash = s.hpFlashT < 0.5 ? Math.abs(Math.sin(s.hpFlashT * 24)) : 0;
    const status = snapCssRect(
      left + 10 * scale,
      (mobile ? hasStageMeta ? 54 : 42 : s.boss ? 112 : stackedDesktop ? 72 : 56) * scale,
      statusUnits * scale,
      (mobile ? 64 : 76) * scale,
    );
    const iconX = snapCssX(status.x + 14 * scale);
    const gaugeX = snapCssX(status.x + 61 * scale);
    const valueRight = snapCssX(status.x + status.w);
    const gaugeRight = snapCssX(valueRight - 62 * scale);
    const gaugeW = gaugeRight - gaugeX;
    const hpRow = snapCssRect(status.x, status.y, status.w, (mobile ? 20 : 24) * scale);
    const guardRow = snapCssRect(status.x, status.y + (mobile ? 22 : 26) * scale, status.w, (mobile ? 20 : 22) * scale);
    const mpRow = snapCssRect(status.x, status.y + (mobile ? 44 : 52) * scale, status.w, (mobile ? 20 : 22) * scale);
    const hpCenterY = snapCssY(hpRow.y + hpRow.h / 2);
    const guardCenterY = snapCssY(guardRow.y + guardRow.h / 2);
    const mpCenterY = snapCssY(mpRow.y + mpRow.h / 2);

    hudWash(status, { anchor: 0.26, strength: 0.62 });

    drawUiIcon("hp", iconX, hpCenterY, (mobile ? 24 : 28) * scale, { alpha: hpFlash > 0 ? 1 : 0.95 });
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
      const bossY = (mobile ? (s.mugetsuT > 0 || s.spearRageT > 0 ? 157 : 140) : 64) * scale;
      boss = snapCssRect(centerX - bossW / 2, bossY, bossW, 43 * scale);
      hudWash(boss, { anchor: 0.5, strength: 0.76 });
      text(s.boss.name || "폭풍 구름", boss.x + 4 * scale, boss.y + 10 * scale, { size: 10.5 * scale, color: "#ffe2a3", weight: 900, stroke: true });
      text(s.boss.action || "하강 중", boss.x + boss.w - 4 * scale, boss.y + 10 * scale, { size: 9 * scale, color: "#d1c4d4", weight: 800, align: "right", stroke: true });
      const hpRatio = clamp(s.boss.hp / Math.max(1, s.boss.maxHp), 0, 1);
      bar(boss.x + 4 * scale, boss.y + 19 * scale, boss.w - 8 * scale, 8 * scale, hpRatio, "#c83d54", "#f7b16e");
      text(`${Math.round(hpRatio * 100)}%`, boss.x + 4 * scale, boss.y + 40 * scale, { size: 9 * scale, color: "#ffdda5", weight: 850, stroke: true });
    }

    const score = snapCssRect(right - 96 * scale, (mobile ? 56 : stackedDesktop ? 56 : 18) * scale, 84 * scale, 62 * scale);
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
      approach = snapCssRect(cx - 58 * scale, y - 8 * scale, 116 * scale, (mobile ? 37 : 56) * scale);
      const pulse = 0.72 + Math.sin(s.t * 8) * 0.18;
      const progress = clamp(s.approach.progress || 0, 0, 1);
      drawUiIcon("down", cx, snapCssY(y + (mobile ? 1 : 6) * scale), (mobile ? 21 : 30) * scale, { alpha: pulse });
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = TEXT;
      const approachTrack = snapCssRect(cx - (mobile ? 28 : 48) * scale, y + (mobile ? 12 : 26) * scale, (mobile ? 56 : 96) * scale, 2 * scale);
      ctx.fillRect(approachTrack.x, approachTrack.y, approachTrack.w, approachTrack.h);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = s.stageType === "boss" ? "#ff8a8f" : GOLD;
      ctx.fillRect(approachTrack.x, approachTrack.y, snapCssX(approachTrack.w * progress), approachTrack.h);
      ctx.restore();
      text("적이 접근 중입니다", cx, snapCssY(y + (mobile ? 27 : 43) * scale), {
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
      const cy = snapCssY((mobile ? (s.boss ? 236 : 178) : stackedDesktop ? 206 : 184) * scale);
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
      text(learningHint, centerX, hintY + 20 * scale, { size: fitTextSize(learningHint, (mobile ? 12 : 10.5) * scale, hintW - 12 * scale), color: "#fff0c9", align: "center", weight: 850, stroke: true });
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
    focused = false,
    primary = true,
    danger = false,
    disabled = false,
  } = {}) {
    const left = cx - w / 2;
    const hover = pointer.x >= left && pointer.x <= left + w && pointer.y >= cy - h / 2 && pointer.y <= cy + h / 2;
    const active = !disabled && (selected || hover);
    const pressed = hover && pointer.down && !disabled;
    ctx.save();
    const glow = ctx.createLinearGradient(left, 0, left + w, 0);
    glow.addColorStop(0, "rgba(7,17,43,0)");
    const wash = disabled ? "rgba(12,24,54,0.2)" : pressed ? "rgba(31,48,78,0.9)" : active ? "rgba(12,24,54,0.68)" : "rgba(12,24,54,0.25)";
    glow.addColorStop(0.18, wash);
    glow.addColorStop(0.82, wash);
    glow.addColorStop(1, "rgba(7,17,43,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.strokeStyle = disabled ? "rgba(185,199,219,0.14)" : danger ? "rgba(255,122,122,0.75)" : active ? "rgba(255,218,126,0.9)" : "rgba(210,225,255,0.3)";
    ctx.lineWidth = active ? 2 * scale : 1 * scale;
    ctx.beginPath();
    ctx.moveTo(left + 18 * scale, cy + h / 2 - 1 * scale);
    ctx.lineTo(left + w - 18 * scale, cy + h / 2 - 1 * scale);
    ctx.stroke();
    if (showPlayIcon) {
      const playX = cx - 70 * scale;
      ctx.fillStyle = disabled ? "#707d96" : active ? GOLD : "#aaa6bb";
      ctx.beginPath();
      ctx.moveTo(playX - 5 * scale, cy - 8 * scale);
      ctx.lineTo(playX + 8 * scale, cy);
      ctx.lineTo(playX - 5 * scale, cy + 8 * scale);
      ctx.closePath();
      ctx.fill();
    }
    if (focused && !showPlayIcon && !disabled) {
      ctx.fillStyle = danger ? "#ffaaaa" : GOLD;
      ctx.fillRect(left + 8 * scale, cy - 2 * scale, 4 * scale, 4 * scale);
    }
    ctx.restore();
    text(label, cx + (showPlayIcon ? 10 * scale : 0), cy + 1 * scale, {
      size: fitTextSize(label, fontSize * scale, w - (showPlayIcon ? 70 : 30) * scale),
      color: disabled ? "#8190a9" : danger ? "#ffb2a8" : active ? "#fff8e5" : "#c0ccdf",
      weight: primary || active ? 900 : 700,
      align: "center",
      baseline: "middle",
    });
    region(left, cy - h / 2, w, h, id);
    return { x: left, y: cy - h / 2, w, h, id, label, selected, primary, focused, disabled, danger };
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

    const titleFrameRatio = (layoutState.cssFrameWidth || W) / (layoutState.cssFrameHeight || H);
    const portraitArt = titleFrameRatio < 0.62;
    const mediumPortraitArt = titleFrameRatio >= 0.62 && titleFrameRatio < 0.9;
    const keyArtName = portraitArt
      ? "title_keyart_mobile_v6"
      : mediumPortraitArt
        ? "title_keyart_medium_portrait_v7"
      : verticalTitle
        ? "title_keyart_square_v5"
        : "title_keyart_wide_v5";
    const keyArt = sprites[keyArtName];
    const artScale = Math.max(W / keyArt.width, H / keyArt.height);
    const artW = keyArt.width * artScale;
    const artH = keyArt.height * artScale;
    const artX = cx - artW / 2;
    const artY = (H - artH) / 2;

    ctx.save();
    if (verticalTitle) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#103d8f");
      sky.addColorStop(0.58, "#0a2b69");
      sky.addColorStop(1, "#041230");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
    }
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
    metrics.titleKeyArtDrawBox = {
      left: artX, right: artX + artW, top: artY, bottom: artY + artH,
      width: artW, height: artH, sourceWidth: keyArt.width, sourceHeight: keyArt.height,
    };
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
    const shortPortrait = portraitArt && (layoutState.cssFrameHeight || H) < 660;
    const logoW = verticalTitle
      ? mediumPortraitArt
        ? Math.min(bounds.width * 0.62, 360)
        : Math.min(bounds.width * (shortPortrait ? 0.6 : 0.69), 400)
      : cinematicWide ? 370 : 420;
    const logoH = logo.height / logo.width * logoW;
    const logoTop = shortPortrait ? 14 * baseUiScale() : verticalTitle ? H * 0.066 : cinematicWide ? 45 : 84;
    ctx.save();
    ctx.filter = "drop-shadow(0 5px 8px rgba(2,7,23,0.32))";
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
    const menuY = verticalTitle ? H - 142 * baseUiScale() : cinematicWide ? H - 210 * baseUiScale() : H - 186 * baseUiScale();
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

  function drawMenuHero(weaponId, cx, groundY, height, t = 0, maxWidth = Infinity) {
    const sprite = sprites[`idle_${weaponId}_v1`];
    if (!sprite) return null;
    const frame = idleFrameAt(t);
    const crop = { chokento: [28, 210, 306, 498], katana: [104, 174, 327, 498], axe: [96, 210, 377, 498], spear: [110, 118, 318, 498], bow: [161, 98, 449, 498] }[weaponId] || [0, 0, 480, 528];
    const sourceW = crop[2] - crop[0], sourceH = crop[3] - crop[1];
    const drawScale = Math.min(height / 350 * weaponCharacterScale(weaponId), maxWidth / sourceW, height / sourceH);
    const w = sourceW * drawScale, h = sourceH * drawScale;
    const x = cx - w / 2, y = groundY - (488 - crop[1]) * drawScale;
    const footX = x + (264 - crop[0]) * drawScale;
    ctx.save();
    ctx.fillStyle = "rgba(3,10,26,0.38)";
    ctx.beginPath();
    ctx.ellipse(footX, groundY + 3 * drawScale, 48 * drawScale, 7 * drawScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, frame % 4 * 480 + crop[0], Math.floor(frame / 4) * 528 + crop[1], sourceW, sourceH, x, y, w, h);
    ctx.restore();
    return { x, y, w, h, weaponId, frame, groundY };
  }

  function menuWash(strength = 0.4) {
    ctx.save();
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, `rgba(5,16,40,${strength})`);
    wash.addColorStop(0.45, "rgba(8,22,49,0.12)");
    wash.addColorStop(1, "rgba(3,11,29,0.8)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawPreparation({
    section = "main", weapon = null, bankShards = 0, ticketStock = 0,
    carryTickets = 0, carryLimit = 2, freeRerolls = 1, growthItems = [],
    ticketPrice = 50, focusedIndex = 0, notice = "", saveError = "",
    canTransact = true, enterT = 0, t = 0,
    assetsReady = true, assetsLoading = false, assetsFailed = false,
  } = {}) {
    const mobile = isMobileLayout(), landscape = isShortLandscape();
    const bounds = landscape ? shortLandscapeBounds(900) : safeBounds();
    const cx = bounds.cx, scale = baseUiScale();
    const height = H / scale;
    const balance = Math.max(0, Math.round(Number(bankShards) || 0));
    const stock = Math.max(0, Math.round(Number(ticketStock) || 0));
    const limit = Math.max(0, Math.round(Number(carryLimit) || 0));
    const carried = clamp(Math.round(Number(carryTickets) || 0), 0, limit);
    const free = Math.max(0, Math.round(Number(freeRerolls) || 0));
    const canWrite = canTransact !== false;
    const growth = growthItems.map(item => ({
      ...item,
      maxed: item.maxed === true || item.level >= item.maxLevel,
      canBuy: canWrite && !item.maxed && item.level < item.maxLevel && balance >= item.cost,
    }));
    const orders = { main: ["weapon", "growth", "tickets", "carryLess", "carryMore", "start", "back"], growth: ["buyHp", "buyGuard", "home"] };
    const focusOrder = orders[section] || orders.main;
    const focus = clamp(Math.round(focusedIndex) || 0, 0, focusOrder.length - 1);
    const selected = id => focusOrder[focus] === id;
    const boxes = {};
    const contentW = Math.min(bounds.width - 32 * scale, (mobile ? 480 : 880) * scale);
    const left = cx - contentW / 2;
    const title = section === "growth" ? "영구 성장" : "모험 준비";
    menuWash(0.5);
    text(title, cx, (landscape ? 34 : 45) * scale, { size: landscape ? 24 * scale : 27 * scale, font: SERIF, weight: 900, color: "#fff2d0", align: "center", spacing: 2 * scale });
    if (section !== "main") text(`파편 ${balance.toLocaleString("ko-KR")}`, cx, (landscape ? 58 : 77) * scale, { size: 14 * scale, color: "#b8d8ed", align: "center", weight: 700 });
    let hero = null;
    if (section === "main") {
      const weaponId = weapon?.id || "chokento";
      const stack = mobile && !landscape;
      const heroHeight = (stack ? clamp(height - 440, 128, 320) : landscape ? height - 148 : Math.min(height - 280, 390)) * scale;
      const groundY = stack ? 62 * scale + heroHeight : (landscape ? height - 77 : height - 208) * scale;
      const heroCx = stack ? cx : left + contentW * 0.24;
      if (sprites.bg_stage_v3 && !landscape) {
        const stage = sprites.bg_stage_v3;
        ctx.save();
        const earth = ctx.createLinearGradient(0, groundY, 0, H);
        earth.addColorStop(0, "rgba(9,20,37,0.32)");
        earth.addColorStop(0.55, "rgba(6,17,38,0.83)");
        earth.addColorStop(1, "#050e24");
        ctx.fillStyle = earth;
        ctx.fillRect(0, groundY, W, H - groundY);
        ctx.globalAlpha = 0.68;
        ctx.drawImage(stage, 0, 746, stage.width, Math.min(90, stage.height - 746), bounds.left, groundY, bounds.width, 29 * scale);
        ctx.restore();
      }
      hero = drawMenuHero(weaponId, heroCx, groundY, heroHeight, t, stack ? contentW * 0.94 : contentW * 0.47);
      if (!hero) text(assetsFailed ? "장비를 불러오지 못했습니다" : "장비 준비 중", heroCx, groundY - heroHeight / 2, { size: 14 * scale, align: "center", color: MUTED });
      const weaponY = groundY + (landscape ? 41 : 54) * scale;
      const weaponName = weapon?.name || WEAPON_LABEL[weaponId] || "장검";
      const nameWidth = measureTextWidth(weaponName, { size: 22 * scale, font: SERIF, weight: 900 });
      const changeWidth = measureTextWidth("변경 ›", { size: 14 * scale, weight: 750 });
      const weaponContentW = nameWidth + 20 * scale + changeWidth;
      const weaponW = Math.max(176 * scale, weaponContentW + 48 * scale);
      const nameX = heroCx - weaponContentW / 2;
      boxes.weapon = outlinedActionButton(heroCx, weaponY, weaponW, (landscape ? 44 : 48) * scale, "", "preparation:weapon", { selected: selected("weapon"), scale });
      text(weaponName, nameX, weaponY + 8 * scale, { size: 22 * scale, font: SERIF, color: "#fff2d0", weight: 900 });
      text("변경 ›", nameX + nameWidth + 20 * scale, weaponY + 6 * scale, { size: 14 * scale, color: selected("weapon") ? "#fff2d0" : MUTED, weight: 750 });
      boxes.weapon.weaponId = weaponId;
      boxes.weapon.label = `${weaponName} · 변경`;
      const navX = stack ? left : left + contentW * 0.52;
      const navW = stack ? contentW : contentW * 0.48;
      const navY = stack ? groundY + 116 * scale : (landscape ? 100 : Math.max(170, height * 0.34)) * scale;
      const navH = (landscape ? 78 : 90) * scale;
      const navGap = 12 * scale;
      const navCardW = (navW - navGap) / 2;
      text(`파편 ${balance.toLocaleString("ko-KR")}`, navX + navW / 2, navY - 12 * scale, { size: 14 * scale, color: "#b8d8ed", align: "center", weight: 750 });
      const access = (id, x, label, details, icon, disabled = false) => {
        const box = outlinedActionButton(x + navCardW / 2, navY + navH / 2, navCardW, navH, "", `preparation:${id}`, { selected: selected(id), disabled, scale });
        drawUiIcon(icon, x + 20 * scale, navY + (landscape ? 19 : 23) * scale, 25 * scale, { alpha: disabled ? 0.5 : 0.9 });
        text(label, x + 39 * scale, navY + (landscape ? 24 : 28) * scale, { size: 15 * scale, weight: 800, color: disabled ? "#94a7c2" : selected(id) ? "#fff2d0" : TEXT });
        details.forEach((detail, index) => text(detail, x + navCardW / 2, navY + ((landscape ? 47 : 53) + index * (landscape ? 18 : 21)) * scale, { size: fitTextSize(detail, 13 * scale, navCardW - 18 * scale), color: MUTED, align: "center" }));
        boxes[id] = box;
      };
      access("growth", navX, "성장", growth.map(item => `${item.name.replace("최대 ", "")} ${item.level}/${item.maxLevel}`), "hp");
      const canBuyTicket = canWrite && ticketPrice > 0 && balance >= ticketPrice;
      const purchaseLabel = !canWrite ? "저장 사용 불가" : canBuyTicket ? `구매 · ${ticketPrice} 파편` : `${ticketPrice} 파편 · ${Math.max(0, ticketPrice - balance)} 부족`;
      access("tickets", navX + navCardW + navGap, "새로고침", [`보유 ${stock}회`, purchaseLabel], "reroll", !canBuyTicket);
      boxes.tickets.price = ticketPrice;
      boxes.tickets.purchaseCount = 1;
      boxes.tickets.label = purchaseLabel;
      const carryY = navY + navH + (landscape ? 10 : 17) * scale;
      text(`새로고침 - 구매 ${carried}/${limit}`, navX + 4 * scale, carryY + 21 * scale, { size: 14 * scale, weight: 800, color: "#d2e7f5" });
      const rerollSummary = carried ? `새로고침 총 ${free + carried}회 · 무료 ${free} + 구매 ${carried}` : `무료 새로고침 ${free}회`;
      text(rerollSummary, navX + 4 * scale, carryY + 48 * scale, { size: fitTextSize(rerollSummary, 13 * scale, navW - 8 * scale), color: MUTED });
      boxes.carryLess = outlinedActionButton(navX + navW - 72 * scale, carryY + 16 * scale, 44 * scale, 44 * scale, "−", "preparation:carryLess", { selected: selected("carryLess"), disabled: !canWrite || carried <= 0, scale, fontSize: 22 });
      boxes.carryMore = outlinedActionButton(navX + navW - 23 * scale, carryY + 16 * scale, 44 * scale, 44 * scale, "+", "preparation:carryMore", { selected: selected("carryMore"), disabled: !canWrite || carried >= Math.min(limit, stock), scale, fontSize: 22 });
      const footerCx = stack ? cx : navX + navW / 2;
      const footerY = stack || landscape ? H - (landscape ? 40 : 64) * scale : Math.min(H - 110 * scale, carryY + 152 * scale);
      const startLabel = assetsFailed ? "다시 불러오기" : !assetsReady ? "장비 준비 중" : "모험 시작";
      boxes.start = outlinedActionButton(footerCx, footerY, Math.min(stack ? contentW : navW, 320 * scale), 58 * scale, startLabel, "preparation:start", { selected: selected("start"), disabled: !canWrite || (!assetsReady && !assetsFailed), primary: true, scale, fontSize: 20 });
      boxes.back = outlinedActionButton(bounds.left + 43 * scale, 30 * scale, 84 * scale, 44 * scale, "이전으로", "preparation:back", { selected: selected("back"), scale, fontSize: 13 });
      const message = saveError;
      if (message) text(message, footerCx, stack ? H - 14 * scale : footerY - 46 * scale, { size: fitTextSize(message, 13 * scale, stack ? contentW : navW), color: "#ffaaaa", align: "center" });
    } else {
      const panelW = Math.min(contentW, (landscape ? 750 : mobile ? 480 : 750) * scale);
      const panelX = cx - panelW / 2;
      const top = (landscape ? 76 : Math.max(110, Math.min(height * 0.2, 155))) * scale;
      const bottom = H - (landscape ? 68 : 122) * scale;
      const horizontal = landscape || !mobile;
      if (section === "growth") {
        const gap = 18 * scale;
        const rowH = Math.min((landscape ? 214 : 244) * scale, horizontal ? bottom - top : (bottom - top - gap) / 2);
        const cardW = horizontal ? (panelW - gap) / 2 : panelW;
        growth.forEach((item, i) => {
          const id = i === 0 ? "buyHp" : "buyGuard";
          const x = panelX + (horizontal ? i * (cardW + gap) : 0);
          const y = top + (horizontal ? 0 : i * (rowH + gap));
          panel(x, y, cardW, rowH, { alpha: 0.62, border: "rgba(184,206,226,.2)", radius: 4 * scale });
          drawUiIcon(i === 0 ? "hp" : "guard", x + 30 * scale, y + 33 * scale, 32 * scale);
          text(item.name, x + 55 * scale, y + 35 * scale, { size: 18 * scale, color: "#fff2d0", weight: 800 });
          text(`${item.level}/${item.maxLevel}`, x + cardW - 20 * scale, y + 35 * scale, { size: 13 * scale, color: MUTED, align: "right" });
          text(item.maxed ? `${item.current} · 최대 단계` : `${item.current}  →  ${item.next}`, x + cardW / 2, y + rowH * 0.47, { size: 24 * scale, color: "#c6edc5", weight: 800, align: "center" });
          const detail = item.maxed ? "성장 완료" : item.canBuy ? `구매 후 ${(balance - item.cost).toLocaleString("ko-KR")} 파편` : `${Math.max(0, item.cost - balance).toLocaleString("ko-KR")} 파편 부족`;
          text(detail, x + cardW / 2, y + rowH * 0.64, { size: 13 * scale, color: MUTED, align: "center" });
          const label = item.maxed ? "최대 단계" : !canWrite ? "저장 사용 불가" : `성장 · ${item.cost.toLocaleString("ko-KR")} 파편`;
          boxes[id] = outlinedActionButton(x + cardW / 2, y + rowH - 28 * scale, cardW - 20 * scale, 46 * scale, label, `preparation:${id}`, { selected: selected(id), disabled: item.maxed || !item.canBuy, scale, fontSize: 15 });
          boxes[id].itemId = item.id;
        });
      }
      const message = saveError || notice || (section === "growth" ? "다음 모험부터 적용" : "");
      text(message, cx, H - (landscape ? 56 : 92) * scale, { size: fitTextSize(message, 13 * scale, panelW), color: saveError ? "#ffaaaa" : MUTED, align: "center" });
      boxes.home = outlinedActionButton(cx, H - (landscape ? 25 : 51) * scale, 220 * scale, 44 * scale, "이전으로", "preparation:home", { selected: selected("home"), scale, fontSize: 15 });
    }
    metrics.preparation = {
      section, focusedIndex: focus, focusedId: focusOrder[focus] || null, focusOrder,
      balance, ticketStock: stock, carryTickets: carried, carryLimit: limit, freeRerolls: free,
      growthItems: growth.map(({ id, name, level, maxLevel, maxed, cost, canBuy }) => ({ id, name, level, maxLevel, maxed, cost, canBuy })),
      boxes, hero, notice: (section === "main" ? saveError : saveError || notice) || null, saveError: saveError || null,
      canTransact: canWrite, enterT: Number(enterT) || 0, landscape,
      assetsReady, assetsLoading, assetsFailed,
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

  function drawWeaponSelectLandscape(data) {
    drawWeaponSelectionComposition(data, true);
  }

  function drawWeaponSelectionComposition({
    weapons = [], index = 0, t = 0, deniedT = 0, assetsLoading = false, assetsFailed = false,
    preparation = null, bankShards = null, ticketStock = null, carryTickets = null,
  }, landscape = false) {
    const prep = preparation || (bankShards !== null || ticketStock !== null || carryTickets !== null ? {
      bankShards: Math.max(0, Number(bankShards) || 0), ticketStock: Math.max(0, Number(ticketStock) || 0),
      carryTickets: Math.max(0, Number(carryTickets) || 0),
    } : null);
    const bounds = landscape ? shortLandscapeBounds(780) : safeBounds();
    const mobile = !landscape && isMobileLayout();
    const scale = baseUiScale() * (!mobile && !landscape ? Math.min(1.12, (layoutState.cssFrameHeight || 800) / 720) : 1);
    const cssH = H / scale;
    const compact = mobile && cssH < 660;
    const contentW = Math.min(bounds.width - (landscape ? 0 : 24) * scale, (mobile ? 460 : 860) * scale);
    const left = bounds.cx - contentW / 2;
    const cx = bounds.cx;
    const sel = weapons[index] || weapons[0];
    if (!sel) return;
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, "rgba(7,13,34,0.16)");
    wash.addColorStop(0.46, "rgba(7,13,34,0.53)");
    wash.addColorStop(1, "rgba(7,13,34,0.81)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
    const titleY = (landscape ? 29 : compact ? 38 : 47) * scale;
    text("무기 선택", cx, titleY, {
      size: (landscape ? 25 : compact ? 25 : 28) * scale, color: "#fff2c8", font: SERIF,
      weight: 900, align: "center", spacing: 3 * scale,
    });
    let preparationAccess = null;
    if (prep) preparationAccess = outlinedActionButton(left + 32 * scale, titleY - 10 * scale,
      76 * scale, 44 * scale, "이전으로", "weapon:preparation", { scale, fontSize: 12, primary: false });
    const status = assetsLoading ? "모험 장비를 준비하는 중" : assetsFailed ? "장비를 불러오지 못했습니다 · 다시 시도해 주세요" : "";
    if (status) text(status, cx, titleY + 23 * scale, {
      size: (landscape ? 11 : 12) * scale, color: assetsFailed ? "#ffb0b3" : "#ffe2a3", weight: 750, align: "center",
    });

    const gap = (mobile ? 5 : 11) * scale;
    const slotY = (landscape ? 66 : compact ? 73 : 92) * scale;
    const slotH = (landscape ? 64 : compact ? 73 : mobile ? 83 : 96) * scale;
    const slotW = (contentW - gap * Math.max(0, weapons.length - 1)) / Math.max(1, weapons.length);
    const slotBoxes = [];
    weapons.forEach((weapon, i) => {
      const enter = clamp((t - i * 0.04) / 0.24, 0, 1);
      const selected = i === index;
      const x = left + i * (slotW + gap);
      const shake = selected && weapon.locked && deniedT > 0 ? Math.sin(t * 60) * 2 * scale : 0;
      const y = slotY + (1 - easeOutCubic(enter)) * 8 * scale;
      const cardCx = x + shake + slotW / 2;
      const iconSize = (landscape ? 29 : compact ? 31 : mobile ? 39 : 51) * scale;
      const iconY = y + (landscape ? 22 : compact ? 25 : mobile ? 29 : 33) * scale;
      const nameSize = (mobile ? compact ? 11.5 : 12.5 : landscape ? 13 : 15) * scale;
      const nameY = y + slotH - (landscape ? 9 : 12) * scale;
      const rotation = ["chokento", "katana"].includes(weapon.id) ? -Math.PI * 3 / 4 : 0;
      ctx.save();
      ctx.globalAlpha = enter;
      drawUiFrame("weaponFrame", x + shake, y, slotW, slotH, {
        alpha: selected ? 1 : weapon.locked ? 0.28 : 0.52,
      });
      ctx.globalAlpha *= selected ? 1 : weapon.locked ? 0.52 : 0.8;
      if (sprites[WEAPON_SPRITE[weapon.id]]) weaponIcon(weapon.id, cardCx, iconY, iconSize, { rotation });
      text(weapon.name, cardCx, nameY, {
        size: nameSize, color: selected ? "#ffe2a3" : "#d6d9e6", weight: selected ? 900 : 750, align: "center",
      });
      const lockBox = weapon.locked ? {
        x: x + slotW - 18 * scale, y: y + 4 * scale, w: 14 * scale, h: 14 * scale,
      } : null;
      if (lockBox) drawUiIcon("lock", lockBox.x + lockBox.w / 2, lockBox.y + lockBox.h / 2, lockBox.w, { alpha: 0.9 });
      ctx.restore();
      region(x, y, slotW, slotH, `weapon:${i}`);
      slotBoxes.push({
        x, y, w: slotW, h: slotH, selected, locked: Boolean(weapon.locked), displayRotation: rotation,
        content: {
          weapon: { x: cardCx - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          name: { x: x + 4 * scale, y: nameY - nameSize, w: slotW - 8 * scale, h: nameSize * 1.2 },
          lock: lockBox,
        },
      });
    });

    const infoY = slotY + slotH + (landscape ? 17 : compact ? 15 : 25) * scale;
    const infoX = left;
    const infoW = contentW;
    const role = sel.role || WEAPON_ROLE[sel.id] || "";
    const rotation = ["chokento", "katana"].includes(sel.id) ? -Math.PI * 3 / 4 : 0;
    let titleBox;
    let statsBox;
    let detailX;
    let detailY;
    let detailW;
    let preview;
    const stats = [["공격력", String(Math.round(sel.damage || 0))], ["사거리", String(Math.round(sel.range || 0))], ["공격 속도", attackSpeedLabel(sel)]];
    const drawStats = (x, y, w, small = false) => {
      stats.forEach(([label, value], i) => {
        const xx = x + w * i / 3;
        text(label, xx, y, { size: (small ? 11.5 : mobile ? 12 : 13) * scale, color: "#bcc9df", weight: 750 });
        text(value, xx, y + (small ? 20 : 25) * scale, {
          size: (small ? 16 : mobile ? 18 : 20) * scale, color: "#fff2c8", weight: 900,
        });
      });
      return { x, y: y - 15 * scale, w, h: (small ? 40 : 48) * scale };
    };
    const infoTitle = sel.locked ? `${sel.name} · 잠김` : sel.name;
    if (mobile) {
      const previewH = (compact ? 99 : clamp((cssH - 540) * 0.4 + 105, 150, 214)) * scale;
      if (compact) {
        const iconSize = 94 * scale;
        preview = { x: left + 9 * scale, y: infoY + 2 * scale, w: 96 * scale, h: 96 * scale };
        if (sprites[WEAPON_SPRITE[sel.id]]) weaponIcon(sel.id, preview.x + preview.w / 2, preview.y + preview.h / 2, iconSize, { rotation });
        const titleX = left + 118 * scale;
        const titleSize = 25 * scale;
        text(infoTitle, titleX, infoY + 31 * scale, { size: titleSize, color: "#ffe2a3", font: SERIF, weight: 900 });
        wrapText(role, titleX, infoY + 57 * scale, contentW - 118 * scale, 14 * scale, "#d8e1f0", 4 * scale, "left", 700);
        titleBox = { x: titleX, y: infoY + 7 * scale, w: contentW - 118 * scale, h: 29 * scale };
      } else {
        const titleSize = 29 * scale;
        text(infoTitle, cx, infoY + 27 * scale, { size: titleSize, color: "#ffe2a3", font: SERIF, weight: 900, align: "center" });
        text(role, cx, infoY + 53 * scale, { size: 14 * scale, color: "#d8e1f0", weight: 750, align: "center" });
        const iconSize = Math.min(146 * scale, previewH - 66 * scale);
        const iconY = infoY + 68 * scale + (previewH - 68 * scale) / 2;
        if (sprites[WEAPON_SPRITE[sel.id]]) weaponIcon(sel.id, cx, iconY, iconSize, { rotation });
        preview = { x: cx - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize };
        titleBox = { x: left, y: infoY, w: contentW, h: 37 * scale };
      }
      const statsY = infoY + previewH + (compact ? 13 : 21) * scale;
      statsBox = drawStats(left + 12 * scale, statsY, contentW - 24 * scale, compact);
      detailX = left + 12 * scale;
      detailY = statsY + (compact ? 52 : 62) * scale;
      detailW = contentW - 24 * scale;
    } else {
      const iconSize = (landscape ? 124 : 278) * scale;
      const previewW = contentW * (landscape ? 0.22 : 0.36);
      const iconX = left + previewW / 2;
      const iconY = infoY + (landscape ? 78 : 162) * scale;
      if (sprites[WEAPON_SPRITE[sel.id]]) weaponIcon(sel.id, iconX, iconY, iconSize, { rotation });
      preview = { x: iconX - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize };
      detailX = left + previewW + 20 * scale;
      detailW = contentW - previewW - 38 * scale;
      const titleSize = (landscape ? 25 : 33) * scale;
      text(infoTitle, detailX, infoY + 25 * scale, { size: titleSize, color: "#ffe2a3", font: SERIF, weight: 900 });
      text(role, detailX, infoY + (landscape ? 48 : 55) * scale, {
        size: (landscape ? 13 : 16) * scale, color: "#d8e1f0", weight: 750,
      });
      titleBox = { x: detailX, y: infoY, w: detailW, h: 38 * scale };
      if (landscape) {
        statsBox = drawStats(detailX + detailW * 0.45, infoY + 8 * scale, detailW * 0.55, true);
        detailY = infoY + 77 * scale;
      } else {
        statsBox = drawStats(detailX, infoY + 95 * scale, detailW);
        detailY = infoY + 159 * scale;
      }
    }
    const detailSize = (landscape ? 13 : mobile ? 14 : 16) * scale;
    let lastDetailY = detailY;
    if (sel.locked) {
      text("해금 조건", detailX, detailY, { size: detailSize, color: "#e7bd73", weight: 900 });
      lastDetailY = wrapText(sel.unlock?.label || "도전을 계속하면 해금", detailX, detailY + (landscape ? 22 : 26) * scale,
        detailW, detailSize, "#fff2c8", 4 * scale, "left", 750);
      if (sel.unlockProgress) {
        const progress = sel.unlockProgress;
        const target = Math.max(0, Number(progress.target || sel.unlock?.threshold) || 0);
        const value = Math.min(Math.max(0, Number(progress.value) || 0), target);
        lastDetailY += (landscape ? 23 : 29) * scale;
        text(`현재 ${value.toLocaleString("ko-KR")} / ${target.toLocaleString("ko-KR")}`, detailX, lastDetailY, {
          size: (landscape ? 12 : 13) * scale, color: "#bde4f4", weight: 800,
        });
        bar(detailX, lastDetailY + 12 * scale, detailW, 4 * scale, target ? value / target : 0, "#548bc5", "#c3eaff");
        lastDetailY += 17 * scale;
      }
    } else {
      if (sel.trait) lastDetailY = wrapText(sel.trait, detailX, detailY, detailW, detailSize, "#e2e7ef", 5 * scale, "left", 700);
      if (sel.skill) {
        lastDetailY += (landscape ? 23 : compact ? 22 : 29) * scale;
        text(`기술 · ${sel.skill}`, detailX, lastDetailY, { size: detailSize, color: "#bfe8ff", weight: 900 });
        lastDetailY = wrapText(sel.skillDesc || "", detailX, lastDetailY + (landscape ? 20 : 24) * scale,
          detailW, detailSize, "#d7e0ef", 5 * scale, "left", 650);
        if (sel.bossSkillDesc) lastDetailY = wrapText(sel.bossSkillDesc, detailX, lastDetailY + (landscape ? 20 : 24) * scale,
          detailW, (landscape ? 12 : 13) * scale, "#d9c79f", 4 * scale, "left", 650);
      }
    }
    const confirmH = (landscape ? 45 : 52) * scale;
    const confirmY = H - (landscape ? 29 : compact ? 37 : 61) * scale;
    const confirmW = Math.min(contentW, (landscape ? 328 : mobile ? 296 : 364) * scale);
    const label = assetsFailed ? "다시 시도" : assetsLoading ? "장비 준비 중" : sel.locked ? "아직 잠긴 무기" : "무기 선택";
    const confirmBox = outlinedActionButton(cx, confirmY, confirmW, confirmH, label, "weapon:confirm", {
      selected: !sel.locked && !assetsLoading, primary: true, disabled: !assetsFailed && (sel.locked || assetsLoading),
      scale, fontSize: landscape ? 16 : 18,
    });
    metrics.weaponSelect = {
      assetsLoading, assetsFailed, role, unlockProgress: sel.unlockProgress || null, columns: weapons.length,
      title: { x: cx - 120 * scale, y: titleY - 30 * scale, w: 240 * scale, h: 55 * scale },
      slots: slotBoxes, preview,
      info: { x: infoX, y: infoY, w: infoW, h: Math.max(preview.y + preview.h - infoY, lastDetailY + 10 * scale - infoY),
        content: { title: titleBox, stats: statsBox, detail: { x: detailX, y: detailY - detailSize, w: detailW, h: lastDetailY - detailY + detailSize + 10 * scale } },
      },
      confirm: confirmBox, preparation: prep ? { ...prep, access: preparationAccess } : null, landscape, compact,
    };
  }

  function drawWeaponSelect(data) {
    if (isShortLandscape()) {
      drawWeaponSelectLandscape(data);
      return;
    }
    drawWeaponSelectionComposition(data);
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

    const [sourceX, sourceY, sourceW, sourceH] = grid.gemRect || [grid.x[centerColumn], grid.y[0],
      grid.x[centerColumn + 1] - grid.x[centerColumn], grid.y[1] - grid.y[0]];
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

  function drawForgeRankGem(rankKey, x, y, w, h, alpha, selected, preferredScale = null) {
    const record = uiAtlas?.frame?.frames?.forgeFrame;
    const grid = uiAtlas?.frame?.sliceGrid?.forgeFrame;
    const style = RANK_STYLE[rankKey] || RANK_STYLE.common;
    if (!record?.rect || !grid) return { x: x + w / 2 - 1, y, w: 2, h: 2 };
    const frameScale = frameScaleFor(record, grid, w, h, preferredScale);
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
    const drawY = y + row.target + (grid.gemRect?.[1] || 0) * frameScale;
    const drawW = sprite.canvas.width * frameScale;
    const drawH = sprite.canvas.height * frameScale;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.shadowColor = style.neonColor || "rgba(0,0,0,0)";
    ctx.shadowBlur = style.neonColor && selected ? 10 * frameScale : 0;
    ctx.drawImage(sprite.canvas, drawX, drawY, drawW, drawH);
    ctx.shadowBlur = 0;
    ctx.drawImage(sprite.canvas, drawX, drawY, drawW, drawH);
    ctx.restore();
    return {
      x: drawX + sprite.bbox.x * frameScale,
      y: drawY + sprite.bbox.y * frameScale,
      w: sprite.bbox.w * frameScale,
      h: sprite.bbox.h * frameScale,
    };
  }

  function drawForgeLandscape(options) {
    // Share card content and action semantics with the taller compositions.
    return drawForge({ ...options, landscape: true });
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
    saveError = "",
    landscape = false,
  }) {
    const freeCount = Math.max(0, Math.round(Number(freeRerolls === null ? rerolls : freeRerolls) || 0));
    const purchasedCount = Math.max(0, Math.round(Number(purchasedRerolls === null ? (carriedRerolls === null ? 0 : carriedRerolls) : purchasedRerolls) || 0));
    if (isShortLandscape() && !landscape) {
      return drawForgeLandscape({
        cards, selected, freeRerolls: freeCount, purchasedRerolls: purchasedCount,
        stackOf, deniedT, enterT, t, stage, rewardNote, previewOf, canReroll,
        reducedMotion, deniedReason, saveError,
      });
    }
    const bounds = landscape ? shortLandscapeBounds(760) : safeBounds();
    const cx = bounds.cx;
    const scale = baseUiScale();
    const mobile = !landscape && isMobileLayout();
    const cssHeight = H / scale;
    const lowStack = mobile && cssHeight < 700 && bounds.width / scale >= 540;
    const compactStack = mobile && cssHeight < 740 && bounds.width / scale < 540;
    const frameScale = (compactStack || lowStack ? 0.28 : mobile || landscape ? 0.38 : 0.62) * scale;
    const contentTopOffset = (mobile || landscape ? 12 : 16) * scale;
    const previewBottom = Math.max(17 * scale, 54 * frameScale);
    const gap = (compactStack ? 8 : mobile ? 10 : 16) * scale;
    const cardW = mobile
      ? Math.min((lowStack ? 650 : 560) * scale, bounds.width - 28 * scale)
      : (bounds.width - (landscape ? 0 : 40 * scale) - gap * 2) / 3;
    const stageText = "스테이지 " + (stage + 1) + " 클리어";
    const rewardText = rewardNote || "하나를 골라 무기에 새긴다";
    const totalRerolls = freeCount + purchasedCount;
    const rerollDisabled = canReroll === null ? totalRerolls <= 0 : !canReroll;
    const failure = String(saveError || deniedReason || "").trim();

    // The small heading and the ticket control occupy separate rows on phones.
    const headerW = Math.min(292 * scale, bounds.width - 28 * scale);
    const stageSize = (compactStack ? 10 : 12) * scale;
    const titleSize = (compactStack ? 18 : landscape ? 26 : 28) * scale;
    const rewardSize = (compactStack ? 12 : 14) * scale;
    const stageY = (compactStack ? 12 : 16) * scale;
    const titleY = (compactStack ? 37 : 51) * scale;
    const ornamentY = (compactStack ? 46 : 64) * scale;
    const rewardY = (compactStack ? 63 : 88) * scale;
    text(stageText, cx, stageY, { size: stageSize, color: "#c0ccdf", align: "center", weight: 750 });
    text("단조", cx, titleY, { size: titleSize, color: TEXT, font: SERIF, weight: 900, align: "center", spacing: 4 * scale });
    ctx.save();
    ctx.strokeStyle = "rgba(232,179,75,0.56)";
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(cx - 54 * scale, ornamentY);
    ctx.lineTo(cx + 54 * scale, ornamentY);
    ctx.stroke();
    ctx.restore();
    text(rewardText, cx, rewardY, { size: rewardSize, color: rewardNote ? GOLD : "#c0ccdf", align: "center", weight: 650 });
    const headerBox = { x: cx - headerW / 2, y: 0, w: headerW, h: (compactStack ? 70 : 94) * scale };
    const measuredBox = (label, y, size, options = {}) => {
      const w = measureTextWidth(label, { size, ...options });
      return { x: cx - w / 2, y: y - size, w, h: size * 1.2 };
    };
    const quit = outlinedActionButton(bounds.left + 36 * scale, 29 * scale, 72 * scale, 44 * scale, "종료", "pause:quit", {
      danger: true, scale, fontSize: 14,
    });

    const previews = cards.map(card => {
      const value = previewOf?.(card.id);
      if (typeof value === "string") return value === card.desc ? "고유 효과 추가" : value;
      return value ? value.label + "  " + value.before + " → " + value.after : "고유 효과 추가";
    });
    const bodyXInset = (lowStack ? 106 : 16) * scale;
    const bodyWidth = cardW - bodyXInset - 16 * scale;
    const bodySize = (mobile || landscape ? 14 : 15) * scale;
    const lineGap = 4 * scale;
    const countLines = (label, width, size, weight = 650) => {
      let lines = 1;
      let line = "";
      for (const word of String(label).split(" ")) {
        const candidate = line ? line + " " + word : word;
        if (line && measureTextWidth(candidate, { size, weight }) > width) {
          lines += 1;
          line = word;
        } else line = candidate;
      }
      return lines;
    };
    const descriptionYInset = (compactStack ? 58 : lowStack ? 76 : landscape ? 78 : mobile ? 83 : 211) * scale + contentTopOffset;
    const previewSize = 14 * scale;
    const contentHeights = cards.map((card, index) => {
      const descLines = countLines(card.desc, bodyWidth, bodySize);
      const previewLines = countLines(previews[index], bodyWidth, previewSize, 850);
      return descriptionYInset + (descLines - 1) * (bodySize + lineGap)
        + 26 * scale + (previewLines - 1) * (previewSize + lineGap) + previewBottom - 2 * scale;
    });
    const compactCardHeight = clamp((cssHeight - 170) / 3, 110, 150);
    const cardH = Math.max((compactStack ? compactCardHeight : lowStack ? 120 : landscape ? 192 : mobile ? 162 : 338) * scale, ...contentHeights);
    const startY = (compactStack ? 76 : landscape ? 112 : lowStack ? 104 : mobile ? 152 : 170) * scale;
    const rowWidth = mobile ? cardW : cardW * 3 + gap * 2;
    const startX = cx - rowWidth / 2;
    const cardBoxes = [];

    cards.forEach((card, i) => {
      const rank = RANK_STYLE[card.rank] || RANK_STYLE.common;
      const selectedCard = i === selected;
      const enter = reducedMotion ? 1 : clamp((enterT - i * 0.05) / 0.24, 0, 1);
      const x = startX + (mobile ? 0 : i * (cardW + gap));
      const y = startY + (mobile ? i * (cardH + gap) : 0);
      const inset = (landscape ? 14 : 16) * scale;
      const iconSize = (compactStack ? 24 : landscape ? 36 : lowStack ? 62 : mobile ? 46 : 82) * scale;
      const iconX = mobile || landscape ? x + inset + iconSize / 2 : x + cardW / 2;
      const iconY = y + (mobile || landscape ? 15 * scale + iconSize / 2 : 68 * scale) + contentTopOffset;
      const titleX = mobile || landscape ? x + (compactStack ? 52 : lowStack ? 106 : landscape ? 66 : 78) * scale : x + cardW / 2;
      const titleY = y + (compactStack ? 31 : mobile || landscape ? 31 : 146) * scale + contentTopOffset;
      const titleW = mobile || landscape ? x + cardW - (compactStack ? 100 : 34) * scale - titleX : cardW - 40 * scale;
      const nameSize = fitTextSize(card.name, (compactStack || landscape ? 18 : mobile ? 20 : 23) * scale, titleW, { font: SERIF, weight: 900, minSize: 18 * scale });
      const titleWidth = measureTextWidth(card.name, { size: nameSize, font: SERIF, weight: 900 });
      const align = mobile || landscape ? "left" : "center";
      const stack = stackOf?.(card.id) || 0;
      const scopeLabel = (card.weapon ? (WEAPON_LABEL[card.weapon] || card.weapon) + " 전용" : "모든 무기")
        + (!card.unique && stack > 0 ? " · " + stack + "회 적용" : "");
      const scopeSize = (compactStack ? 11 : mobile || landscape ? 12 : 14) * scale;
      const scopeWidth = compactStack ? measureTextWidth(scopeLabel, { size: scopeSize, weight: 650 }) : titleW;
      const scopeX = compactStack ? x + cardW - 34 * scale - scopeWidth : titleX;
      const scopeY = y + (compactStack ? 30 : mobile || landscape ? 55 : 178) * scale + contentTopOffset;
      const descX = x + bodyXInset;
      const descY = y + descriptionYInset;
      const previewText = previews[i];
      const previewLines = countLines(previewText, bodyWidth, previewSize, 850);
      const previewY = y + cardH - previewBottom - (previewLines - 1) * (previewSize + lineGap);

      ctx.save();
      ctx.globalAlpha = enter;
      const atlasFrame = drawUiFrame("forgeFrame", x, y, cardW, cardH, {
        alpha: selectedCard ? 1 : 0.72, frameScale,
      });
      if (!atlasFrame) panel(x, y, cardW, cardH, { alpha: 0.8 });
      const gemBox = drawForgeRankGem(card.rank, x, y, cardW, cardH, selectedCard ? 1 : 0.72, false, frameScale);
      forgeCardIcon(card.id, iconX, iconY, iconSize / 80);
      text(card.name, titleX, titleY, { size: nameSize, color: selectedCard ? "#fff3cc" : TEXT, font: SERIF, weight: 900, align });
      text(scopeLabel, scopeX, scopeY, { size: scopeSize, color: "#bfcee2", weight: 650, align });
      const descriptionLastY = wrapText(card.desc, descX, descY, bodyWidth, bodySize, TEXT, lineGap, "left", 650);
      const previewLastY = wrapText(previewText, descX, previewY, bodyWidth, previewSize, "#bcebb6", lineGap, "left", 850);
      ctx.restore();
      region(x, y, cardW, cardH, "forge:" + i);
      cardBoxes.push({
        x, y, w: cardW, h: cardH, selected: selectedCard, rank: card.rank, preview: previewText,
        frame: { atlas: atlasFrame, name: "forgeFrame", scale: frameScale, edgeMode: "repeat" },
        rarityVisual: {
          gemColor: rank.gemColor, neonColor: rank.neonColor,
          glowEligible: Boolean(rank.neonColor), glowVisible: false, glowMode: "none",
          glowOrigin: null, glowRays: 0, glowPrimaryRays: 0, glowPrimaryRayWidth: 0,
          glowRim: false, glowRotates: false, glowRotation: null, glowRotationSpeed: 0,
          glowAttachmentInset: null, labelVisible: false,
        },
        content: {
          icon: { x: iconX - iconSize / 2, y: iconY - iconSize / 2, w: iconSize, h: iconSize },
          title: { x: align === "left" ? titleX : titleX - titleWidth / 2, y: titleY - nameSize, w: titleWidth, h: nameSize * 1.2 },
          gem: gemBox,
          scope: { x: align === "left" ? scopeX : scopeX - scopeWidth / 2, y: scopeY - scopeSize, w: scopeWidth, h: scopeSize * 1.2 },
          description: { x: descX, y: descY - bodySize, w: bodyWidth, h: descriptionLastY - descY + bodySize * 1.2 },
          preview: { x: descX, y: previewY - previewSize, w: bodyWidth, h: previewLastY - previewY + previewSize * 1.2 },
        },
      });
    });

    const cardBottom = startY + (mobile ? cards.length * cardH + Math.max(0, cards.length - 1) * gap : cardH);
    const rerollW = compactStack ? (cardW - 8 * scale) / 2 : (landscape ? 206 : lowStack ? 260 : Math.min(330, cardW / scale)) * scale;
    const rerollX = landscape ? bounds.right - rerollW : compactStack || lowStack ? startX : cx - rerollW / 2;
    const rerollY = landscape ? 61 * scale : compactStack ? cardBottom + 32 * scale : lowStack ? cardBottom + 36 * scale : 101 * scale;
    const rerollH = 44 * scale;
    const buttonW = compactStack ? rerollW : (landscape ? 92 : 110) * scale;
    outlinedActionButton(rerollX + buttonW / 2, rerollY + rerollH / 2, buttonW, rerollH, "새로고침", "forge:reroll", {
      disabled: rerollDisabled, scale, fontSize: 14, primary: false,
    });
    const countLabel = "무료 " + freeCount + " · 구매 " + purchasedCount;
    const countX = compactStack ? cx : rerollX + buttonW + 9 * scale;
    text(compactStack && failure ? failure : countLabel, countX, compactStack ? cardBottom + 21 * scale : rerollY + 26 * scale, {
      size: 14 * scale, color: compactStack && failure ? "#ffb2a8" : rerollDisabled ? "#9cadc5" : "#bfe7f6", weight: 750,
      align: compactStack ? "center" : "left",
    });
    region(rerollX, rerollY, rerollW, rerollH, "forge:reroll");

    let confirm;
    let failureBox = null;
    if (compactStack) {
      confirm = primaryActionButton(startX + cardW - rerollW / 2, rerollY + 22 * scale, rerollW, 44 * scale, "이 강화 적용", "forge:confirm", { primary: true, scale, fontSize: 16 });
      if (failure) failureBox = { x: startX, y: cardBottom + 7 * scale, w: cardW, h: 17 * scale };
    } else if (landscape) {
      confirm = primaryActionButton(cx, Math.min(cssHeight - 28, 345) * scale, 304 * scale, 48 * scale, "이 강화 적용", "forge:confirm", { primary: true, scale, fontSize: 18 });
      if (failure) {
        const errorW = Math.max(150 * scale, (bounds.width - confirm.w) / 2 - 16 * scale);
        const y = cardBottom + 23 * scale;
        const lastY = wrapText(failure, bounds.left, y, errorW, 14 * scale, "#ffb2a8", 4 * scale, "left", 750);
        failureBox = { x: bounds.left, y: y - 14 * scale, w: errorW, h: lastY - y + 17 * scale };
      }
    } else if (lowStack) {
      confirm = primaryActionButton(startX + cardW - 132 * scale, rerollY + 22 * scale, 264 * scale, 48 * scale, "이 강화 적용", "forge:confirm", { primary: true, scale, fontSize: 18 });
      if (failure) {
        text(failure, cx, cardBottom + 22 * scale, { size: 14 * scale, color: "#ffb2a8", align: "center", weight: 750 });
        failureBox = { x: startX, y: cardBottom + 8 * scale, w: cardW, h: 17 * scale };
      }
    } else {
      const failureWidth = Math.min(bounds.width - 32 * scale, 540 * scale);
      const failureLines = failure ? countLines(failure, failureWidth, 14 * scale, 750) : 1;
      const footerY = cardBottom + (58 + Math.max(0, failureLines - 1) * 18) * scale;
      confirm = primaryActionButton(cx, footerY, Math.min(bounds.width - 48 * scale, 330 * scale), 56 * scale, "이 강화 적용", "forge:confirm", { primary: true, scale, fontSize: mobile ? 18 : 20 });
      if (failure) {
        const lastY = wrapText(failure, cx, cardBottom + 22 * scale, failureWidth, 14 * scale, "#ffb2a8", 4 * scale, "center", 750);
        failureBox = { x: bounds.left + 16 * scale, y: cardBottom + 8 * scale, w: bounds.width - 32 * scale, h: lastY - cardBottom - 22 * scale + 17 * scale };
      }
    }
    metrics.forge = {
      rewardText,
      header: headerBox,
      headerContent: {
        stage: measuredBox(stageText, stageY, stageSize, { weight: 750 }),
        title: measuredBox("단조", titleY, titleSize, { font: SERIF, weight: 900, spacing: 4 * scale }),
        ornament: { x: cx - 54 * scale, y: ornamentY - 0.5 * scale, w: 108 * scale, h: scale },
        reward: measuredBox(rewardText, rewardY, rewardSize, { weight: 650 }),
      },
      cards: cardBoxes, confirm, quit, failure: failureBox,
      reroll: {
        x: rerollX, y: rerollY, w: rerollW, h: rerollH, count: totalRerolls,
        free: freeCount, purchased: purchasedCount, currency: "ticket", disabled: rerollDisabled,
        deniedReason: failure || null, label: "새로고침", countLabel,
      },
      landscape,
    };
  }

  function drawQuitConfirm({ shards = 0, enterT = 0, focusedIndex = 0, saveError = "" } = {}) {
    const landscape = isShortLandscape();
    const bounds = landscape ? shortLandscapeBounds(760) : safeBounds();
    const scale = baseUiScale();
    const cx = bounds.cx;
    const count = Math.max(0, Math.round(Number(shards) || 0));
    const focus = Math.max(0, Math.min(1, Math.round(Number(focusedIndex) || 0)));
    const width = Math.min(bounds.width - (landscape ? 0 : 24) * scale, 400 * scale);
    const messageWidth = width - 48 * scale;
    const message = `스테이지·강화가 초기화되고 파편 ${count.toLocaleString("ko-KR")}을 받습니다.`;
    const countLines = (value) => {
      let line = "";
      let count = 1;
      for (const word of value.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && measureTextWidth(next, { size: 14 * scale, weight: 650 }) > messageWidth) {
          count += 1;
          line = word;
        } else line = next;
      }
      return count;
    };
    const messageLines = countLines(message);
    const errorLines = saveError ? countLines(saveError) : 0;
    const height = (198 + messageLines * 22 + (errorLines ? 14 + errorLines * 22 : 0)) * scale;
    const top = (H - height) / 2;
    ctx.save();
    ctx.globalAlpha = clamp(0.78 + Math.max(0, Number(enterT) || 0) * 0.25, 0.78, 0.94);
    ctx.fillStyle = "rgba(5,3,12,0.9)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Keep pause/system controls behind the confirmation from receiving taps.
    // The two explicit actions below are registered afterwards and win hitAt().
    region(0, 0, W, H, "quit:block");
    panel(cx - width / 2, top, width, height, { alpha: 0.97, border: "rgba(232,179,75,0.28)", radius: 10 * scale });
    text("모험을 종료할까요?", cx, top + 47 * scale, {
      size: 24 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center",
    });
    wrapText(message, cx, top + 92 * scale, messageWidth, 14 * scale, TEXT, 8 * scale, "center", 650);
    if (saveError) wrapText(saveError, cx, top + (106 + messageLines * 22) * scale, messageWidth, 14 * scale, "#ffb2a8", 8 * scale, "center", 650);
    const gap = 12 * scale;
    const actionW = (width - 40 * scale - gap) / 2;
    const actionY = top + height - 47 * scale;
    const continueBox = outlinedActionButton(cx - (actionW + gap) / 2, actionY, actionW, 48 * scale, "이전으로", "quit:continue", {
      selected: focus === 0, scale, fontSize: 16,
    });
    const confirmBox = outlinedActionButton(cx + (actionW + gap) / 2, actionY, actionW, 48 * scale, saveError ? "다시 시도" : "모험 종료", "quit:confirm", {
      selected: focus === 1, danger: true, scale, fontSize: 16,
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

  function resultsSceneShade() {
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(7,13,34,0.55)");
    shade.addColorStop(0.45, "rgba(7,13,34,0.68)");
    shade.addColorStop(1, "rgba(7,13,34,0.88)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
  }

  function resultsHurtHero(weaponId, cx, groundY, height, enterT) {
    const sprite = sprites[`motion_${weaponId}_hurt_v1`];
    if (!sprite) return null;
    // Frame 7 keeps every weapon inside this crop. Its feet end at cell y=423.
    // Anchor the existing hurt pose to a visible floor, rather than its padded cell.
    const width = height * 320 / 352;
    const x = cx - width / 2;
    const y = groundY - height * 343 / 352;
    ctx.save();
    ctx.globalAlpha = clamp(enterT / 0.45, 0, 1);
    const floor = ctx.createLinearGradient(cx - width * 0.7, groundY, cx + width * 0.7, groundY);
    floor.addColorStop(0, "rgba(119,184,216,0)");
    floor.addColorStop(0.5, "rgba(119,184,216,0.30)");
    floor.addColorStop(1, "rgba(119,184,216,0)");
    ctx.fillStyle = floor;
    ctx.fillRect(cx - width * 0.7, groundY, width * 1.4, 2 * baseUiScale());
    ctx.fillStyle = "rgba(2,8,20,0.65)";
    ctx.beginPath();
    ctx.ellipse(cx, groundY, width * 0.28, height * 0.027, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, 3 * 480 + 80, 528 + 80, 320, 352, x, y, width, height);
    ctx.restore();
    return { x, y, w: width, h: height, groundY, weaponId, pose: "hurt", frame: 7 };
  }

  function resultsWeaponReward(newWeapon, box, scale, disabled, focused = false) {
    if (!newWeapon?.id) return null;
    const { x, y, w, h } = box;
    const actionId = `results:newWeapon:${newWeapon.id}`;
    const hover = pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
    ctx.save();
    ctx.fillStyle = focused || hover ? "rgba(35,49,72,0.78)" : "rgba(13,25,46,0.58)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = focused || hover ? GOLD : "rgba(232,179,75,0.4)";
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(x + 8 * scale, y + h - scale);
    ctx.lineTo(x + w - 8 * scale, y + h - scale);
    ctx.stroke();
    ctx.restore();
    const iconX = x + 18 * scale;
    const iconY = y + h / 2;
    if (sprites[WEAPON_SPRITE[newWeapon.id]]) {
      weaponIcon(newWeapon.id, iconX, iconY, 31 * scale, {
        rotation: ["chokento", "katana"].includes(newWeapon.id) ? -Math.PI * 3 / 4 : 0,
      });
    }
    const name = newWeapon.name || WEAPON_LABEL[newWeapon.id] || newWeapon.id;
    const label = `${name} 해금`;
    text(label, x + 36 * scale, iconY + scale, {
      size: 14 * scale, color: disabled ? "#8d99ae" : "#f6e6bf", weight: 800, baseline: "middle",
    });
    text("›", x + w - 13 * scale, iconY, {
      size: 21 * scale, color: disabled ? "#8d99ae" : GOLD, align: "center", baseline: "middle",
    });
    region(x, y, w, h, actionId);
    const action = { ...box, id: actionId, label, disabled, focused, selected: focused, primary: false };
    return { ...box, id: newWeapon.id, name, action };
  }

  function resultsSettlement(box, data, scale, compact = false) {
    const { x, y, w, h } = box;
    const amount = value => Math.max(0, Number(value) || 0).toLocaleString("ko-KR");
    const returned = Math.max(0, Number(data.returnedTickets) || 0);
    const gained = `파편 +${amount(data.earnedShards)}`;
    const gainedSize = fitTextSize(gained, 25 * scale, w - 42 * scale, { weight: 850, minSize: 18 * scale });
    const gainedWidth = measureTextWidth(gained, { size: gainedSize, weight: 850 });
    const gainedX = x + w / 2 - gainedWidth / 2 + 10 * scale;
    crystalIcon(gainedX - 19 * scale, y + 18 * scale, 7 * scale, "#8fe3ff");
    text(gained, gainedX, y + 25 * scale, {
      size: gainedSize, color: data.failed ? "#b4baca" : "#fff2c8", weight: 850,
    });
    const bank = data.failed ? "정산 미완료" : `보유 ${amount(data.bankAfter)}`;
    text(bank, x + w / 2, y + 49 * scale, {
      size: 14 * scale, color: data.failed ? "#ffb2a6" : "#bcd3db", weight: 650, align: "center",
    });
    if (returned > 0 && !data.failed) text(`새로고침 ${returned}회 반환`, x + w / 2, y + 72 * scale, {
      size: 14 * scale, color: "#d9cda9", weight: 650, align: "center",
    });
    return {
      ...box, earnedShards: Math.max(0, Number(data.earnedShards) || 0),
      bankBefore: Math.max(0, Number(data.bankBefore) || 0), bankAfter: Math.max(0, Number(data.bankAfter) || 0),
      returnedTickets: returned,
    };
  }

  function drawResultsLandscape(data) {
    drawResultsComposition(data, true);
  }

  function drawResultsComposition({
    score = 0, bestCombo = 0, floors = 0, stage = 1, weapon, weaponId = "chokento", attacks = 0, skills = 0,
    unlocked = [], newlyUnlockedIds = [], newWeapon = null, registered, enterT = 0, saveError = "",
    profileSaved = null, personalBest = false, personalBestStage = null, deathCause = "contact",
    endReason = "death", earnedShards = null, bankBefore = null, bankAfter = null,
    returnedTickets = null, settlementError = "", settlementPending = false, unlockedWeapons = [], section = "main", scrollOffset = 0, focusedIndex = 0,
  }, landscape = false) {
    const bounds = landscape ? shortLandscapeBounds(780) : safeBounds();
    const cx = bounds.cx;
    // Type and touch targets use CSS pixels. Height pressure scrolls content;
    // it never scales the complete results screen below readable sizes.
    const scale = baseUiScale();
    const cssHeight = H / scale;
    const spacious = bounds.width / scale >= 820;
    const wide = landscape;
    const contentW = Math.min(bounds.width - (landscape ? 12 : 24) * scale, (wide ? 740 : spacious ? 600 : 500) * scale);
    const left = cx - contentW / 2;
    const quit = ["quit", "manual", "abandoned", "exit"].includes(endReason);
    const hasSettlement = earnedShards !== null || bankAfter !== null || bankBefore !== null || returnedTickets !== null;
    const settlementFailed = Boolean(settlementPending || settlementError) || (hasSettlement && profileSaved === false);
    const rewardWeapons = [...new Map([
      ...unlockedWeapons,
      ...newlyUnlockedIds.map(id => ({ id, name: WEAPON_LABEL[id] })),
      ...(newWeapon?.id ? [newWeapon] : []),
    ].filter(item => item?.id).map(item => [item.id, item])).values()];
    const primaryId = settlementFailed ? "results:retrySave" : "results:primary";
    const focusOrder = section === "details" ? ["results:back"] : settlementFailed
      ? [primaryId, "results:details"]
      : ["results:retry", "results:newChallenge", primaryId, "results:details", ...rewardWeapons.map(item => `results:newWeapon:${item.id}`)];
    const focusId = focusOrder[clamp(focusedIndex, 0, focusOrder.length - 1)];
    const amount = value => Math.max(0, Number(value) || 0).toLocaleString("ko-KR");
    resultsSceneShade();
    if (section === "details") {
      const width = Math.min(contentW, 560 * scale);
      const detailLeft = cx - width / 2;
      const titleY = (landscape ? 34 : 56) * scale;
      text("상세 기록", cx, titleY, { size: 26 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center" });
      const rowHeight = 44 * scale;
      const stats = [
        ["무기", weapon || WEAPON_LABEL[weaponId] || "장검"],
        ["점수", amount(score)], ["도달", `스테이지 ${stage}`], ["최대 콤보", `${bestCombo}`],
        ["붕괴", `${floors}줄`], ["공격 / 기술", `${attacks} / ${skills}회`],
        ["종료", quit ? "모험 종료" : deathCause === "debris" ? "잔해 피격" : "몬스터 피격"],
        ["획득 파편", `+${amount(earnedShards)}`],
        ["보유 파편", settlementFailed ? "정산 미완료" : `${amount(bankBefore)} → ${amount(bankAfter)}`],
      ];
      if (Number(returnedTickets) > 0) stats.push(["새로고침 반환", `${returnedTickets}회`]);
      const listTop = titleY + 28 * scale;
      const listHeight = Math.min(stats.length * rowHeight, H - listTop - 84 * scale);
      const contentHeight = stats.length * rowHeight;
      const maxOffset = Math.max(0, contentHeight - listHeight);
      const offset = clamp(Number(scrollOffset) || 0, 0, maxOffset);
      ctx.save();
      ctx.beginPath();
      ctx.rect(detailLeft, listTop, width, listHeight);
      ctx.clip();
      stats.forEach(([label, value], index) => {
        const rowY = listTop + index * rowHeight - offset;
        ctx.fillStyle = index % 2 === 0 ? "rgba(11,23,45,0.45)" : "rgba(11,23,45,0.24)";
        ctx.fillRect(detailLeft, rowY, width, rowHeight);
        text(label, detailLeft + 16 * scale, rowY + rowHeight / 2, { size: 14 * scale, color: MUTED, baseline: "middle", weight: 650 });
        text(value, detailLeft + width - 16 * scale, rowY + rowHeight / 2, { size: 15 * scale, color: TEXT, align: "right", baseline: "middle", weight: 800 });
      });
      ctx.restore();
      if (maxOffset > 0) {
        const thumbH = Math.max(24 * scale, listHeight * listHeight / contentHeight);
        ctx.fillStyle = "rgba(232,179,75,0.65)";
        ctx.fillRect(detailLeft + width - 3 * scale, listTop + (listHeight - thumbH) * offset / maxOffset, 3 * scale, thumbH);
      }
      const back = outlinedActionButton(cx, listTop + listHeight + 44 * scale, Math.min(width, 260 * scale), 48 * scale,
        "이전으로", "results:back", { selected: true, scale, fontSize: 16 });
      metrics.results = {
        section, hero: null, record: null, stats: { x: detailLeft, y: listTop, w: width, h: listHeight },
        statRows: stats.map(([label, value], index) => ({ label, value, x: detailLeft, y: listTop + index * rowHeight - offset, w: width, h: rowHeight })),
        settlement: null, achievement: null, note: null, newWeapon: null, newWeapons: [],
        actions: { primary: null, retry: null, newChallenge: null, details: null, back, newWeapon: null },
        scroll: { x: detailLeft, y: listTop, w: width, h: listHeight, offset, maxOffset, contentHeight, rowHeight },
        focusOrder, focusedIndex: 0, saveError: settlementError || saveError || null,
        settlementFailed, deathCause, endReason: quit ? "quit" : "death", landscape,
      };
      return;
    }

    const recordW = wide ? contentW * 0.57 : contentW;
    const shortPortrait = !wide && cssHeight <= 650;
    const compactReturn = shortPortrait && Number(returnedTickets) > 0 && !settlementFailed;
    const recordH = (compactReturn ? 138 : landscape || shortPortrait ? 160 : spacious ? 210 : 180) * scale;
    const sideW = wide ? contentW - recordW - 28 * scale : contentW;
    const sideX = wide ? left + recordW + 28 * scale : left;
    const returned = Math.max(0, Number(returnedTickets) || 0);
    const settlementHeight = (returned > 0 && !settlementFailed ? 82 : 60) * scale;
    const rewardColumns = sideW >= 280 * scale ? 2 : 1;
    const rewardRowHeight = 48 * scale;
    const rewardHeight = rewardWeapons.length ? Math.ceil(rewardWeapons.length / rewardColumns) * rewardRowHeight + 12 * scale : 0;
    const errorMessages = [...new Set([settlementError || (settlementFailed ? "정산을 저장하지 못했습니다." : ""), saveError].filter(Boolean))];
    const note = errorMessages.join(" ");
    const noteWidth = wide ? sideW : contentW;
    ctx.save();
    ctx.font = `650 ${14 * scale}px ${SANS}`;
    const noteLines = note ? Math.max(1, Math.ceil(ctx.measureText(note).width / (noteWidth - 12 * scale))) : 0;
    ctx.restore();
    const noteHeight = noteLines ? (noteLines * 20 + 12) * scale : 0;
    const summaryHeight = (hasSettlement ? settlementHeight : 0) + rewardHeight + noteHeight;
    const contentHeight = wide ? Math.max(recordH, summaryHeight) : recordH + 12 * scale + summaryHeight;
    const headerHeight = (landscape ? 44 : 62) * scale;
    const footerHeight = 120 * scale;
    const idealHeight = headerHeight + contentHeight + footerHeight;
    const footerInset = (landscape ? 8 : clamp((cssHeight - 700) * 0.9 + 24, 24, 132)) * scale;
    const actionTop = H - footerInset - 106 * scale;
    const top = Math.max((landscape ? 8 : 16) * scale, Math.min((H - idealHeight) * 0.42, actionTop - contentHeight - headerHeight - 18 * scale));
    const titleY = top + 24 * scale;
    text("모험 결과", cx, titleY, {
      size: 26 * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center", spacing: 1.5 * scale,
    });
    const contentTop = top + headerHeight;
    const contentAreaHeight = Math.min(contentHeight, Math.max(80 * scale, actionTop - contentTop - 18 * scale));
    const maxOffset = contentHeight - contentAreaHeight > 0.5 * scale ? contentHeight - contentAreaHeight : 0;
    const offset = clamp(Number(scrollOffset) || 0, 0, maxOffset);
    const recordTop = contentTop - offset;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 2 * scale, contentTop, contentW + 4 * scale, contentAreaHeight);
    ctx.clip();
    const contentHitStart = hits.length;
    const heroHeight = (compactReturn ? 126 : landscape ? 142 : shortPortrait ? 146 : spacious ? 192 : 166) * scale;
    const heroCx = left + recordW * (wide ? 0.78 : 0.76);
    const heroGround = recordTop + recordH - 12 * scale;
    const heroBox = resultsHurtHero(weaponId, heroCx, heroGround, heroHeight, enterT);
    const scoreWidth = recordW * 0.55;
    const scoreX = left + scoreWidth / 2;
    const scoreY = recordTop + (compactReturn ? 72 : landscape ? 79 : shortPortrait ? 85 : spacious ? 112 : 98) * scale;
    if (personalBest) text("최고 기록", scoreX, scoreY - 53 * scale, { size: 14 * scale, color: "#e8c777", weight: 750, align: "center" });
    const shownScore = Math.round(score * easeOutCubic(clamp((enterT - 0.16) / 0.65, 0, 1))).toLocaleString("ko-KR");
    text(shownScore, scoreX, scoreY, {
      size: fitTextSize(shownScore, (spacious ? 56 : 50) * scale, scoreWidth, { weight: 900, minSize: 20 * scale }),
      color: "#fff0ca", weight: 900, align: "center",
    });
    text(`스테이지 ${stage}`, scoreX, scoreY + 30 * scale, { size: 16 * scale, color: "#c0d4e1", weight: 700, align: "center" });
    let summaryY = wide ? recordTop + Math.max(0, (recordH - summaryHeight) / 2) : recordTop + recordH + 12 * scale;
    let settlementBox = null;
    if (hasSettlement) {
      settlementBox = resultsSettlement({ x: sideX, y: summaryY, w: sideW, h: settlementHeight },
        { earnedShards, bankBefore, bankAfter, returnedTickets, failed: settlementFailed }, scale, landscape);
      summaryY += settlementHeight;
    }
    const newWeapons = [];
    if (rewardWeapons.length) {
      summaryY += 12 * scale;
      const gap = 8 * scale;
      const rewardWidth = (sideW - gap * (rewardColumns - 1)) / rewardColumns;
      rewardWeapons.forEach((item, index) => {
        const box = { x: sideX + (index % rewardColumns) * (rewardWidth + gap), y: summaryY + Math.floor(index / rewardColumns) * rewardRowHeight, w: rewardWidth, h: 44 * scale };
        const reward = resultsWeaponReward(item, box, scale, settlementFailed, focusId === `results:newWeapon:${item.id}`);
        if (reward) newWeapons.push(reward);
      });
      summaryY += Math.ceil(rewardWeapons.length / rewardColumns) * rewardRowHeight;
    }
    let noteBox = null;
    if (note) {
      const noteY = summaryY + 23 * scale;
      const lastY = wrapText(note, sideX + sideW / 2, noteY, sideW - 12 * scale, 14 * scale, "#ffb2a6", 6 * scale, "center", 650);
      noteBox = { text: note, x: sideX, y: noteY - 14 * scale, w: sideW, h: lastY - noteY + 22 * scale };
    }
    ctx.restore();
    // Canvas clipping does not clip hit rectangles. Trim reward targets to the
    // content viewport so scrolled-off actions cannot capture footer taps.
    const clippedHits = hits.splice(contentHitStart).flatMap(hit => {
      const y = Math.max(contentTop, hit.y);
      const bottom = Math.min(contentTop + contentAreaHeight, hit.y + hit.h);
      return bottom > y ? [{ ...hit, y, h: bottom - y }] : [];
    });
    hits.push(...clippedHits);
    if (maxOffset > 0) {
      const thumbH = Math.max(24 * scale, contentAreaHeight * contentAreaHeight / contentHeight);
      ctx.fillStyle = "rgba(232,179,75,0.65)";
      ctx.fillRect(left + contentW - 2 * scale, contentTop + (contentAreaHeight - thumbH) * offset / maxOffset, 2 * scale, thumbH);
    }

    const actionW = Math.min(contentW, (wide ? 500 : 420) * scale);
    const gap = 12 * scale;
    const buttonW = (actionW - gap) / 2;
    const retry = outlinedActionButton(cx - (buttonW + gap) / 2, actionTop + 26 * scale, buttonW, 52 * scale, "재도전", "results:retry", {
      selected: focusId === "results:retry", primary: true, disabled: settlementFailed, scale, fontSize: 17,
    });
    const newChallenge = outlinedActionButton(cx + (buttonW + gap) / 2, actionTop + 26 * scale, buttonW, 52 * scale, "새도전", "results:newChallenge", {
      selected: focusId === "results:newChallenge", primary: false, disabled: settlementFailed, scale, fontSize: 17,
    });
    const primaryLabel = settlementFailed ? "정산 다시 저장" : registered ? "순위표" : "순위 등록";
    const primary = outlinedActionButton(cx - (buttonW + gap) / 2, actionTop + 84 * scale, buttonW, 44 * scale, primaryLabel, primaryId, {
      selected: focusId === primaryId, primary: settlementFailed, danger: settlementFailed, scale, fontSize: 14,
    });
    const details = outlinedActionButton(cx + (buttonW + gap) / 2, actionTop + 84 * scale, buttonW, 44 * scale, "상세 기록", "results:details", {
      selected: focusId === "results:details", primary: false, scale, fontSize: 14,
    });
    metrics.results = {
      section,
      hero: heroBox,
      record: { x: left, y: recordTop, w: recordW, h: recordH },
      stats: null,
      settlement: settlementBox,
      achievement: personalBest ? { text: "최고 기록", x: scoreX - scoreWidth / 2, y: scoreY - 69 * scale, w: scoreWidth, h: 22 * scale } : null,
      note: noteBox,
      newWeapon: newWeapons[0] || null, newWeapons,
      actions: { primary, retry, newChallenge, details, back: null, newWeapon: newWeapons[0]?.action || null },
      scroll: { x: left, y: contentTop, w: contentW, h: contentAreaHeight, offset, maxOffset, contentHeight, rowHeight: rewardRowHeight },
      focusOrder, focusedIndex: focusOrder.indexOf(focusId),
      saveError: settlementError || saveError || null, settlementFailed, deathCause, endReason: quit ? "quit" : "death", landscape,
    };
  }

  // === results ===
  function drawResults(data) {
    if (isShortLandscape()) {
      drawResultsLandscape(data);
      return;
    }
    drawResultsComposition(data);
  }

  // === ranking board ===
  function rankingFitName(value, maxWidth, size, weight) {
    const chars = Array.from(String(value || "무명"));
    let label = chars.join("");
    while (chars.length > 1 && measureTextWidth(label, { size, weight }) > maxWidth) {
      chars.pop();
      label = chars.join("") + "…";
    }
    return label;
  }

  function drawRankingLandscape(data) {
    drawRankingComposition(data, true);
  }

  function drawRankingComposition({ entries = [], highlight, enterT = 0, scrollOffset = 0 }, landscape = false) {
    const bounds = landscape ? shortLandscapeBounds(700) : safeBounds();
    const scale = baseUiScale();
    const compact = bounds.width / scale < 500;
    const short = H / scale < 650;
    const cx = bounds.cx;
    const contentW = Math.min(bounds.width - (landscape ? 0 : 32) * scale, 700 * scale);
    const left = cx - contentW / 2;
    resultsSceneShade();
    ctx.fillStyle = "rgba(7,13,34,0.22)";
    ctx.fillRect(0, 0, W, H);
    const titleY = (landscape ? 35 : short ? 43 : 54) * scale;
    text("순위표", cx, titleY, {
      size: (landscape ? 24 : 28) * scale, color: "#fff2c8", font: SERIF, weight: 900, align: "center", spacing: 2 * scale,
    });
    const rowsTop = (landscape ? 87 : short ? 108 : 124) * scale;
    const backY = H - (landscape ? 40 : 48) * scale;
    const availableH = Math.max(48 * scale, backY - 49 * scale - rowsTop);
    const rowH = (landscape ? 48 : clamp(availableH / scale / 10, 48, 58)) * scale;
    const boardEntries = entries.slice(0, 10);
    const contentHeight = boardEntries.length * rowH;
    const listH = Math.min(availableH, Math.max(rowH, contentHeight));
    const maxOffset = contentHeight - listH > 0.001 ? contentHeight - listH : 0;
    const offset = clamp(Number(scrollOffset) || 0, 0, maxOffset);
    const scroll = { x: left, y: rowsTop, w: contentW, h: listH, offset, maxOffset, contentHeight, rowHeight: rowH };
    const rankX = left + 22 * scale;
    const nameX = left + 53 * scale;
    const scoreX = left + contentW - 14 * scale;
    const headerY = rowsTop - 18 * scale;
    const headers = [
      { label: "순위", x: left, y: headerY - 10 * scale, w: 44 * scale, h: 20 * scale },
      { label: "이름", x: nameX, y: headerY - 10 * scale, w: contentW - 170 * scale, h: 20 * scale },
      { label: "점수", x: scoreX - 100 * scale, y: headerY - 10 * scale, w: 100 * scale, h: 20 * scale },
    ];
    text("순위", rankX, headerY, { size: 14 * scale, color: MUTED, weight: 650, align: "center", baseline: "middle" });
    text("이름", nameX, headerY, { size: 14 * scale, color: MUTED, weight: 650, baseline: "middle" });
    text("점수", scoreX, headerY, { size: 14 * scale, color: MUTED, weight: 650, align: "right", baseline: "middle" });
    ctx.fillStyle = "rgba(232,179,75,0.45)";
    ctx.fillRect(left, rowsTop - scale, contentW, scale);
    const rows = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, rowsTop, contentW, listH);
    ctx.clip();
    for (let i = 0; i < boardEntries.length; i += 1) {
      const y = rowsTop + i * rowH - offset;
      if (y + rowH <= rowsTop || y >= rowsTop + listH) continue;
      const at = 0.1 + i * 0.04;
      if (enterT < at) continue;
      const entry = boardEntries[i];
      const mine = i === highlight;
      const nameSize = (compact ? 15 : 17) * scale;
      const scoreBaseSize = (compact ? 16 : 18) * scale;
      const value = Number(entry.score);
      const score = Math.max(0, Number.isFinite(value) ? value : 0).toLocaleString("ko-KR");
      const maxScoreWidth = Math.min(contentW * 0.54, contentW - 130 * scale);
      const scoreSize = fitTextSize(score, scoreBaseSize, maxScoreWidth, { weight: 850, minSize: 14 * scale });
      const scoreWidth = Math.max(74 * scale, measureTextWidth(score, { size: scoreSize, weight: 850 }));
      const nameWidth = scoreX - scoreWidth - nameX - 16 * scale;
      const name = rankingFitName(entry.name, nameWidth, nameSize, mine ? 850 : 700);
      ctx.save();
      ctx.globalAlpha = clamp((enterT - at) / 0.18, 0, 1);
      ctx.fillStyle = mine ? "rgba(232,179,75,0.12)" : i % 2 === 0 ? "rgba(8,18,40,0.36)" : "rgba(8,18,40,0.20)";
      ctx.fillRect(left, y, contentW, rowH);
      if (mine) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(left, y + 10 * scale, 2 * scale, rowH - 20 * scale);
      }
      ctx.fillStyle = "rgba(191,209,233,0.10)";
      ctx.fillRect(left, y + rowH - scale, contentW, scale);
      const centerY = y + rowH / 2;
      text(String(i + 1), rankX, centerY, {
        size: (compact ? 16 : 18) * scale, color: i === 0 ? GOLD : i < 3 ? "#e4d1a8" : "#aebed6", weight: 850, align: "center", baseline: "middle",
      });
      text(name, nameX, centerY, { size: nameSize, color: mine ? "#ffe2a3" : "#f0edf0", weight: mine ? 850 : 700, baseline: "middle" });
      text(score, scoreX, centerY, { size: scoreSize, color: mine ? "#ffe2a3" : "#f0edf0", weight: 850, align: "right", baseline: "middle" });
      ctx.restore();
      const clippedY = Math.max(y, rowsTop);
      rows.push({ index: i, rank: i + 1, name, score, x: left, y: clippedY, w: contentW, h: Math.min(y + rowH, rowsTop + listH) - clippedY });
    }
    ctx.restore();
    if (!boardEntries.length) {
      text("기록 없음", cx, rowsTop + availableH * 0.45, { size: 16 * scale, color: MUTED, weight: 650, align: "center", baseline: "middle" });
    }
    if (maxOffset > 0) {
      const thumbH = Math.max(28 * scale, listH * listH / contentHeight);
      ctx.fillStyle = "rgba(232,179,75,0.55)";
      ctx.fillRect(left + contentW - 3 * scale, rowsTop + offset / maxOffset * (listH - thumbH), 2 * scale, thumbH);
    }
    region(left, rowsTop, contentW, listH, "ranking:list");
    const back = outlinedActionButton(cx, backY, Math.min(contentW, 238 * scale), 50 * scale,
      "이전으로", "ranking:back", { selected: true, primary: true, scale, fontSize: 16 });
    metrics.ranking = { landscape, title: "순위표", headers, rows, totalRows: boardEntries.length, visibleRows: rows.length, scroll, back };
  }

  function drawRanking(data) {
    if (isShortLandscape()) {
      drawRankingLandscape(data);
      return;
    }
    drawRankingComposition(data);
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
    setPointer,
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
