import { MONSTER_DEFINITIONS, getMonsterDefinition, getMonsterDefinitionForArtKind } from "./monster-catalog.js";

const ALPHA_THRESHOLD = 32;
const ACTIVE_COVERAGE_THRESHOLD = 0.015;
const HORIZONTAL_PADDING = 6;

const SOURCE_BOUNDS = Object.freeze(Object.fromEntries(
  Object.values(MONSTER_DEFINITIONS).map((definition) => [definition.artKind, definition.sourceBounds]),
));

function artDefinition(definitionOrKind) {
  return typeof definitionOrKind === "string" && !Object.hasOwn(MONSTER_DEFINITIONS, definitionOrKind)
    ? getMonsterDefinitionForArtKind(definitionOrKind)
    : getMonsterDefinition(definitionOrKind);
}

const analysisCache = new WeakMap();
const layoutCache = new WeakMap();

function spriteDimensions(sprite) {
  return {
    width: sprite?.naturalWidth || sprite?.width || 0,
    height: sprite?.naturalHeight || sprite?.height || 0,
  };
}

function alphaAnalysis(sprite) {
  if (analysisCache.has(sprite)) return analysisCache.get(sprite);
  const { width, height } = spriteDimensions(sprite);
  if (!width || !height) throw new Error("몬스터 원화의 크기를 읽을 수 없습니다");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(sprite, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowCount = 0;
    const sourceRow = (y - 1) * width;
    const integralRow = y * stride;
    const previousRow = (y - 1) * stride;
    for (let x = 1; x <= width; x += 1) {
      if (pixels[(sourceRow + x - 1) * 4 + 3] >= ALPHA_THRESHOLD) rowCount += 1;
      integral[integralRow + x] = integral[previousRow + x] + rowCount;
    }
  }

  const analysis = { width, height, stride, integral };
  analysisCache.set(sprite, analysis);
  return analysis;
}

function opaquePixelCount(analysis, x0, y0, x1, y1) {
  const left = Math.max(0, Math.min(analysis.width, Math.floor(x0)));
  const top = Math.max(0, Math.min(analysis.height, Math.floor(y0)));
  const right = Math.max(left, Math.min(analysis.width, Math.ceil(x1)));
  const bottom = Math.max(top, Math.min(analysis.height, Math.ceil(y1)));
  const { integral, stride } = analysis;
  return integral[bottom * stride + right]
    - integral[top * stride + right]
    - integral[bottom * stride + left]
    + integral[top * stride + left];
}

export function prepareMonsterSprite(sprite, definitionOrKind) {
  const definition = artDefinition(definitionOrKind);
  const kind = definition.id;
  const bounds = definition.sourceBounds;
  if (!sprite) throw new Error(`필수 몬스터 원화가 없습니다: ${definition.spriteKey}`);
  const analysis = alphaAnalysis(sprite);
  if (bounds.x < 0 || bounds.y < 0
    || bounds.x + bounds.w > analysis.width
    || bounds.y + bounds.h > analysis.height) {
    throw new Error(`몬스터 원화 경계가 이미지 밖입니다: ${kind}`);
  }
  if (opaquePixelCount(
    analysis,
    bounds.x,
    bounds.y,
    bounds.x + bounds.w,
    bounds.y + bounds.h,
  ) <= 0) throw new Error(`몬스터 원화에 가시 픽셀이 없습니다: ${kind}`);
  return analysis;
}

export function monsterArtLayout(sprite, definitionOrKind, rows, {
  width = 480,
  rowHeight = 120,
  lanes = 3,
} = {}) {
  const definition = artDefinition(definitionOrKind);
  const kind = definition.artKind;
  if (!sprite) throw new Error(`필수 몬스터 원화가 없습니다: ${definition.spriteKey}`);
  const rowCount = Math.max(1, Math.floor(rows));
  const key = `${kind}:${rowCount}:${width}:${rowHeight}:${lanes}`;
  let spriteLayouts = layoutCache.get(sprite);
  if (!spriteLayouts) {
    spriteLayouts = new Map();
    layoutCache.set(sprite, spriteLayouts);
  }
  if (spriteLayouts.has(key)) return spriteLayouts.get(key);

  const analysis = prepareMonsterSprite(sprite, definition);
  const source = definition.sourceBounds;
  const fullWidthScale = (width - HORIZONTAL_PADDING * 2) / source.w;
  const minimumRows = Math.max(1, Math.ceil(source.h * fullWidthScale / rowHeight));
  const gridHeight = rowCount * rowHeight;
  const scale = Math.min(
    (width - HORIZONTAL_PADDING * 2) / source.w,
    gridHeight / source.h,
  );
  const drawW = source.w * scale;
  const drawH = source.h * scale;
  const drawX = (width - drawW) / 2;
  const drawTop = gridHeight - drawH;
  const laneWidth = width / lanes;
  const tiles = [];

  for (let row = 0; row < rowCount; row += 1) {
    const tileRow = [];
    for (let lane = 0; lane < lanes; lane += 1) {
      const tileLeft = lane * laneWidth;
      const tileTop = row * rowHeight;
      const overlapLeft = Math.max(tileLeft, drawX);
      const overlapTop = Math.max(tileTop, drawTop);
      const overlapRight = Math.min(tileLeft + laneWidth, drawX + drawW);
      const overlapBottom = Math.min(tileTop + rowHeight, drawTop + drawH);
      let coverage = 0;

      if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
        const sourceLeft = source.x + (overlapLeft - drawX) / scale;
        const sourceTop = source.y + (overlapTop - drawTop) / scale;
        const sourceRight = source.x + (overlapRight - drawX) / scale;
        const sourceBottom = source.y + (overlapBottom - drawTop) / scale;
        const visible = opaquePixelCount(analysis, sourceLeft, sourceTop, sourceRight, sourceBottom);
        coverage = Math.min(1, visible * scale * scale / (laneWidth * rowHeight));
      }

      tileRow.push(Object.freeze({
        active: coverage >= ACTIVE_COVERAGE_THRESHOLD,
        coverage,
      }));
    }
    tiles.push(Object.freeze(tileRow));
  }

  const layout = Object.freeze({
    kind,
    monsterId: definition.id,
    spriteKey: definition.spriteKey,
    rows: rowCount,
    minimumRows,
    source,
    drawX,
    drawTop,
    drawW,
    drawH,
    scale,
    tiles: Object.freeze(tiles),
    activeRowCount: tiles.filter((row) => row.some((tile) => tile.active)).length,
    activeCellCount: tiles.reduce((sum, row) => sum + row.filter((tile) => tile.active).length, 0),
  });
  spriteLayouts.set(key, layout);
  return layout;
}

export const monsterGridMetrics = Object.freeze({
  alphaThreshold: ALPHA_THRESHOLD,
  activeCoverageThreshold: ACTIVE_COVERAGE_THRESHOLD,
  horizontalPadding: HORIZONTAL_PADDING,
  sourceBounds: SOURCE_BOUNDS,
});
