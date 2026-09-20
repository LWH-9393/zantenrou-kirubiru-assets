export const COMBAT_LOGICAL_H = 1031;
export const TOUCH_TRAY_CSS_H = 128;

// The envelope includes all five integrated weapon atlases in all three lanes:
// the axe attack reaches 358px left of centre, and its hurt pose 296px right.
// Keep another 18px of world-space allowance for shake and the outer silhouette.
// This is a display contract only; lanes, jump, reach and collisions never scale.
const COMBAT_ENVELOPE_LEFT = -376;
const COMBAT_ENVELOPE_RIGHT = 314;
const COMBAT_FOOT_ALLOWANCE = 64;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function computeResponsiveLayout({
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  visualWidth,
  visualHeight,
  devicePixelRatio = 1,
  coarsePointer = false,
  touchVisible = false,
  baseWidth = 640,
  logicalHeight = COMBAT_LOGICAL_H,
}) {
  const cssFrameWidth = finitePositive(frameWidth, baseWidth);
  const cssFrameHeight = finitePositive(frameHeight, logicalHeight);
  const cssViewportWidth = finitePositive(viewportWidth, cssFrameWidth);
  const cssViewportHeight = finitePositive(viewportHeight, cssFrameHeight);
  const frameAspect = cssFrameWidth / cssFrameHeight;
  const logicalWidth = Math.max(baseWidth, Math.round(logicalHeight * frameAspect));

  // Keep full-frame menus/backgrounds and their existing safe-area geometry.
  // The separate combat projection below fits the world inside this canvas.
  const canvasCssHeight = cssFrameHeight;
  const canvasCssWidth = Math.max(
    cssFrameWidth,
    canvasCssHeight * (logicalWidth / logicalHeight),
  );
  const cssScale = canvasCssHeight / logicalHeight;
  const visibleLogicalWidth = Math.min(logicalWidth, cssFrameWidth / cssScale);
  const visibleLogicalLeft = (logicalWidth - visibleLogicalWidth) / 2;

  let mode = "wide";
  if (cssViewportWidth <= 540) mode = "mobile";
  else if (cssViewportWidth <= 900) mode = "compact";

  const portrait = mode === "mobile"
    || (mode === "compact" && cssFrameHeight > cssFrameWidth * 1.05);
  // The geometric mean reacts to both width and height without a breakpoint
  // jump. Layout modes change composition only; visual size stays continuous.
  const sizeBasis = Math.sqrt(cssFrameWidth * cssFrameHeight);
  const fluidScaleT = clamp((sizeBasis - 460) / 520, 0, 1);
  const uiTargetScale = 1 + 0.45 * fluidScaleT;
  const hudTargetScale = 0.98 + 0.22 * fluidScaleT;

  const sideMarginCss = Math.min(12, cssFrameWidth * 0.032);
  // Fit both weapon extremes around the middle lane without shifting the world.
  const combatWidth = 2 * Math.max(-COMBAT_ENVELOPE_LEFT, COMBAT_ENVELOPE_RIGHT);
  const combatScale = Math.min(1, (cssFrameWidth - sideMarginCss * 2) / (combatWidth * cssScale));
  const trayHeightCss = touchVisible ? TOUCH_TRAY_CSS_H : 0;
  const groundY = Math.max(402, logicalHeight - 78);
  const combatGroundCssY = !touchVisible && combatScale === 1 ? groundY * cssScale : Math.min(
    groundY * cssScale,
    cssFrameHeight - trayHeightCss - (COMBAT_FOOT_ALLOWANCE * combatScale * cssScale) - 12,
  );
  const combatProjection = {
    scale: combatScale,
    translateX: logicalWidth / 2 * (1 - combatScale),
    translateY: combatGroundCssY / cssScale - groundY * combatScale,
    groundCssY: combatGroundCssY,
    touchTrayCssHeight: trayHeightCss,
    touchTrayCssTop: cssFrameHeight - trayHeightCss,
    sideMarginCss,
  };

  return {
    mode,
    portrait,
    coarsePointer: Boolean(coarsePointer),
    touchVisible: Boolean(touchVisible),
    cssFrameWidth,
    cssFrameHeight,
    cssViewportWidth,
    cssViewportHeight,
    visualWidth: finitePositive(visualWidth, cssViewportWidth),
    visualHeight: finitePositive(visualHeight, cssViewportHeight),
    devicePixelRatio: finitePositive(devicePixelRatio, 1),
    logicalWidth,
    logicalHeight,
    canvasCssWidth,
    canvasCssHeight,
    cssScaleX: canvasCssWidth / logicalWidth,
    cssScaleY: cssScale,
    baseUiScale: 1 / cssScale,
    sizeBasis,
    fluidScaleT,
    uiTargetScale,
    uiScale: uiTargetScale / cssScale,
    hudTargetScale,
    hudScale: hudTargetScale / cssScale,
    combatProjection,
    visibleLogicalLeft,
    visibleLogicalWidth,
    visibleLogicalRight: visibleLogicalLeft + visibleLogicalWidth,
  };
}

// Canvas-logical result: use after the camera offset, before converting to CSS.
// Hazard markers can use the same projection as the monster/player world group.
export function projectCombatPoint(layout, x, y, cameraY = 0) {
  const projection = layout?.combatProjection;
  const scale = projection?.scale ?? 1;
  return {
    x: x * scale + (projection?.translateX ?? 0),
    y: (y - cameraY) * scale + (projection?.translateY ?? 0),
  };
}

export function layoutSignature(layout) {
  return [
    layout.mode,
    layout.portrait ? 1 : 0,
    layout.coarsePointer ? 1 : 0,
    layout.touchVisible ? 1 : 0,
    Math.round(layout.cssFrameWidth * 10),
    Math.round(layout.cssFrameHeight * 10),
    Math.round(layout.cssViewportWidth * 10),
    Math.round(layout.cssViewportHeight * 10),
    Math.round(layout.visualWidth * 10),
    Math.round(layout.visualHeight * 10),
    Math.round(layout.devicePixelRatio * 100),
    layout.logicalWidth,
    layout.logicalHeight,
  ].join(":");
}
