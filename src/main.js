// Bootstrap: data/sprite loading, action-based input (WASD + JKL, arrows/ZX
// as legacy aliases), touch controls, the name-entry overlay and the fixed
// 60Hz loop.
import { createSceneMachine } from "./scenes.js";
import * as engine from "./engine.js";
import {
  gameplaySpriteNames,
  loadCriticalSprites,
  loadGameplaySprites,
} from "./assets.js";
import { unlock } from "./sfx.js";
import { computeResponsiveLayout, layoutSignature } from "./layout.js";
import { PROFILE_V2_LOCK_NAME } from "./profile.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const frameElement = document.querySelector(".game-frame");

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
let currentLayout = null;
let currentLayoutSignature = "";
let releaseProfileLease = null;
let profileLeaseTask = null;

async function acquireProfileLease() {
  // localStorage has no atomic compare-and-swap primitive, so a synchronous
  // fallback lock cannot safely serialize shard/ticket transactions across
  // tabs. Browsers without Web Locks therefore run this profile read-only.
  if (!navigator.locks?.request) return { held: false, supported: false };
  let reportAcquired;
  let reported = false;
  const acquired = new Promise((resolve) => {
    reportAcquired = (value) => {
      if (reported) return;
      reported = true;
      resolve(value);
    };
  });
  profileLeaseTask = navigator.locks.request(
    PROFILE_V2_LOCK_NAME,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      reportAcquired(Boolean(lock));
      if (!lock) return;
      await new Promise((resolve) => { releaseProfileLease = resolve; });
    },
  ).catch((error) => {
    reportAcquired(false);
    console.error("성장 기록 잠금을 얻지 못했습니다", error);
  });
  return { held: await acquired, supported: true };
}

// --- action-based input ---
const KEY_TO_ACTION = {
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  KeyW: "jump", ArrowUp: "jump",
  KeyS: "guard", ArrowDown: "guard",
  KeyJ: "slash", KeyZ: "slash",
  KeyK: "skill", KeyX: "skill",
  KeyL: "aux", KeyR: "aux",
  KeyP: "pause", Escape: "pause",
  KeyM: "mute",
};
const heldKeys = new Set(); // physical key codes
const heldVirtual = new Set(); // touch actions
const pressed = new Set(); // action edge queue

let overlayOpen = false;

window.addEventListener("keydown", (e) => {
  unlock(); // WebAudio needs a user gesture
  if (overlayOpen) return; // name entry owns the keyboard
  const action = KEY_TO_ACTION[e.code];
  if (!action) return;
  if ((action === "pause" || action === "mute") && e.repeat) return;
  if (!heldKeys.has(e.code)) pressed.add(action);
  heldKeys.add(e.code);
  e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.code);
});

function heldByKey(action) {
  for (const code of heldKeys) {
    if (KEY_TO_ACTION[code] === action) return true;
  }
  return false;
}

const input = {
  pressed,
  held(action) {
    return heldVirtual.has(action) || heldByKey(action);
  },
  justPressed(action) {
    if (pressed.has(action)) {
      pressed.delete(action);
      return true;
    }
    return false;
  },
  reset() {
    heldKeys.clear();
    heldVirtual.clear();
    pressed.clear();
    document.querySelectorAll("#touch .on").forEach((button) => button.classList.remove("on"));
  },
};

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function responsiveLayoutFromFrame() {
  const rect = frameElement.getBoundingClientRect();
  const cssW = Math.max(1, rect.width || window.innerWidth || engine.BASE_W);
  const cssH = Math.max(1, rect.height || window.innerHeight || engine.BASE_H);
  const visual = window.visualViewport;
  const touch = document.querySelector("#touch");
  return computeResponsiveLayout({
    frameWidth: cssW,
    frameHeight: cssH,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    visualWidth: visual?.width,
    visualHeight: visual?.height,
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    touchVisible: Boolean(touch && !touch.hidden),
    baseWidth: engine.BASE_W,
  });
}

function applyCanvasDisplay(layout) {
  canvas.style.width = `${layout.canvasCssWidth}px`;
  canvas.style.height = `${layout.canvasCssHeight}px`;
}

function configureCanvasSize(scenes) {
  const nextLayout = responsiveLayoutFromFrame();
  const nextSignature = layoutSignature(nextLayout);
  const width = nextLayout.logicalWidth;
  const height = nextLayout.logicalHeight;
  applyCanvasDisplay(nextLayout);
  if (
    canvas.width === width
    && canvas.height === height
    && nextSignature === currentLayoutSignature
  ) return false;

  currentLayout = nextLayout;
  currentLayoutSignature = nextSignature;
  if (scenes) scenes.resize(width, height, nextLayout);
  else {
    canvas.width = width;
    canvas.height = height;
    engine.configureViewport(width, height);
  }
  return true;
}

// --- touch controls (shown on coarse pointers or first touch) ---
function bindTouch(onLayoutChange = () => {}) {
  const bar = document.querySelector("#touch");
  if (!bar) return;
  const enable = () => {
    const wasHidden = bar.hidden;
    document.body.classList.add("touch-mode");
    bar.hidden = false;
    if (wasHidden) onLayoutChange();
  };
  if (window.matchMedia("(pointer: coarse)").matches) enable();
  window.addEventListener("touchstart", enable, { once: true, passive: true });

  for (const btn of bar.querySelectorAll("[data-act]")) {
    const action = btn.dataset.act;
    const down = (e) => {
      e.preventDefault();
      unlock();
      if (!heldVirtual.has(action)) pressed.add(action);
      heldVirtual.add(action);
      btn.classList.add("on");
    };
    const up = (e) => {
      if (e) e.preventDefault();
      heldVirtual.delete(action);
      btn.classList.remove("on");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

// --- name entry overlay (works with mobile soft keyboards) ---
function createNameEntry() {
  const overlay = document.querySelector("#name-overlay");
  const field = document.querySelector("#name-field");
  const submit = document.querySelector("#name-submit");
  let done = null;

  function close(value) {
    if (!done) return;
    const cb = done;
    done = null;
    overlay.hidden = true;
    overlayOpen = false;
    cb(value.trim().slice(0, 8));
  }
  submit.addEventListener("click", () => close(field.value));
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") close(field.value);
    if (e.key === "Escape") close("");
  });
  overlay.addEventListener("keydown", (e) => e.stopPropagation());

  return {
    open(cb) {
      done = cb;
      overlayOpen = true;
      overlay.hidden = false;
      field.value = "";
      setTimeout(() => field.focus(), 30);
    },
  };
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" }); // 데이터 파일은 항상 최신본
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  const bootStatus = document.querySelector("#boot-status");
  const bootTitle = document.querySelector("#boot-title");
  const bootDetail = document.querySelector("#boot-detail");
  const bootFill = document.querySelector("#boot-progress-fill");
  const retry = document.querySelector("#boot-retry");
  const setBootProgress = (value, detail) => {
    if (bootFill) bootFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (bootDetail && detail) bootDetail.textContent = detail;
  };

  try {
    setBootProgress(8, "게임 규칙을 읽는 중");
    const profileLease = await acquireProfileLease();
    const [weapons, upgrades, stages, economy, growth, forgeAtlas, uiAtlas, comboAtlas] = await Promise.all([
      loadJson("./data/weapons.json"),
      loadJson("./data/upgrades.json"),
      loadJson("./data/stages.json"),
      loadJson("./data/economy.json"),
      loadJson("./data/growth.json"),
      loadJson("./data/forge_atlas.json"),
      loadJson("./data/ui_atlas.json"),
      loadJson("./data/combo_atlas.json"),
    ]);
    setBootProgress(32, "밤의 숲을 깨우는 중");
    const sprites = await loadCriticalSprites("./assets/img/", (loaded, total) => {
      setBootProgress(32 + (loaded / total) * 62, "별빛과 숲을 준비하는 중");
    });

  let scenes = null;
  const syncLayout = () => configureCanvasSize(scenes);
  bindTouch(syncLayout);
  syncLayout();

  const nameEntry = createNameEntry();

  scenes = createSceneMachine({
    ctx,
    data: { weapons, upgrades, stages, economy, growth, forgeAtlas, uiAtlas, comboAtlas },
    input,
    sprites,
    nameEntry,
    layout: currentLayout,
    profileWritable: profileLease.held,
    profileExclusive: profileLease.held && profileLease.supported,
    profileLockSupported: profileLease.supported,
  });

  let resizeQueued = false;
  function scheduleResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (syncLayout()) scenes.render();
    });
  }
  window.addEventListener("resize", scheduleResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleResize);
  window.addEventListener("blur", () => scenes.setPaused?.(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) scenes.setPaused?.(true);
  });
  window.addEventListener("beforeunload", () => scenes.abandonRun?.());
  window.addEventListener("pagehide", () => {
    // pagehide also covers BFCache entry, where beforeunload may not run. Save
    // the current run before yielding the lifetime writer lease to another tab.
    // abandonRun is settlement-idempotent when both lifecycle events do fire.
    try { scenes.abandonRun?.(); } finally {
      releaseProfileLease?.();
      releaseProfileLease = null;
    }
  }, { once: true });
  window.addEventListener("pageshow", (event) => {
    // A BFCache document retains its old profileWritable boolean even though
    // pagehide released the actual Web Lock. Reloading makes boot reacquire (or
    // fail to acquire) the lease before any restored UI can write again.
    if (event.persisted) window.location.reload();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (overlayOpen) return;
    unlock();
    const p = canvasPointFromEvent(e);
    scenes.click(p.x, p.y);
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (overlayOpen) {
      canvas.style.cursor = "";
      return;
    }
    const p = canvasPointFromEvent(e);
    canvas.style.cursor = scenes.hoverHit(p.x, p.y) ? "pointer" : "";
  });

  canvas.addEventListener("pointerleave", () => {
    canvas.style.cursor = "";
  });

  function stepOnce() {
    scenes.update(STEP);
    pressed.clear();
  }

  window.render_game_to_text = () => scenes.textState();
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (STEP * 1000)));
    for (let i = 0; i < steps; i += 1) stepOnce();
    scenes.render();
  };

  let acc = 0;
  let lastTs = 0;
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      stepOnce();
      acc -= STEP;
      steps += 1;
    }
    scenes.render();
    requestAnimationFrame(frame);
  }
    requestAnimationFrame(frame);
    setBootProgress(100, "준비 완료");
    requestAnimationFrame(() => bootStatus?.classList.add("ready"));
    let gameplayReady = null;
    let gameplayAssetsSettled = false;
    let gameplayAssetsFailed = false;
    const requiredGameplaySprites = gameplaySpriteNames();
    const gameplaySpritesReady = () => requiredGameplaySprites.every((name) => Boolean(sprites[name]));
    const ensureGameplayAssets = () => {
      if (!gameplayReady) {
        gameplayAssetsSettled = false;
        gameplayAssetsFailed = false;
        gameplayReady = loadGameplaySprites(sprites)
          .catch((error) => {
            gameplayAssetsFailed = true;
            console.error("게임 자산 추가 로드 실패", error);
          })
          .finally(() => {
            gameplayAssetsSettled = true;
            // A rejected batch is retryable after the connection recovers.
            if (gameplayAssetsFailed) gameplayReady = null;
          });
      }
      return gameplayReady;
    };
    scenes.setGameplayAssetsReady?.(
      ensureGameplayAssets,
      () => gameplayAssetsSettled && !gameplayAssetsFailed && gameplaySpritesReady(),
      () => gameplayAssetsFailed,
    );
  } catch (error) {
    releaseProfileLease?.();
    releaseProfileLease = null;
    profileLeaseTask = null;
    console.error("게임 초기화 실패", error);
    bootStatus?.classList.add("failed");
    if (bootTitle) bootTitle.textContent = "게임을 불러오지 못했습니다";
    if (bootDetail) bootDetail.textContent = "연결을 확인한 뒤 다시 시도해주세요";
    if (retry) retry.hidden = false;
  }
}

boot();
