const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const modeSelect = document.querySelector("#modeSelect");

const W = 640;
const H = 480;
const GROUND_Y = 402;
const BUILDING_X = 80;
const BUILDING_W = 480;
const FLOOR_H = 0x76;
const LANES = 3;
const LANE_W = BUILDING_W / LANES;
const GUARD_MAX = 100;
// Original delays the building phase until the 用意 countdown finishes: DAT_0041f6b4
// increments each frame and the first building spawns once it exceeds 0x2d (45),
// i.e. on frame 46. The web port previously spawned a building immediately.
const BUILDING_START_FRAME = 46;
// After spawning, the original holds the building stationary (velocityQ6 stays 0)
// for 30 frames — it begins falling on frame 76 — per FUN_00401530's root motion.
const BUILDING_HOLD_FRAMES = 30;
const WAZA_MAX = 100;
const TIME_LIMIT_FRAMES = 28800;
const PROGRESS_UNLOCK_ACT2 = 0x3841;
const PROGRESS_UNLOCK_ENDLESS = 0x7080;
const DIFFICULTY_LEVEL_FRAMES = 0x5dc;
const DIFFICULTY_PARAM_FRAMES = 600;
const MATERIAL_WEIGHTS = [6, 3, 1];
const ORIGINAL_BUILDING_SOURCE_STEP = 0x78;
const ORIGINAL_BUILDING_BOTTOM_SOURCE_Y = 0x1e0;
// Spawn margin chosen so the building's collision bottom edge starts at −544,
// matching the live original capture (raw spawn: by=−900, rows=3 → bottomEdge
// −544; web be₀ = ROW_HEIGHT − margin, independent of floor count). The old 0xee
// left the web building 426px lower, which made early jumps ram into it while
// the original's frame-96 jump grazes under it by ~1px.
const ORIGINAL_BUILDING_TOP_MARGIN = 0x298;
const ORIGINAL_ROW_PITCH = FLOOR_H;
const ORIGINAL_ROW_HEIGHT = ORIGINAL_BUILDING_SOURCE_STEP;
const BUILDING_BOTTOM_CAP_OVERLAP = ORIGINAL_ROW_HEIGHT - ORIGINAL_ROW_PITCH;
const ORIGINAL_LANE_W = 0xa0;
const ORIGINAL_FIELD_BOTTOM_Y = 0x1ac;
const ORIGINAL_SURFACE_COLORREFS = Object.freeze({
  blue: 0xfe9656,
  red: 0x2020a0,
  dark: 0x343434,
});
// Player y is the ground/feet anchor. The standing sprite's first visible
// body pixels begin 38px above that anchor, so grounded crush should meet the
// body/head line instead of waiting for the building to reach the feet.
const PLAYER_CRUSH_CONTACT_OFFSET_Y = 38;
const SLASH_REACH_TOP = ORIGINAL_ROW_HEIGHT + PLAYER_CRUSH_CONTACT_OFFSET_Y + 2;
const SLASH_REACH_BOTTOM = 0;
const CRUSH_CONTACT_Y = GROUND_Y - PLAYER_CRUSH_CONTACT_OFFSET_Y;
const CRUSH_GUARD_MIN = 8;
const PLAYER_DRAW_OFFSET_X = 66;
const PLAYER_DRAW_OFFSET_Y = 96;
const PLAYER_GUARD_OFFSET_Y = 122;
const PLAYER_HURT_FRAME = 20;
// Original keeps the player at screen y=220 while rising (camera target 250 minus
// the 30px blit offset; see camera state machine 0x401920/0x401850).
const CAMERA_TARGET_PLAYER_SCREEN_Y = 220;
const CAMERA_MIN_PLAYER_SCREEN_Y = 116;
const CAMERA_FOLLOW_LERP = 0.42;
const CAMERA_RETURN_LERP = 0.14;
const CAMERA_BACKGROUND_PARALLAX = 0.65;
const CAMERA_CLOUD_PARALLAX = 0.22;
const ORIGINAL_FRAME_RATE = 60;
const ORIGINAL_JUMP_MAX_COUNT = 1;
const ORIGINAL_JUMP_GROUND_Y = 0x130;
const ORIGINAL_JUMP_LAND_CHECK_Y = 0x127;
const ORIGINAL_JUMP_START_VY_PER_FRAME = -14;
// The original jump substate (0x402820) holds an 11-frame crouch before launch:
// after ArrowUp on frame 96 the player y only starts moving on frame 107.
const ORIGINAL_JUMP_PREP_FRAMES = 11;
const ORIGINAL_JUMP_GRAVITY_PER_FRAME = 0.1;
const ORIGINAL_JUMP_RELEASE_TARGET_VY_PER_FRAME = -6;
const ORIGINAL_JUMP_RELEASE_EASE_PER_FRAME = 0.45;
const ORIGINAL_JUMP_APEX_FRAMES = Math.ceil(Math.abs(ORIGINAL_JUMP_START_VY_PER_FRAME) / ORIGINAL_JUMP_GRAVITY_PER_FRAME);
const ORIGINAL_JUMP_MAX_HEIGHT = Math.round(
  -(
    ORIGINAL_JUMP_APEX_FRAMES * ORIGINAL_JUMP_START_VY_PER_FRAME
    + ORIGINAL_JUMP_GRAVITY_PER_FRAME * ORIGINAL_JUMP_APEX_FRAMES * (ORIGINAL_JUMP_APEX_FRAMES - 1) / 2
  ),
);
const JUMP_START_VY = ORIGINAL_JUMP_START_VY_PER_FRAME * ORIGINAL_FRAME_RATE;
const JUMP_GRAVITY = ORIGINAL_JUMP_GRAVITY_PER_FRAME * ORIGINAL_FRAME_RATE * ORIGINAL_FRAME_RATE;
// The original jump is a PURE parabola (vy −14, gravity +0.1/frame, no height
// clamp). The "apex at 803px / asymmetric descent" previously modeled here was a
// misread of the trace: the jumper had hit the falling building's bottom edge and
// was riding it down (collision manager 0x406890 pins floatY = bottomEdge−48 and
// sets vy = velQ6/128 — exactly the 0.867 vy snap and 1/128 "descent gravity"
// the trace showed). resolveAirborneBuildingPush() now reproduces that.
const JUMP_RELEASE_TARGET_VY = ORIGINAL_JUMP_RELEASE_TARGET_VY_PER_FRAME * ORIGINAL_FRAME_RATE;
const JUMP_LAND_CHECK_Y = GROUND_Y - (ORIGINAL_JUMP_GROUND_Y - ORIGINAL_JUMP_LAND_CHECK_Y);
const AIRBORNE_SAFE_Y = JUMP_LAND_CHECK_Y;
const STORAGE_KEY = "kirubiru.web.fullPort.v2";
const LEGACY_SCORE_KEY = "kirubiru.web.highScores.v1";
// Original GDI fonts (CreateFontA): ＭＳ明朝 and HGS行書体. Webfont fallbacks.
const FONT_MINCHO = '"Shippori Mincho", "MS Mincho", "ＭＳ 明朝", serif';
const FONT_BRUSH = '"Yuji Syuku", "HGS行書体", "Shippori Mincho", serif';
const DEMO_IDLE_SECONDS = 10;

const imageSources = {
  bg: "./public/assets/image/bg.png",
  bil10: "./public/assets/image/bil10.png",
  bil20: "./public/assets/image/bil20.png",
  bil30: "./public/assets/image/bil30.png",
  bougyo: "./public/assets/image/bougyo.png",
  bougyobar: "./public/assets/image/bougyobar.png",
  char: "./public/assets/image/char.png",
  combo: "./public/assets/image/combo.png",
  demo: "./public/assets/image/demo.png",
  hahen1: "./public/assets/image/hahen_1.png",
  hahen2: "./public/assets/image/hahen_2.png",
  hahen3: "./public/assets/image/hahen_3.png",
  hajime: "./public/assets/image/hajime.png",
  icon: "./public/assets/image/icon.png",
  info: "./public/assets/image/i.png",
  jump: "./public/assets/image/jump.png",
  kumo: "./public/assets/image/kumo.png",
  life: "./public/assets/image/life.png",
  load: "./public/assets/image/load.png",
  modoru: "./public/assets/image/modoru.png",
  modoru2: "./public/assets/image/modoru2.png",
  renzan: "./public/assets/image/renzan.png",
  renzanS: "./public/assets/image/renzan_s.png",
  saiengi: "./public/assets/image/saiengi.png",
  saiengi2: "./public/assets/image/saiengi2.png",
  score: "./public/assets/image/score.png",
  scoreS: "./public/assets/image/score_s.png",
  seika: "./public/assets/image/seika.png",
  slash: "./public/assets/image/slash.png",
  syuen: "./public/assets/image/syuen.png",
  ten: "./public/assets/image/ten.png",
  tenS: "./public/assets/image/ten_s.png",
  title: "./public/assets/image/title.png",
  tuti: "./public/assets/image/tuti.png",
  waza: "./public/assets/image/waza.png",
  wazabar: "./public/assets/image/wazabar.png",
  wazabar2: "./public/assets/image/wazabar2.png",
  youi: "./public/assets/image/youi.png",
  zan: "./public/assets/image/zan.png",
  dat001: "./public/assets/data/001.png",
  dat002: "./public/assets/data/002.png",
  dat003: "./public/assets/data/003.png",
  dat004: "./public/assets/data/004.png",
  dat005: "./public/assets/data/005.png",
  dat006: "./public/assets/data/006.png",
  dat007: "./public/assets/data/007.png",
  dat008: "./public/assets/data/008.png",
  dat009: "./public/assets/data/009.png",
  dat010: "./public/assets/data/010.png",
  dat011: "./public/assets/data/011.png",
  dat012: "./public/assets/data/012.png",
  dat013: "./public/assets/data/013.png",
  dat014: "./public/assets/data/014.png",
  dat015: "./public/assets/data/015.png",
  dat016: "./public/assets/data/016.png",
  dat017: "./public/assets/data/017.png",
  dat018: "./public/assets/data/018.png",
  dat019: "./public/assets/data/019.png",
  dat020: "./public/assets/data/020.png",
  dat021: "./public/assets/data/021.png",
  dat022: "./public/assets/data/022.png",
};

const soundSources = {
  bgm: "./public/assets/sound/bgm.mid",
  bougyo: "./public/assets/sound/bougyo.wav",
  enter: "./public/assets/sound/enter.wav",
  gorogoro: "./public/assets/sound/gorogoro.wav",
  hakai: "./public/assets/sound/hakai.wav",
  iwa: "./public/assets/sound/iwa.wav",
  jump: "./public/assets/sound/jump.wav",
  kaminari: "./public/assets/sound/kaminari.wav",
  move: "./public/assets/sound/move.wav",
  select: "./public/assets/sound/select.wav",
  sibire: "./public/assets/sound/sibire.wav",
  slash: "./public/assets/sound/slash.wav",
  slash2: "./public/assets/sound/slash2.wav",
  slash3: "./public/assets/sound/slash3.wav",
  tubure: "./public/assets/sound/tubure.wav",
  tyakuti: "./public/assets/sound/tyakuti.wav",
  waza: "./public/assets/sound/waza.wav",
};

const cleanImageSources = Object.fromEntries(
  Object.entries(imageSources).map(([key, src]) => [key, src.replace("./public/assets/", "./public/assets/clean/")]),
);

const modes = [
  {
    id: "act1",
    label: "第一幕",
    scoreKey: "score",
    replayKey: "replay10",
    timerFrames: TIME_LIMIT_FRAMES,
    baseSpeed: 72,
    scoreMul: 1,
    unlock: null,
    textureCycle: ["bil10", "bil20", "bil30"],
  },
  {
    id: "act2",
    label: "第二幕",
    scoreKey: "dainiScore",
    replayKey: "replay20",
    timerFrames: TIME_LIMIT_FRAMES,
    baseSpeed: 88,
    scoreMul: 1.25,
    unlock: "act2",
    textureCycle: ["bil20", "bil30", "bil10"],
  },
  {
    id: "endless",
    label: "とことん",
    scoreKey: "endlessScore",
    replayKey: "replay30",
    timerFrames: Infinity,
    baseSpeed: 66,
    scoreMul: 0.9,
    unlock: "endless",
    textureCycle: ["bil10", "bil20", "bil30"],
  },
];

// data/001.dat carries the unlocked title menu items as 240x90 rows.
const TITLE_MENU_SOURCE = {
  ranking: { y: 0 },
  act2: { y: 90 },
  endless: { y: 180 },
};
// Baked "始める" glyph position inside title.bmp (measured from the asset).
const TITLE_START_CROP = { x: 186, y: 266, w: 214, h: 70 };
const TITLE_BG_BLUE = "rgb(61, 119, 254)";
const ACT2_BUDDHA_ROWS = 6;
const ACT2_BUDDHA_SOURCE_ROW_H = 120;
const ACT2_BUDDHA_CYCLE = 3;
const HAZARD_FIRST_DELAY_FRAMES = 420;
const HAZARD_MIN_GAP_FRAMES = 300;
const HAZARD_RANDOM_GAP_FRAMES = 240;
const LIGHTNING_WARN_FRAMES = 45;
const LIGHTNING_STRIKE_FRAMES = 18;
const ROCK_SPEED = 220;
const ROCK_HIT_RANGE = 44;
const STUN_SECONDS = 1.1;

const MODE_NAME_SOURCE = { act1: { y: 0 }, act2: { y: 120 }, endless: { y: 240 } };
const MODE_NAME_W = 480;
const MODE_NAME_H = 120;
const MODE_TITLE_CARD = { act2: "dat016", endless: "dat017" };
const LEAF_FRAME_W = 16;
const LEAF_FRAME_H = 16;
const LEAF_COLUMNS = 4;
const RABBIT_FRAME_W = 80;
const RABBIT_FRAME_H = 80;
const SPARK_FRAME_W = 64;
const SPARK_FRAME_H = 64;

const PROLOGUE_TEXT = [
  "「月には、うさぎが住んでいる」",
  "",
  "一人の研究者の発言により、",
  "地球上は混乱状態におちいった…。",
  "",
  "その後、月との交信が成功し、",
  "人々は月のうさぎに興味深々となった。",
  "",
  "ところが…、",
  "うさぎ側は人間に完全降伏を促した！",
  "うさぎは、人間よりもはるかに優れた",
  "知能を持っていたのだ。",
  "",
  "完全な侵略者となったうさぎに対し、",
  "人間側は、侍に目を付けた！",
  "",
  "そして…、世界の強豪の中から、",
  "一人の侍が選ばれたのであった。",
  "",
  "侍は、月を想定してビルを斬り、",
  "修練を積み重ねた。",
  "",
  "今まさに、侍対うさぎの戦いが",
  "幕を開けようとしていた。",
];

const STAFF_TEXT = [
  "～スタッフ～",
  "",
  "",
  "堀内",
  "プログラミング",
  "シナリオ",
  "キャラ等のグラフィック",
  "",
  "",
  "liku",
  "プログラミング",
  "企画",
  "ビル等のグラフィック",
  "音楽",
  "",
  "",
  "sweet tast",
  "背景等のグラフィック",
];

const replaySlotOffsets = { act1: 0, act2: 10, endless: 20 };

const materialInfo = [
  { name: "soft", originalType: 1, hp: 1, color: "rgba(178, 230, 255, 0.18)", score: 80 },
  { name: "normal", originalType: 2, hp: 2, color: "rgba(255, 255, 255, 0.12)", score: 130 },
  { name: "hard", originalType: 3, hp: 3, color: "rgba(35, 37, 44, 0.22)", score: 210 },
];
const materialIndexByOriginalType = Object.fromEntries(
  materialInfo.map((info, index) => [info.originalType, index]),
);

const images = {};
const sounds = {};
const keys = new Set();
const pressed = new Set();
let manualClock = false;

const saveData = loadSave();
const state = {
  mode: "loading",
  ready: false,
  pendingActivate: false,
  sceneTimer: 0,
  frameCount: 0,
  selectedTitle: 0,
  selectedRank: 0,
  selectedReplay: 0,
  activeMode: modes[0],
  rngSeed: 0x1234,
  unlockMessage: "",
  demoTimer: 0,
  demoPlayback: false,
  pendingMode: null,
  prologueLine: 0,
  prologueScrollY: 0,
  score: 0,
  combo: 0,
  bestCombo: 0,
  life: 3,
  guard: GUARD_MAX,
  waza: 0,
  rank: 0,
  difficultyLevel: 1,
  timerFrames: TIME_LIMIT_FRAMES,
  runCleared: false,
  currentReplay: null,
  replayPlayback: null,
  cameraY: 0,
  lastSlashTrace: null,
  hazards: [],
  hazardTimer: HAZARD_FIRST_DELAY_FRAMES,
  act2BuildingIndex: 0,
  daibutsuAnnounce: 0,
  clouds: [
    { x: 58, y: 86, speed: 7 },
    { x: 360, y: 38, speed: 11 },
    { x: 512, y: 114, speed: 8 },
  ],
  player: {
    lane: 2,
    x: BUILDING_X + LANE_W * 2.5,
    y: GROUND_Y,
    vy: 0,
    lastGrounded: true,
    jumpPrepFrames: 0,
    attackTimer: 0,
    guardTimer: 0,
    specialTimer: 0,
    hurtTimer: 0,
    stunTimer: 0,
    jumpEffectTimer: 0,
    jumpCutApplied: false,
    jumpReleaseActive: false,
  },
  building: null,
  effects: [],
  debris: [],
  datManifest: null,
  errorMessage: "",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function loadSounds() {
  for (const [key, src] of Object.entries(soundSources)) {
    const audio = new Audio(src);
    audio.preload = "auto";
    sounds[key] = audio;
  }
}

async function loadAssets() {
  const [entries, cleanEntries] = await Promise.all([
    Object.entries(imageSources).map(async ([key, src]) => [key, await loadImage(src)]),
    Object.entries(cleanImageSources).map(async ([key, src]) => [key, await loadImage(src)]),
  ].map((jobs) => Promise.all(jobs)));
  for (const [key, img] of entries) images[key] = img;
  for (const [key, img] of cleanEntries) images[`${key}Clean`] = img;
  try {
    await Promise.all([
      document.fonts.load(`18px ${FONT_MINCHO}`),
      document.fonts.load(`44px ${FONT_BRUSH}`),
    ]);
  } catch {
    // Canvas text falls back to system serif when webfonts are unavailable.
  }
  loadSounds();
  state.datManifest = buildDatManifest();
  state.ready = true;
  state.mode = "title";
  if (state.pendingActivate) {
    state.pendingActivate = false;
    confirmAction();
  }
}

function buildDatManifest() {
  return {
    midiDuplicate: "data/000.dat matches BGM class and is represented by sound/bgm.mid",
    convertedBmpCount: 22,
    integrated: [
      "data/001.dat unlocked title menu rows",
      "data/002.dat Act2 Fuji background",
      "data/003.dat Act1 clear banner 第二幕へ続く",
      "data/004.dat Act2 daibutsu falling object",
      "data/005.dat mode name panels (不景気/煩悩/雑念) shown at game start",
      "data/006.dat + data/012.dat lightning hazard",
      "data/007.dat rolling rock hazard",
      "data/008.dat + data/022.dat Endless night sky and moon",
      "data/009.dat leaf particles on slash hit",
      "data/010.dat rabbit sprite on results screen",
      "data/011.dat hook effect on special attack",
      "data/013.dat top-3 ranking label",
      "data/014.dat small ranking icon",
      "data/015.dat Buddha announce card",
      "data/016.dat Act2 mode title card (第二幕)",
      "data/017.dat Endless mode title card (とことん)",
      "data/019.dat Act2 clear banner 作戦成功",
      "data/020.dat tombstone decoration in Endless background",
      "data/021.dat spark effect on combo milestones",
    ],
    decodedTextData: [
      "data/023.dat prologue text (shown in prologue scene)",
      "data/024.dat timeline and staff text (shown in staff scene)",
    ],
    preservedAssets: [
      "data/018.dat arrow frames preserved from the DAT set; title selection uses image/icon.png sword marker",
    ],
    unresolvedTextData: [],
    note: "BMP DAT files are converted to public/assets/data. Text DAT files 023/024 are decoded by the recovered byte ^ 0x3a line parser and exported under reverse/out_static_deep.",
  };
}

function defaultScores(modeId) {
  return [];
}

function progressUnlockLevel(progressUnits) {
  if (progressUnits > PROGRESS_UNLOCK_ENDLESS) return 2;
  if (progressUnits >= PROGRESS_UNLOCK_ACT2) return 1;
  return 0;
}

function syncUnlocksFromProgress(data) {
  const legacyLevel = data.unlocks?.endless ? 2 : data.unlocks?.act2 ? 1 : 0;
  data.unlockLevel = Math.max(
    legacyLevel,
    Number.isFinite(data.unlockLevel) ? Math.max(0, Math.min(2, Math.floor(data.unlockLevel))) : 0,
    progressUnlockLevel(data.progressUnits || 0),
  );
  data.unlocks = {
    act2: data.unlockLevel >= 1,
    endless: data.unlockLevel >= 2,
  };
}

function loadSave() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    parsed = null;
  }
  const data = parsed && typeof parsed === "object" ? parsed : {};
  const progress = Number(data.progressUnits);
  data.progressUnits = Number.isFinite(progress) && progress > 0 ? Math.floor(progress) : 0;
  syncUnlocksFromProgress(data);
  data.scores = data.scores && typeof data.scores === "object" ? data.scores : {};
  for (const mode of modes) {
    if (!Array.isArray(data.scores[mode.id])) data.scores[mode.id] = defaultScores(mode.id);
    data.scores[mode.id] = data.scores[mode.id]
      .filter((row) => Number.isFinite(row.score) && row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((row, index) => ({
        ...row,
        mode: row.mode || mode.id,
        replaySlot: row.replay ? replaySlotOffsets[mode.id] + index + 1 : null,
      }));
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SCORE_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length) {
      data.scores.act1 = [...data.scores.act1, ...legacy.map((row) => ({ ...row, mode: "act1" }))]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((row, index) => ({
          ...row,
          replaySlot: row.replay ? replaySlotOffsets.act1 + index + 1 : null,
        }));
      localStorage.removeItem(LEGACY_SCORE_KEY);
    }
  } catch {
    // Ignore legacy migration errors.
  }

  data.replays = data.replays && typeof data.replays === "object" ? data.replays : {};
  data.prologueSeen = Boolean(data.prologueSeen);
  return data;
}

function persistSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
}

function playSound(name, volume = 0.32) {
  const src = sounds[name];
  if (!src) return;
  try {
    const audio = src.cloneNode(true);
    audio.volume = volume;
    const result = audio.play();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // Browser gesture policy can block audio; gameplay must continue.
  }
}

let bgmStarted = false;
let bgmSynths = [];

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function loadBgmArrayBuffer() {
  if (window.KIRUBIRU_BGM_MIDI_BASE64) return base64ToArrayBuffer(window.KIRUBIRU_BGM_MIDI_BASE64);
  const response = await fetch("./public/assets/sound/bgm.mid");
  return response.arrayBuffer();
}

async function playBgmHint() {
  if (bgmStarted) return;
  bgmStarted = true;
  if (typeof Tone === "undefined" || typeof Midi === "undefined") {
    const src = sounds.bgm;
    if (!src) return;
    const canPlayMidi = src.canPlayType("audio/midi") || src.canPlayType("audio/x-midi");
    if (!canPlayMidi) return;
    try { src.loop = true; src.volume = 0.22; const r = src.play(); if (r?.catch) r.catch(() => {}); } catch {}
    return;
  }
  try {
    await Tone.start();
    const arrayBuf = await loadBgmArrayBuffer();
    const midi = new Midi(arrayBuf);
    const now = Tone.now() + 0.1;
    for (const track of midi.tracks) {
      if (track.notes.length === 0) continue;
      // GM channel 10 is percussion; pitched playback of it is wrong.
      if (track.channel === 9 || track.instrument?.percussion) {
        const kick = new Tone.MembraneSynth({
          envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
        }).toDestination();
        const noise = new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
        }).toDestination();
        kick.volume.value = -16;
        noise.volume.value = -22;
        bgmSynths.push(kick, noise);
        for (const note of track.notes) {
          if (note.midi <= 45) kick.triggerAttackRelease("C2", 0.1, now + note.time, note.velocity * 0.7);
          else noise.triggerAttackRelease(0.06, now + note.time, note.velocity * 0.5);
        }
        continue;
      }
      const synth = new Tone.PolySynth(Tone.Synth, {
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
      }).toDestination();
      synth.volume.value = -14;
      bgmSynths.push(synth);
      for (const note of track.notes) {
        synth.triggerAttackRelease(note.name, note.duration, now + note.time, note.velocity * 0.6);
      }
    }
    const totalDuration = midi.duration;
    if (totalDuration > 0) {
      const loopBgm = () => {
        Tone.Transport.scheduleOnce(() => {
          for (const s of bgmSynths) s.releaseAll?.();
          bgmSynths = [];
          bgmStarted = false;
          playBgmHint();
        }, `+${totalDuration + 0.5}`);
      };
      loopBgm();
      Tone.Transport.start();
    }
  } catch {
    // Web Audio MIDI playback failed; gameplay continues without BGM.
  }
}

function modeUnlocked(mode) {
  return !mode.unlock || saveData.unlocks[mode.unlock];
}

// The original adds unlocked acts directly to the title menu
// ("タイトル画面で選べるようになりました！") using data/001.dat rows.
function titleMenuItems() {
  const items = [{ id: "start" }];
  if (saveData.unlocks.act2) items.push({ id: "act2" });
  if (saveData.unlocks.endless) items.push({ id: "endless" });
  items.push({ id: "ranking" });
  return items;
}

function setScene(mode) {
  state.mode = mode;
  state.sceneTimer = 0;
  state.demoTimer = 0;
  syncModeSelect();
}

// Keep the header dropdown in sync with the running mode.
function syncModeSelect() {
  if (!modeSelect) return;
  const inRun = ["gameStart", "play", "results", "gameOver"].includes(state.mode);
  modeSelect.value = inRun ? state.activeMode.id : "";
}

function currentScores() {
  return saveData.scores[state.activeMode.id] || defaultScores(state.activeMode.id);
}

function confirmAction() {
  if (!state.ready) {
    state.pendingActivate = true;
    return;
  }
  playBgmHint();

  if (state.mode === "title") {
    const item = titleMenuItems()[state.selectedTitle] || { id: "start" };
    if (item.id === "ranking") {
      state.selectedRank = 0;
      state.selectedReplay = 0;
      state.activeMode = modes[0];
      setScene("ranking");
    } else {
      const modeId = item.id === "start" ? "act1" : item.id;
      const mode = modes.find((entry) => entry.id === modeId) || modes[0];
      state.activeMode = mode;
      startGame(mode);
    }
    playSound("enter");
    return;
  }

  if (state.mode === "ranking") {
    if (state.selectedReplay < 0) {
      setScene("title");
      playSound("enter");
      return;
    }
    const row = currentScores()[state.selectedReplay];
    if (row?.replay) {
      startReplay(row.replay, row.mode || state.activeMode.id);
      playSound("enter");
    }
    return;
  }

  if (state.mode === "results" || state.mode === "gameOver") {
    // Act2 clear rolls the data/024 ending credits (作戦成功 → staff roll).
    if (state.mode === "results" && state.runCleared && state.activeMode.id === "act2") {
      state.prologueScrollY = 0;
      setScene("staff");
    } else {
      setScene("title");
    }
    playSound("enter");
    return;
  }

  if (state.mode === "play") slash();
}

function justPressed(code) {
  if (pressed.has(code)) {
    pressed.delete(code);
    return true;
  }
  return false;
}

function consumeDirectionalInput() {
  const gp = readGamepadButtons();
  const up = justPressed("ArrowUp") || justPressed("KeyW") || gp.up;
  const upHeld = keys.has("ArrowUp") || keys.has("KeyW") || gp.upHeld;
  const down = justPressed("ArrowDown") || justPressed("KeyS") || gp.down;
  const left = justPressed("ArrowLeft") || justPressed("KeyA") || gp.left;
  const right = justPressed("ArrowRight") || justPressed("KeyD") || gp.right;
  const slashButton = justPressed("KeyZ") || justPressed("Enter") || justPressed("Space") || gp.button1;
  const specialButton = justPressed("KeyX") || gp.button2;
  return { up, upHeld, down, left, right, slashButton, specialButton, gp };
}

const gamepadLatch = {
  button1: false,
  button2: false,
  up: false,
  down: false,
  left: false,
  right: false,
};

function readGamepadButtons() {
  const result = { button1: false, button2: false, up: false, upHeld: false, down: false, left: false, right: false, guard: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find(Boolean);
  if (!pad) return result;
  const axesX = pad.axes[0] || 0;
  const axesY = pad.axes[1] || 0;
  const raw = {
    button1: Boolean(pad.buttons[0]?.pressed),
    button2: Boolean(pad.buttons[1]?.pressed),
    up: Boolean(pad.buttons[12]?.pressed) || axesY < -0.55,
    down: Boolean(pad.buttons[13]?.pressed || pad.buttons[2]?.pressed) || axesY > 0.55,
    left: Boolean(pad.buttons[14]?.pressed) || axesX < -0.55,
    right: Boolean(pad.buttons[15]?.pressed) || axesX > 0.55,
  };
  result.upHeld = raw.up;
  result.guard = raw.down;
  for (const key of Object.keys(gamepadLatch)) {
    result[key] = raw[key] && !gamepadLatch[key];
    gamepadLatch[key] = raw[key];
  }
  return result;
}

function startGame(mode) {
  // First Act1 start rolls the data/023 prologue before the run.
  if (mode.id === "act1" && !saveData.prologueSeen) {
    state.pendingMode = mode;
    state.prologueScrollY = 0;
    setScene("prologue");
    return;
  }
  beginRun(mode);
}

function beginRun(mode) {
  state.activeMode = mode;
  state.rngSeed = Date.now() >>> 0;
  resetRunState();
  state.currentReplay = { mode: mode.id, seed: state.rngSeed, frames: [] };
  setScene("gameStart");
}

function startReplay(replay, modeId) {
  const mode = modes.find((entry) => entry.id === modeId) || modes[0];
  state.activeMode = mode;
  state.rngSeed = Number.isFinite(replay?.seed) ? replay.seed >>> 0 : 0x1234;
  resetRunState();
  state.replayPlayback = {
    frames: Array.isArray(replay.frames) ? replay.frames : [],
    cursor: 0,
  };
  setScene("replay");
}

// Title idle starts an attract playback under the demo.bmp 公開演技 banner.
function startDemoPlayback() {
  for (const mode of modes) {
    const row = (saveData.scores[mode.id] || []).find((entry) => entry.replay);
    if (row?.replay) {
      state.demoPlayback = true;
      startReplay(row.replay, row.mode || mode.id);
      return;
    }
  }
  state.demoTimer = 0;
}

function resetRunState() {
  state.frameCount = 0;
  state.score = 0;
  state.combo = 0;
  state.bestCombo = 0;
  state.life = 3;
  state.guard = GUARD_MAX;
  state.waza = 0;
  state.rank = 0;
  state.difficultyLevel = 1;
  state.timerFrames = state.activeMode.timerFrames;
  state.runCleared = false;
  state.effects = [];
  state.debris = [];
  state.hazards = [];
  state.hazardTimer = HAZARD_FIRST_DELAY_FRAMES;
  state.act2BuildingIndex = 0;
  state.daibutsuAnnounce = 0;
  state.cameraY = 0;
  state.lastSlashTrace = null;
  state.player.lane = 1;
  state.player.x = BUILDING_X + LANE_W * 1.5;
  state.player.y = GROUND_Y;
  state.player.vy = 0;
  state.player.lastGrounded = true;
  state.player.attackTimer = 0;
  state.player.guardTimer = 0;
  state.player.specialTimer = 0;
  state.player.hurtTimer = 0;
  state.player.stunTimer = 0;
  state.player.jumpEffectTimer = 0;
  state.player.jumpCutApplied = false;
  state.player.jumpReleaseActive = false;
  state.player.jumpPrepFrames = 0;
  state.building = null;
}

function addRunProgress() {
  const before = {
    act2: saveData.unlocks.act2,
    endless: saveData.unlocks.endless,
  };
  const gained = Math.floor(state.frameCount / 60);
  saveData.progressUnits = Math.max(0, Math.floor(saveData.progressUnits || 0) + gained);
  // Surviving the full act timer also advances the unlock level directly,
  // matching the 第二幕へ続く / 作戦成功 clear banners in data/003 and data/019.
  if (state.runCleared) {
    const clearLevel = state.activeMode.id === "act1" ? 1 : state.activeMode.id === "act2" ? 2 : 0;
    saveData.unlockLevel = Math.max(saveData.unlockLevel || 0, clearLevel);
  }
  syncUnlocksFromProgress(saveData);
  const messages = [];
  if (!before.act2 && saveData.unlocks.act2) {
    messages.push("第二幕が選べるようになりました！");
  }
  if (!before.endless && saveData.unlocks.endless) {
    messages.push("とことんが選べるようになりました！");
  }
  return messages;
}

function saveScore() {
  const messages = addRunProgress();
  if (state.score <= 0) {
    state.rank = 0;
    state.unlockMessage = messages.join("  タイトル画面で選べます。 ");
    persistSave();
    return;
  }
  const replay = state.currentReplay
    ? { mode: state.currentReplay.mode, seed: state.currentReplay.seed, frames: state.currentReplay.frames.slice(0, 36000) }
    : null;
  const row = {
    score: state.score,
    combo: state.bestCombo,
    date: new Date().toISOString().slice(0, 10),
    replay,
    mode: state.activeMode.id,
    replaySlot: null,
  };
  const rows = [...currentScores(), row].sort((a, b) => b.score - a.score).slice(0, 10);
  saveData.scores[state.activeMode.id] = rows.map((entry, index) => ({
    ...entry,
    replaySlot: entry.replay ? replaySlotOffsets[state.activeMode.id] + index + 1 : null,
  }));
  state.rank = rows.indexOf(row) + 1;
  state.unlockMessage = messages.join("  タイトル画面で選べます。 ");
  persistSave();
}

function finishRun(reason) {
  if (state.mode === "replay") {
    const wasDemo = state.demoPlayback;
    state.demoPlayback = false;
    state.replayPlayback = null;
    setScene(wasDemo ? "title" : "ranking");
    return;
  }
  state.runCleared = reason === "timer" && state.life > 0;
  saveScore();
  state.currentReplay = null;
  state.replayPlayback = null;
  playSound(state.runCleared ? "enter" : "tubure", 0.45);
  setScene("gameOver");
}

function getDifficultyBase() {
  return difficultyBaseForFrame(state.frameCount, state.activeMode.id);
}

function difficultyBaseForFrame(frame, modeId) {
  const elapsedFrames = Math.max(0, Math.floor(Number(frame) || 0));
  const level = Math.floor(elapsedFrames / DIFFICULTY_LEVEL_FRAMES) + 1;
  const span = Math.floor(elapsedFrames / DIFFICULTY_PARAM_FRAMES);
  const modeBoost = modeId === "act2"
    ? 16
    : modeId === "endless"
      ? Math.min(60, elapsedFrames / 1800)
      : 0;
  return { elapsedFrames, level, span, modeBoost };
}

function difficultyProjectionForFrame(frame, modeId = state.activeMode.id) {
  const base = difficultyBaseForFrame(frame, modeId);
  return {
    frame: base.elapsedFrames,
    mode: "difficultyProjection",
    activeMode: modeId,
    timerFrames: modeId === "endless" ? null : Math.max(0, TIME_LIMIT_FRAMES - base.elapsedFrames),
    score: 0,
    combo: 0,
    life: 3,
    guard: GUARD_MAX,
    waza: 0,
    player: {
      lane: 1,
      x: Math.round(BUILDING_X + LANE_W * 1.5),
      y: GROUND_Y,
      screenY: GROUND_Y,
      vy: 0,
      jumping: false,
    },
    camera: { y: 0 },
    building: {
      y: null,
      speed: null,
      level: base.level,
      floorCount: null,
      floorCountMin: Math.min(100, base.span + 1),
      floorCountMax: Math.min(100, base.span * 2 + 1),
      floorsRemaining: null,
      objectRows: null,
      velocityQ6: null,
      fixedYQ6: null,
      accelerationQ6: base.level,
      bottomY: null,
      bottomEdge: null,
      laneHpAtBottom: null,
      laneTypeAtBottom: null,
      laneHp0: null,
      laneHp1: null,
      laneHp2: null,
      laneType0: null,
      laneType1: null,
      laneType2: null,
      activeRowIndex: null,
      activeRowY: null,
      activeRowFlag: null,
      activeRowRemaining: null,
      activeRowLane: null,
      activeRowDamage: null,
    },
    difficulty: base,
    collisionProbe: {
      crushContact: null,
      playerAirborneForCrush: null,
      bottomLanePassSafe: null,
      slashTarget: null,
    },
  };
}

function rand15() {
  state.rngSeed = (Math.imul(state.rngSeed, 0x343fd) + 0x269ec3) >>> 0;
  return (state.rngSeed >>> 16) & 0x7fff;
}

function randInt(max) {
  return max <= 1 ? 0 : rand15() % max;
}

function rollBuildingDifficulty() {
  const base = getDifficultyBase();
  const floorCount = Math.min(100, randInt(base.span + 1) + 1 + base.span);
  return {
    level: base.level,
    floorCount,
    textureIndex: randInt(3),
    accelerationQ6: base.level,
  };
}

function newBuilding() {
  const d = rollBuildingDifficulty();
  let special = null;
  let count = d.floorCount;
  let texture;
  if (state.activeMode.id === "act2") {
    state.act2BuildingIndex += 1;
    if (state.act2BuildingIndex % ACT2_BUDDHA_CYCLE === 0) special = "daibutsu";
  }
  if (special === "daibutsu") {
    count = ACT2_BUDDHA_ROWS;
    texture = "dat004";
    state.daibutsuAnnounce = 3;
    playSound("kaminari", 0.35);
  } else {
    const cycle = state.activeMode.textureCycle;
    texture = cycle[d.textureIndex % cycle.length];
  }
  const floors = [];
  for (let i = 0; i < count; i += 1) {
    const pattern = special === "daibutsu"
      ? (i % 2 === 0 ? [2, 3, 2] : [3, 2, 3])
      : materialPattern();
    floors.push({
      rowIndex: i + 1,
      cells: pattern.map((originalType) => {
        const type = materialIndexByOriginalType[originalType] ?? 1;
        const info = materialInfo[type];
        return {
          type,
          originalType,
          sourceY: special === "daibutsu"
            ? i * ACT2_BUDDHA_SOURCE_ROW_H
            : buildingSourceYForOriginalType(originalType),
          hp: info.hp,
          flash: 0,
        };
      }),
    });
  }
  const y = renderCameraY() - count * FLOOR_H - ORIGINAL_BUILDING_TOP_MARGIN;
  return {
    y,
    fixedYQ6: y * 0x40,
    velocityQ6: 0,
    accelerationQ6: d.accelerationQ6,
    holdFrames: BUILDING_HOLD_FRAMES,
    speed: 0,
    texture,
    special,
    floors,
    level: d.level,
    floorCount: count,
    objectRows: count + 2,
  };
}

function materialPattern() {
  const total = MATERIAL_WEIGHTS.reduce((sum, value) => sum + value, 0);
  const firstLimit = Math.floor((MATERIAL_WEIGHTS[0] * 100) / total);
  const secondLimit = Math.floor((MATERIAL_WEIGHTS[1] * 100) / total);
  const result = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const roll = randInt(100);
    if (roll < firstLimit) result.push(1);
    else result.push(roll >= firstLimit + secondLimit ? 3 : 2);
  }
  return result;
}

function buildingSourceYForOriginalType(originalType) {
  return (4 - originalType) * ORIGINAL_BUILDING_SOURCE_STEP;
}

function recordReplayInput(input) {
  if (!state.currentReplay || state.mode !== "play") return;
  const flags = [];
  if (input.left) flags.push("left");
  if (input.right) flags.push("right");
  if (input.up || input.upHeld) flags.push("up");
  for (const key of ["down", "slash", "special"]) {
    if (input[key]) flags.push(key);
  }
  if (flags.length) state.currentReplay.frames.push([state.frameCount, flags.join(",")]);
}

function inputFromReplay() {
  const result = { left: false, right: false, up: false, upHeld: false, down: false, slash: false, special: false };
  const replay = state.replayPlayback;
  if (!replay) return result;
  while (replay.cursor < replay.frames.length && replay.frames[replay.cursor][0] <= state.frameCount) {
    const flags = String(replay.frames[replay.cursor][1] || "").split(",");
    for (const flag of flags) {
      if (flag in result) result[flag] = true;
    }
    replay.cursor += 1;
  }
  result.upHeld = result.up;
  return result;
}

function moveLane(dir) {
  const next = Math.max(0, Math.min(LANES - 1, state.player.lane + dir));
  if (next === state.player.lane) return;
  state.player.lane = next;
  state.player.x = BUILDING_X + LANE_W * (next + 0.5);
  playSound("move", 0.22);
}

function jump() {
  const p = state.player;
  if (Math.abs(p.y - GROUND_Y) > 1) return;
  if (p.jumpPrepFrames > 0) return; // already crouching; holding up must not restart it
  p.jumpPrepFrames = ORIGINAL_JUMP_PREP_FRAMES;
  // Original sets vy=-14 immediately at the crouch; y only moves once the crouch
  // completes, so hold vy and defer the y motion.
  p.vy = JUMP_START_VY;
  p.jumpCutApplied = false;
  p.jumpReleaseActive = false;
  p.jumpEffectTimer = 0.35;
  spawnEffect("jump", p.x - 96, GROUND_Y - 36);
  playSound("jump", 0.28);
}

function slash() {
  const p = state.player;
  p.attackTimer = 0.16;
  const target = findSlashTarget();
  if (!target) {
    state.lastSlashTrace = {
      frame: state.frameCount,
      hit: false,
      lane: p.lane,
      damage: 0,
      collapsed: false,
    };
    playSound("slash", 0.2);
    return;
  }

  const { floor, cell, floorY } = target;
  const hpBefore = cell.hp;
  const remainingBefore = floor.cells.filter((candidate) => candidate.hp > 0).length;
  cell.hp -= 1;
  cell.flash = 0.2;
  const collapsed = cell.hp <= 0;
  const remainingAfter = collapsed ? 0 : floor.cells.filter((candidate) => candidate.hp > 0).length;
  state.lastSlashTrace = {
    frame: state.frameCount,
    hit: true,
    targetIndex: target.index,
    rowIndex: floor.rowIndex,
    y: Math.round(floorY),
    lane: p.lane,
    damage: 1,
    hpBefore,
    hpAfter: Math.max(0, cell.hp),
    remainingBefore,
    remainingAfter,
    collapsed,
    originalType: cell.originalType,
  };
  const hitX = BUILDING_X + state.player.lane * LANE_W + LANE_W / 2;
  state.effects.push({ type: "slash", x: hitX, y: floorY + 16, t: 0 });
  for (let li = 0; li < 3; li += 1) {
    state.effects.push({
      type: "leaf",
      x: hitX + (Math.random() - 0.5) * 60,
      y: floorY + Math.random() * 30,
      vx: (Math.random() - 0.5) * 120,
      vy: -40 - Math.random() * 80,
      frame: Math.floor(Math.random() * LEAF_COLUMNS),
      t: 0,
    });
  }

  if (collapsed) {
    const info = materialInfo[cell.type];
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.score += Math.round((info.score + state.combo * 12) * state.activeMode.scoreMul);
    state.waza = Math.min(WAZA_MAX, state.waza + 5 + Math.min(16, state.combo));
    if (state.combo > 0 && state.combo % 10 === 0) {
      state.effects.push({ type: "spark", x: hitX, y: floorY, t: 0 });
    }
    spawnDebris(hitX, floorY + 22, cell.type + 3);
    playSound(cell.type === 2 ? "iwa" : state.combo % 3 === 0 ? "slash3" : "slash2", 0.3);
    collapseFloor(target.index, floor, floorY);
  } else {
    state.score += Math.round(20 * state.activeMode.scoreMul);
    state.waza = Math.min(WAZA_MAX, state.waza + 2);
    playSound(cell.type === 2 ? "iwa" : "slash2", 0.28);
  }
}

function collapseFloor(index, floor, floorY) {
  state.score += Math.round((300 + state.combo * 20) * state.activeMode.scoreMul);
  for (let lane = 0; lane < LANES; lane += 1) {
    const piece = floor.cells[lane];
    if (piece.hp > 0) {
      const x = BUILDING_X + lane * LANE_W + LANE_W / 2;
      spawnDebris(x, floorY + 22, piece.type + 2);
    }
    piece.hp = 0;
  }
  state.building.floors.splice(index, 1);
  spawnDust(BUILDING_X + BUILDING_W / 2, floorY);
  spawnDebris(BUILDING_X + BUILDING_W / 2, floorY + 18, 18);
  playSound("hakai", 0.4);
}

function special() {
  if (state.waza < WAZA_MAX || !state.building) return;
  state.waza = 0;
  state.player.specialTimer = 0.75;
  const removed = Math.min(3, state.building.floors.length);
  const firstRemoved = state.building.floors[Math.max(0, state.building.floors.length - removed)];
  const y = firstRemoved ? floorWorldY(firstRemoved) : state.building.y;
  state.building.floors.splice(Math.max(0, state.building.floors.length - removed), removed);
  state.score += Math.round((removed * 700 + state.combo * 30) * state.activeMode.scoreMul);
  state.combo += removed * 2;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  spawnDust(BUILDING_X + BUILDING_W / 2, y + 80);
  spawnDebris(BUILDING_X + BUILDING_W / 2, y + 70, 26);
  state.effects.push({ type: "hook", x: state.player.x, y: state.player.y - 60, t: 0 });
  spawnEffect("renzan", 220, 160);
  playSound("waza", 0.45);
  playSound("kaminari", 0.3);
}

function findSlashTarget() {
  const b = state.building;
  if (!b) return null;
  for (let i = b.floors.length - 1; i >= 0; i -= 1) {
    const floorY = floorWorldY(b.floors[i]);
    const inReach = floorY < state.player.y - SLASH_REACH_BOTTOM
      && floorY + ORIGINAL_ROW_HEIGHT > state.player.y - SLASH_REACH_TOP;
    if (!inReach) continue;
    const floor = b.floors[i];
    const cell = floor.cells[state.player.lane];
    if (cell.hp > 0) return { index: i, floor, cell, floorY };
  }
  return null;
}

function floorWorldY(floor) {
  return state.building.y + floor.rowIndex * FLOOR_H;
}

function buildingBottomFloorY(building) {
  const floor = building.floors[building.floors.length - 1];
  return building.y + floor.rowIndex * FLOOR_H;
}

function buildingGameplayBottomEdge(building) {
  return buildingBottomFloorY(building) + ORIGINAL_ROW_HEIGHT;
}

function buildingVisualBottomCapTop(building) {
  return building.special
    ? buildingBottomFloorY(building)
    : buildingGameplayBottomEdge(building) - BUILDING_BOTTOM_CAP_OVERLAP;
}

function buildingVisualBottomEdge(building) {
  return building.special
    ? buildingGameplayBottomEdge(building)
    : buildingVisualBottomCapTop(building) + ORIGINAL_ROW_HEIGHT;
}

function buildingCrushContactSurfaceY(building) {
  return buildingVisualBottomEdge(building);
}

function spawnEffect(kind, x, y) {
  state.effects.push({ type: kind, x, y, t: 0 });
}

function spawnDust(x, y) {
  state.effects.push({ type: "dust", x, y, t: 0 });
}

function spawnDebris(x, y, count) {
  const sprites = ["hahen1Clean", "hahen2Clean", "hahen3Clean"];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
    const speed = 60 + Math.random() * 160;
    state.debris.push({
      sprite: sprites[i % sprites.length],
      x: x + (Math.random() - 0.5) * 90,
      y: y + (Math.random() - 0.5) * 24,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
      t: 0,
      life: 0.75 + Math.random() * 0.6,
    });
  }
}

function update(dt) {
  if (!state.ready) return;
  state.sceneTimer += dt;
  state.demoTimer += dt;
  updateClouds(dt);
  updateEffects(dt);
  if (state.mode === "title") updateTitle();
  if (state.mode === "prologue") updatePrologue(dt);
  if (state.mode === "staff") updateStaff(dt);
  if (state.mode === "gameStart") updateGameStart();
  if (state.mode === "play") updatePlay(dt);
  if (state.mode === "replay") {
    const steps = keys.has("Tab") ? 4 : 1;
    for (let i = 0; i < steps && state.mode === "replay"; i += 1) updatePlay(dt);
  }
  if (state.mode === "gameOver") updateGameOver();
  if (state.mode === "results") updateResults();
  if (state.mode === "ranking") updateRanking();
  pressed.clear();
}

function updateTitle() {
  const input = consumeDirectionalInput();
  if (input.up || input.down || input.slashButton || input.specialButton) state.demoTimer = 0;
  if (state.demoTimer >= DEMO_IDLE_SECONDS) {
    startDemoPlayback();
    return;
  }
  const count = titleMenuItems().length;
  if (state.selectedTitle >= count) state.selectedTitle = count - 1;
  if (input.up) {
    state.selectedTitle = (state.selectedTitle + count - 1) % count;
    playSound("select", 0.25);
  }
  if (input.down) {
    state.selectedTitle = (state.selectedTitle + 1) % count;
    playSound("select", 0.25);
  }
  if (input.slashButton) confirmAction();
  if (input.specialButton) {
    state.prologueScrollY = 0;
    setScene("prologue");
    playSound("enter");
  }
}

function updateGameStart() {
  if (state.sceneTimer >= 1.65) setScene("play");
}

function updatePlay(dt) {
  const p = state.player;
  let input;
  if (state.mode === "replay") {
    // Attract demo ends on any key press.
    if (state.demoPlayback && pressed.size > 0) {
      state.demoPlayback = false;
      state.replayPlayback = null;
      setScene("title");
      return;
    }
    consumeDirectionalInput();
    input = inputFromReplay();
    if (justPressed("KeyZ") || justPressed("Enter") || justPressed("Escape")) {
      state.replayPlayback = null;
      setScene("ranking");
      return;
    }
  } else {
    const real = consumeDirectionalInput();
    input = {
      left: real.left,
      right: real.right,
      up: real.up,
      upHeld: real.upHeld,
      down: keys.has("ArrowDown") || keys.has("KeyS") || real.gp.guard,
      slash: real.slashButton,
      special: real.specialButton,
    };
    recordReplayInput(input);
  }

  const stunned = p.stunTimer > 0;
  if (!stunned) {
    if (input.left) moveLane(-1);
    if (input.right) moveLane(1);
    if (input.up) jump();
    if (input.slash) slash();
    if (input.special) special();
  }

  if (!stunned && input.down && state.guard > 0) {
    state.guard = Math.max(0, state.guard - dt * 60);
    p.guardTimer = 0.1;
  } else {
    state.guard = Math.min(GUARD_MAX, state.guard + dt * 15);
    p.guardTimer = Math.max(0, p.guardTimer - dt);
  }

  // Original airborne substate (0x4028f0): an 11-frame crouch (vy already −14,
  // y waits), then pure integration floatY += vy; vy += 0.1/frame — no height
  // clamp; ceilings come from the building push (resolveAirborneBuildingPush).
  if (p.jumpPrepFrames > 0) {
    p.jumpPrepFrames -= 1;
  } else if (p.y < GROUND_Y || p.vy !== 0) {
    p.y += p.vy * dt;
    p.vy += JUMP_GRAVITY * dt;
  }
  // Land only when descending past the original's check line (raw y > 0x127),
  // never during the crouch or the launch frame.
  if (p.jumpPrepFrames === 0 && p.vy >= 0 && p.y >= JUMP_LAND_CHECK_Y) {
    if (!p.lastGrounded) playSound("tyakuti", 0.25);
    p.y = GROUND_Y;
    p.vy = 0;
    p.lastGrounded = true;
    p.jumpCutApplied = false;
    p.jumpReleaseActive = false;
  } else {
    p.lastGrounded = false;
  }
  // The original camera DOES follow the player during the jump: a state machine
  // (0x401850/0x401920) keeps the player ~250px from the top while rising fast
  // (vy < -2), then returns the camera to 0 at the apex/descent. (An earlier read
  // of the wrong camera address made it look fixed; reverted.)
  updateCamera();
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.specialTimer = Math.max(0, p.specialTimer - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  p.stunTimer = Math.max(0, p.stunTimer - dt);
  p.jumpEffectTimer = Math.max(0, p.jumpEffectTimer - dt);
  state.daibutsuAnnounce = Math.max(0, state.daibutsuAnnounce - dt);

  state.frameCount += 1;
  state.difficultyLevel = getDifficultyBase().level;
  if (Number.isFinite(state.timerFrames)) {
    state.timerFrames = Math.max(0, state.timerFrames - 1);
    if (state.timerFrames === 0) finishRun("timer");
  }

  if (!state.building && state.frameCount >= BUILDING_START_FRAME) {
    state.building = newBuilding();
  }
  if (state.building) {
    advanceBuilding(state.building);
    resolveCrush();
    if (state.building && state.building.floors.length === 0) {
      state.building = newBuilding();
    }
  }
  resolveAirborneBuildingPush();
  if (state.activeMode.id === "act2") updateHazards(dt);
}

// Original collision manager (0x406890, submode-3 case 0x406a12): an airborne
// player cannot enter the building from below — its bottom edge pins the player
// 48 raw px beneath it and hands them the building's fall velocity (velQ6/128),
// so a falling building pushes the jumper down with it. Raw player y is web−98,
// so the web-space pin distance is 48+98 = 50 below… i.e. p.y = bottomEdge + 50.
function resolveAirborneBuildingPush() {
  const p = state.player;
  const b = state.building;
  if (!b || b.floors.length === 0) return;
  if (p.y >= GROUND_Y - 1) return; // grounded: handled by resolveCrush
  const bottomEdge = buildingGameplayBottomEdge(b);
  if (bottomEdge <= p.y - 50) return; // no overlap: player is clear below the building
  p.y = bottomEdge + 50;
  p.vy = (b.velocityQ6 / 128) * ORIGINAL_FRAME_RATE;
  if (p.y >= GROUND_Y - 1) {
    // pinned into the ground: land (the original transitions out of the air
    // submode here and the ground crush rules take over)
    if (!p.lastGrounded) playSound("tyakuti", 0.25);
    p.y = GROUND_Y;
    p.vy = 0;
    p.lastGrounded = true;
  }
}

// 第二幕 hazards reconstructed from the original assets: lightning strikes
// (data/006, data/012, kaminari.wav, sibire.wav) and rolling rocks
// (data/007, gorogoro.wav, iwa.wav). 015.dat lists 雷/岩/石 as Buddha attacks.
function updateHazards(dt) {
  state.hazardTimer -= 1;
  if (state.hazardTimer <= 0) {
    state.hazardTimer = HAZARD_MIN_GAP_FRAMES + randInt(HAZARD_RANDOM_GAP_FRAMES);
    if (randInt(100) < 60) {
      state.hazards.push({ type: "lightning", lane: randInt(LANES), frames: 0, struck: false });
    } else {
      const fromLeft = randInt(2) === 0;
      state.hazards.push({
        type: "rock",
        x: fromLeft ? -80 : W + 80,
        dir: fromLeft ? 1 : -1,
        hit: false,
      });
      playSound("gorogoro", 0.3);
    }
  }

  const p = state.player;
  for (const hazard of state.hazards) {
    if (hazard.type === "lightning") {
      hazard.frames += 1;
      if (hazard.frames === LIGHTNING_WARN_FRAMES) playSound("kaminari", 0.4);
      if (
        hazard.frames >= LIGHTNING_WARN_FRAMES
        && !hazard.struck
        && p.lane === hazard.lane
        && p.y >= GROUND_Y - 3
        && p.hurtTimer <= 0
        && p.stunTimer <= 0
      ) {
        hazard.struck = true;
        if (p.guardTimer > 0 && state.guard > CRUSH_GUARD_MIN) {
          state.guard = Math.max(0, state.guard - 22);
          playSound("bougyo", 0.3);
        } else {
          p.stunTimer = STUN_SECONDS;
          state.combo = 0;
          playSound("sibire", 0.4);
        }
      }
    }
    if (hazard.type === "rock") {
      hazard.x += hazard.dir * ROCK_SPEED * dt;
      if (
        !hazard.hit
        && Math.abs(hazard.x - p.x) < ROCK_HIT_RANGE
        && p.y >= GROUND_Y - 30
        && p.hurtTimer <= 0
        && p.stunTimer <= 0
      ) {
        hazard.hit = true;
        if (p.guardTimer > 0 && state.guard > CRUSH_GUARD_MIN) {
          state.guard = Math.max(0, state.guard - 26);
          playSound("bougyo", 0.3);
        } else {
          p.stunTimer = STUN_SECONDS;
          state.combo = 0;
          playSound("iwa", 0.42);
          playSound("sibire", 0.32);
        }
      }
    }
  }
  state.hazards = state.hazards.filter((hazard) => {
    if (hazard.type === "lightning") return hazard.frames < LIGHTNING_WARN_FRAMES + LIGHTNING_STRIKE_FRAMES;
    return hazard.x > -120 && hazard.x < W + 120;
  });
}

function advanceBuilding(building) {
  if (building.holdFrames > 0) {
    building.holdFrames -= 1;
    return;
  }
  building.fixedYQ6 += building.velocityQ6;
  building.y = building.fixedYQ6 >> 6;
  building.velocityQ6 += building.accelerationQ6;
  building.speed = (building.velocityQ6 / 0x40) * ORIGINAL_FRAME_RATE;
}

function resolveCrush() {
  const b = state.building;
  if (!b || b.floors.length === 0) return;
  const bottomIndex = b.floors.length - 1;
  const bottomY = floorWorldY(b.floors[bottomIndex]);
  const playerAirborne = state.player.y < AIRBORNE_SAFE_Y;
  if (playerAirborne && buildingVisualBottomEdge(b) >= GROUND_Y) {
    b.floors.pop();
    return;
  }
  const collisionSurfaceY = buildingCrushContactSurfaceY(b);
  if (collisionSurfaceY < CRUSH_CONTACT_Y) return;

  const floor = b.floors[bottomIndex];
  const laneCell = floor.cells[state.player.lane];
  const guarding = state.player.guardTimer > 0 && state.guard > CRUSH_GUARD_MIN;
  const passSafe = playerAirborne || laneCell.hp <= 0;

  if (passSafe) {
    b.floors.pop();
    return;
  }

  if (state.player.hurtTimer > 0) {
    b.floors.pop();
    return;
  }

  if (guarding) {
    state.guard = Math.max(0, state.guard - 32);
    laneCell.hp = 0;
    state.score += Math.round((60 + state.combo * 8) * state.activeMode.scoreMul);
    spawnDust(state.player.x, GROUND_Y - 70);
    spawnDebris(state.player.x, GROUND_Y - 85, 8);
    playSound("bougyo", 0.34);
    b.floors.pop();
    return;
  }

  state.life -= 1;
  if (!(playerAirborne && guarding)) state.combo = 0;
  state.guard = Math.max(0, state.guard - 24);
  state.player.hurtTimer = 0.8;
  spawnDust(state.player.x, GROUND_Y - 40);
  spawnDebris(state.player.x, GROUND_Y - 72, 10);
  playSound("tubure", 0.45);
  b.floors.pop();
  if (state.life <= 0) finishRun("death");
}

function updateGameOver() {
  if (state.sceneTimer > 1.25) setScene("results");
}

function updateCamera() {
  const target = Math.min(0, state.player.y - CAMERA_TARGET_PLAYER_SCREEN_Y);
  const lerp = target < state.cameraY ? CAMERA_FOLLOW_LERP : CAMERA_RETURN_LERP;
  state.cameraY += (target - state.cameraY) * lerp;

  const highestAllowed = state.player.y - CAMERA_MIN_PLAYER_SCREEN_Y;
  if (state.cameraY > highestAllowed) state.cameraY = highestAllowed;
  if (state.player.y >= GROUND_Y - 1 && Math.abs(state.cameraY) < 0.5) state.cameraY = 0;
}

function updateResults() {
  const input = consumeDirectionalInput();
  if (input.slashButton) confirmAction();
  if (input.specialButton && state.runCleared) {
    state.prologueScrollY = 0;
    setScene("staff");
    playSound("enter");
  }
}

function updateRanking() {
  const input = consumeDirectionalInput();
  const rows = currentScores();
  if (input.up) {
    // -1 selects the 戻る button (modoru2 highlight), matching the original.
    state.selectedReplay = Math.max(-1, state.selectedReplay - 1);
    playSound("select", 0.22);
  }
  if (input.down) {
    state.selectedReplay = Math.min(Math.max(0, rows.length - 1), state.selectedReplay + 1);
    playSound("select", 0.22);
  }
  if (input.left || input.right) {
    const index = modes.indexOf(state.activeMode);
    let next = index;
    do {
      next = input.right ? (next + 1) % modes.length : (next + modes.length - 1) % modes.length;
    } while (!modeUnlocked(modes[next]));
    state.activeMode = modes[next];
    state.selectedReplay = 0;
    playSound("select", 0.22);
  }
  if (input.slashButton) confirmAction();
}

function updateClouds(dt) {
  for (const cloud of state.clouds) {
    cloud.x += cloud.speed * dt;
    if (cloud.x > W + 80) cloud.x = -190;
  }
}

function updateEffects(dt) {
  for (const effect of state.effects) {
    effect.t += dt;
    if (effect.type === "leaf") {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vy += 160 * dt;
    }
  }
  for (const item of state.debris) {
    item.t += dt;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    item.vy += 420 * dt;
    item.rot += item.vr * dt;
  }
  state.effects = state.effects.filter((effect) => {
    if (effect.type === "slash") return effect.t < 0.32;
    if (effect.type === "dust") return effect.t < 0.75;
    if (effect.type === "jump") return effect.t < 0.35;
    if (effect.type === "renzan") return effect.t < 0.8;
    if (effect.type === "leaf") return effect.t < 0.6;
    if (effect.type === "spark") return effect.t < 0.4;
    if (effect.type === "hook") return effect.t < 0.3;
    return effect.t < 0.7;
  });
  state.debris = state.debris.filter((item) => item.t < item.life);
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  if (state.mode === "error") {
    drawError();
    return;
  }
  if (!state.ready) {
    drawLoading();
    return;
  }
  if (state.mode === "title") drawTitle();
  if (state.mode === "prologue") drawPrologue();
  if (state.mode === "staff") drawStaff();
  if (state.mode === "gameStart") drawGameStart();
  if (state.mode === "play" || state.mode === "replay") drawPlay();
  if (state.mode === "gameOver") drawGameOver();
  if (state.mode === "results") drawResults();
  if (state.mode === "ranking") drawRanking();
}

function drawLoading() {
  ctx.fillStyle = "#2f5edc";
  ctx.fillRect(0, 0, W, H);
  const img = images.loadClean || images.load;
  if (img) ctx.drawImage(img, (W - 320) / 2, 185);
  ctx.fillStyle = "white";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Loading assets...", W / 2, 292);
}

function drawError() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "18px monospace";
  ctx.textAlign = "left";
  ctx.fillText(state.errorMessage || "Asset loading failed.", 30, 80);
}

function updatePrologue(dt) {
  state.prologueScrollY += dt * 28;
  const input = consumeDirectionalInput();
  if (input.slashButton || state.prologueScrollY > PROLOGUE_TEXT.length * 26 + H) {
    state.prologueScrollY = 0;
    if (!saveData.prologueSeen) {
      saveData.prologueSeen = true;
      persistSave();
    }
    const pending = state.pendingMode;
    state.pendingMode = null;
    if (pending) beginRun(pending);
    else setScene("title");
    playSound("enter");
  }
}

function updateStaff(dt) {
  state.prologueScrollY += dt * 24;
  const input = consumeDirectionalInput();
  if (input.slashButton || state.prologueScrollY > STAFF_TEXT.length * 26 + H) {
    state.prologueScrollY = 0;
    setScene("title");
    playSound("enter");
  }
}

function drawPrologue() {
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8dcc8";
  ctx.font = `18px ${FONT_MINCHO}`;
  ctx.textAlign = "center";
  const baseY = H - state.prologueScrollY;
  for (let i = 0; i < PROLOGUE_TEXT.length; i += 1) {
    const y = baseY + i * 26;
    if (y > -20 && y < H + 20) ctx.fillText(PROLOGUE_TEXT[i], W / 2, y);
  }
  if (state.pendingMode && state.sceneTimer > 0.8) {
    ctx.font = `14px ${FONT_MINCHO}`;
    ctx.fillStyle = "rgba(232, 220, 200, 0.65)";
    ctx.fillText("Z: スキップ", W / 2, H - 18);
    ctx.font = `18px ${FONT_MINCHO}`;
    ctx.fillStyle = "#e8dcc8";
  }
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.drawImage(images.dat022Clean, W / 2 - 42, 12, 84, 84);
  ctx.restore();
}

function drawStaff() {
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8dcc8";
  ctx.font = `18px ${FONT_MINCHO}`;
  ctx.textAlign = "center";
  const baseY = H - state.prologueScrollY;
  for (let i = 0; i < STAFF_TEXT.length; i += 1) {
    const y = baseY + i * 26;
    if (y > -20 && y < H + 20) {
      if (STAFF_TEXT[i] === "～スタッフ～") {
        ctx.font = `bold 22px ${FONT_BRUSH}`;
        ctx.fillStyle = "#fde047";
        ctx.fillText(STAFF_TEXT[i], W / 2, y);
        ctx.font = `18px ${FONT_MINCHO}`;
        ctx.fillStyle = "#e8dcc8";
      } else {
        ctx.fillText(STAFF_TEXT[i], W / 2, y);
      }
    }
  }
  const rabbitY = Math.max(80, Math.min(H - 100, H / 2 + Math.sin(state.sceneTimer * 1.2) * 30));
  ctx.drawImage(images.dat010Clean, 0, 0, RABBIT_FRAME_W, RABBIT_FRAME_H, W / 2 - 36, rabbitY, 72, 72);
}

function drawTitle() {
  ctx.drawImage(images.title, 0, 0);
  const items = titleMenuItems();
  if (items.length === 2) {
    // No unlocks: the title.bmp baked 始める/番付表 layout is used as-is.
    drawMenuCursor(213, state.selectedTitle === 0 ? 279 : 359);
  } else {
    drawUnlockedTitleMenu(items);
  }
  if (state.unlockMessage) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(52, 432, 536, 32);
    ctx.fillStyle = "#fde047";
    ctx.font = `bold 15px ${FONT_MINCHO}`;
    ctx.textAlign = "center";
    ctx.fillText(state.unlockMessage.slice(0, 46), W / 2, 453);
  }
}

function drawUnlockedTitleMenu(items) {
  // Cover the baked menu glyphs with the title background blue, then lay the
  // expanded menu out from the title crop (始める) and data/001.dat rows.
  const top = 256;
  const bottom = 444;
  ctx.fillStyle = TITLE_BG_BLUE;
  ctx.fillRect(120, top, 400, bottom - top);
  const step = Math.floor((bottom - top) / items.length);
  const itemH = Math.min(58, step - 4);
  items.forEach((item, i) => {
    const cy = top + step * i + Math.floor(step / 2);
    let srcImg;
    let src;
    if (item.id === "start") {
      srcImg = images.title;
      src = { x: TITLE_START_CROP.x, y: TITLE_START_CROP.y, w: TITLE_START_CROP.w, h: TITLE_START_CROP.h };
    } else {
      srcImg = images.dat001Clean;
      src = { x: 0, y: TITLE_MENU_SOURCE[item.id].y, w: 240, h: 90 };
    }
    const scale = itemH / src.h;
    const drawW = Math.round(src.w * scale);
    const drawX = Math.round((W - drawW) / 2);
    const drawY = cy - Math.floor(itemH / 2);
    ctx.drawImage(srcImg, src.x, src.y, src.w, src.h, drawX, drawY, drawW, itemH);
    if (i === state.selectedTitle) drawMenuCursor(drawX + 6, cy - 14);
  });
}

function drawMenuCursor(x, y) {
  ctx.save();
  ctx.drawImage(images.iconClean, x - 90, y - 24, 84, 66);
  ctx.restore();
}

function drawGameStart() {
  drawPlayfieldBase();
  const modeId = state.activeMode.id;
  const cardKey = MODE_TITLE_CARD[modeId];
  if (cardKey && state.sceneTimer < 0.65) {
    const cardImg = images[`${cardKey}Clean`];
    if (cardImg) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.sceneTimer * 3);
      ctx.drawImage(cardImg, (W - 220) / 2, 80, 220, 80);
      ctx.restore();
    }
  }
  const modeSrc = MODE_NAME_SOURCE[modeId];
  if (modeSrc && state.sceneTimer < 1.2) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.min(state.sceneTimer * 2.5, (1.2 - state.sceneTimer) * 4));
    ctx.drawImage(images.dat005Clean, 0, modeSrc.y, MODE_NAME_W, MODE_NAME_H, (W - 400) / 2, 180, 400, 100);
    ctx.restore();
  }
  const img = state.sceneTimer < 0.85 ? images.youiClean : images.hajimeClean;
  ctx.drawImage(img, (W - 200) / 2, 300);
  drawHud();
}

function drawPlay() {
  drawPlayfieldBase();
  ctx.save();
  ctx.translate(0, -renderCameraY());
  drawBuilding();
  drawDebris();
  drawEffectsBehindPlayer();
  drawHazards();
  drawPlayer();
  drawEffectsAbovePlayer();
  ctx.restore();
  if (state.daibutsuAnnounce > 0) {
    const t = state.daibutsuAnnounce;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.min(t, 3 - t) * 2.2);
    ctx.drawImage(images.dat015Clean, 452, 64, 128, 200);
    ctx.restore();
  }
  drawHud();
  if (state.mode === "replay") {
    if (state.demoPlayback) {
      ctx.save();
      ctx.globalAlpha = Math.floor(state.sceneTimer * 1.6) % 2 === 0 ? 1 : 0.55;
      ctx.drawImage(images.demoClean, (W - 250) / 2, 18, 250, 60);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      ctx.fillRect(8, 8, 150, 26);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("再演技", 18, 27);
    }
  }
}

function drawPlayfieldBase() {
  drawBackground();
  drawClouds();
}

function drawBackground() {
  if (state.activeMode.id === "act2") {
    ctx.drawImage(images.dat002Clean, 0, 0, W, H);
    return;
  }
  if (state.activeMode.id === "endless") {
    ctx.drawImage(images.bg, 0, 960, W, H, 0, 0, W, H);
    ctx.drawImage(images.dat022Clean, 498, 42, 84, 84);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(images.dat008Clean, 0, -60, W, H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(images.dat020Clean, 16, GROUND_Y - 60, 64, 64);
    ctx.drawImage(images.dat020Clean, W - 80, GROUND_Y - 60, 64, 64);
    ctx.restore();
    return;
  }
  // bg.bmp is one tall 640x1440 scene; y=960..1440 is the ground-level view and
  // the camera reveals the sky above it during jumps.
  const sy = Math.max(
    0,
    Math.min(images.bg.height - H, 960 + state.cameraY * CAMERA_BACKGROUND_PARALLAX),
  );
  ctx.drawImage(images.bg, 0, sy, W, H, 0, 0, W, H);
}

function drawClouds() {
  ctx.save();
  ctx.globalAlpha = 0.65;
  for (const cloud of state.clouds) {
    ctx.drawImage(images.kumoClean, cloud.x, cloud.y - renderCameraY() * CAMERA_CLOUD_PARALLAX);
  }
  ctx.restore();
}

function renderCameraY() {
  return Math.round(state.cameraY);
}

function worldToScreenY(y) {
  return y - renderCameraY();
}

function drawBuilding() {
  const b = state.building;
  if (!b) return;
  const texture = images[`${b.texture}Clean`];
  if (!b.special) drawBuildingCap(texture, b.y, 0);
  for (let i = 0; i < b.floors.length; i += 1) {
    const floorY = Math.round(floorWorldY(b.floors[i]));
    const screenY = worldToScreenY(floorY);
    if (screenY > H || screenY < -ORIGINAL_ROW_HEIGHT) continue;
    drawBuildingSourceRow(texture, b.floors[i].cells, floorY);
    drawFloorCells(b.floors[i], floorY);
  }
  if (!b.special) drawBuildingBottomCap(texture, b);
}

function drawBuildingSourceRow(texture, cells, y) {
  for (let lane = 0; lane < LANES; lane += 1) {
    const sourceY = clampBuildingSourceY(texture, cells[lane]?.sourceY ?? 0);
    ctx.drawImage(
      texture,
      lane * LANE_W,
      sourceY,
      LANE_W,
      ORIGINAL_ROW_HEIGHT,
      BUILDING_X + lane * LANE_W,
      y,
      LANE_W,
      ORIGINAL_ROW_HEIGHT,
    );
  }
}

function drawBuildingBottomCap(texture, building) {
  const capY = Math.round(building.y + (building.floorCount + 1) * FLOOR_H);
  drawBuildingCap(texture, capY, ORIGINAL_BUILDING_BOTTOM_SOURCE_Y);
}

function drawBuildingCap(texture, y, sourceY) {
  const screenY = worldToScreenY(y);
  if (screenY > H || screenY < -ORIGINAL_ROW_HEIGHT) return;
  for (let lane = 0; lane < LANES; lane += 1) {
    const clampedSourceY = clampBuildingSourceY(texture, sourceY);
    ctx.drawImage(
      texture,
      lane * LANE_W,
      clampedSourceY,
      LANE_W,
      ORIGINAL_ROW_HEIGHT,
      BUILDING_X + lane * LANE_W,
      y,
      LANE_W,
      ORIGINAL_ROW_HEIGHT,
    );
  }
}

function clampBuildingSourceY(texture, sourceY) {
  return Math.max(0, Math.min(texture.height - ORIGINAL_ROW_HEIGHT, sourceY));
}

function drawFloorCells(floor, y) {
  for (let lane = 0; lane < LANES; lane += 1) {
    const cell = floor.cells[lane];
    const x = BUILDING_X + lane * LANE_W;
    if (cell.hp <= 0) {
      ctx.clearRect(x + 4, y + 5, LANE_W - 8, ORIGINAL_ROW_HEIGHT - 10);
    }
  }
}

function drawPlayer() {
  const p = state.player;
  let frame = 0;
  if (p.specialTimer > 0) frame = 17;
  else if (p.attackTimer > 0) frame = 2;
  else if (p.guardTimer > 0) frame = 21;
  else if (p.y < GROUND_Y - 3) frame = 8;
  else if (p.hurtTimer > 0 || p.stunTimer > 0) frame = PLAYER_HURT_FRAME;
  const sx = (frame % 5) * 128;
  const sy = Math.floor(frame / 5) * 128;
  const bob = p.hurtTimer > 0 || p.stunTimer > 0 ? Math.sin(state.frameCount * 0.7) * 5 : 0;
  ctx.drawImage(images.charClean, sx, sy, 128, 128, p.x - PLAYER_DRAW_OFFSET_X + bob, p.y - PLAYER_DRAW_OFFSET_Y, 128, 128);
  if (p.guardTimer > 0) ctx.drawImage(images.bougyoClean, p.x - 80, p.y - PLAYER_GUARD_OFFSET_Y, 160, 48);
  if (p.stunTimer > 0 && Math.floor(state.frameCount / 4) % 2 === 0) {
    ctx.drawImage(images.dat012Clean, p.x - 30, p.y - PLAYER_DRAW_OFFSET_Y - 18, 24, 24);
    ctx.drawImage(images.dat012Clean, p.x + 8, p.y - PLAYER_DRAW_OFFSET_Y - 26, 24, 24);
  }
}

function drawEffectsBehindPlayer() {
  for (const effect of state.effects) {
    if (effect.type === "dust") {
      const frame = Math.min(14, Math.floor(effect.t * 20));
      ctx.globalAlpha = 1 - effect.t / 0.75;
      ctx.drawImage(images.tutiClean, 0, frame * 256, 512, 256, effect.x - 150, effect.y - 105, 300, 150);
      ctx.globalAlpha = 1;
    }
    if (effect.type === "jump") {
      const frame = Math.min(2, Math.floor(effect.t * 12));
      ctx.globalAlpha = Math.max(0, 1 - effect.t / 0.35);
      ctx.drawImage(images.jumpClean, frame * 64, 0, 64, 64, effect.x + frame * 8, effect.y, 64, 64);
      ctx.globalAlpha = 1;
    }
  }
}

function drawHazards() {
  for (const hazard of state.hazards) {
    if (hazard.type === "lightning") {
      const laneX = BUILDING_X + hazard.lane * LANE_W + LANE_W / 2;
      const viewTop = renderCameraY();
      if (hazard.frames < LIGHTNING_WARN_FRAMES) {
        if (Math.floor(hazard.frames / 5) % 2 === 0) {
          ctx.drawImage(images.dat012Clean, laneX - 16, viewTop + 26, 32, 32);
        }
      } else {
        const strikeT = hazard.frames - LIGHTNING_WARN_FRAMES;
        const column = Math.min(4, Math.floor(strikeT / 4));
        ctx.save();
        ctx.globalAlpha = Math.max(0.25, 1 - strikeT / LIGHTNING_STRIKE_FRAMES);
        ctx.drawImage(images.dat006Clean, column * 64, 0, 64, 320, laneX - 40, viewTop + 40, 80, GROUND_Y - viewTop - 40);
        ctx.restore();
      }
    }
    if (hazard.type === "rock") {
      ctx.save();
      ctx.translate(hazard.x, GROUND_Y - 34);
      ctx.rotate((hazard.x / 46) * hazard.dir);
      ctx.drawImage(images.dat007Clean, -42, -32, 84, 64);
      ctx.restore();
    }
  }
}

function drawDebris() {
  for (const item of state.debris) {
    const img = images[item.sprite];
    if (!img) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - item.t / item.life);
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rot);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

function drawEffectsAbovePlayer() {
  for (const effect of state.effects) {
    if (effect.type === "slash") {
      const frame = Math.min(17, Math.floor(effect.t * 54));
      ctx.drawImage(images.slashClean, 0, frame * 128, 128, 128, effect.x - 64, effect.y - 38, 128, 128);
      ctx.drawImage(images.zanClean, effect.x - 38, effect.y - 52, 80, 80);
    }
    if (effect.type === "leaf") {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - effect.t / 0.6);
      const col = effect.frame % LEAF_COLUMNS;
      ctx.drawImage(images.dat009Clean, col * LEAF_FRAME_W, 0, LEAF_FRAME_W, LEAF_FRAME_H, effect.x - 8, effect.y - 8, 16, 16);
      ctx.restore();
    }
    if (effect.type === "spark") {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - effect.t / 0.4);
      const col = effect.t < 0.2 ? 0 : 1;
      ctx.drawImage(images.dat021Clean, col * SPARK_FRAME_W, 0, SPARK_FRAME_W, SPARK_FRAME_H, effect.x - 40, effect.y - 40, 80, 80);
      ctx.restore();
    }
    if (effect.type === "hook") {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - effect.t / 0.3);
      const scale = 1 + effect.t * 2;
      ctx.drawImage(images.dat011Clean, effect.x - 36 * scale, effect.y - 23 * scale, 72 * scale, 46 * scale);
      ctx.restore();
    }
    if (effect.type === "renzan") {
      ctx.globalAlpha = Math.max(0, 1 - effect.t / 0.8);
      ctx.drawImage(images.renzanClean, effect.x, effect.y);
      const frame = Math.min(7, Math.floor(effect.t * 14));
      ctx.drawImage(images.wazaClean, 0, frame * 64, 80, 64, effect.x + 200, effect.y - 24, 80, 64);
      ctx.globalAlpha = 1;
    }
  }
}

function drawHud() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(38, H - 47, 104, 16);
  ctx.fillRect(38, H - 25, 104, 16);
  ctx.drawImage(images.bougyobarClean, 0, 0, 100 * (state.guard / GUARD_MAX), 16, 40, H - 47, 100 * (state.guard / GUARD_MAX), 16);
  const wazaImg = state.waza >= WAZA_MAX ? images.wazabar2Clean : images.wazabarClean;
  const wazaWidth = 100 * (state.waza / WAZA_MAX);
  for (let x = 0; x < wazaWidth; x += 50) {
    const drawW = Math.min(50, wazaWidth - x);
      ctx.drawImage(wazaImg, 0, 0, drawW, 4, 40 + x, H - 19, drawW, 4);
  }
  ctx.strokeStyle = "#f8fafc";
  ctx.strokeRect(38, H - 47, 104, 16);
  ctx.strokeRect(38, H - 25, 104, 16);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 16px serif";
  ctx.textAlign = "left";
  ctx.fillText("防", 2, H - 34);
  ctx.fillText("技", 2, H - 12);

  for (let i = 0; i < 3; i += 1) {
    const sx = i < state.life ? 0 : 48;
    ctx.drawImage(images.lifeClean, sx, 0, 48, 48, 150 + i * 30, H - 50, 48, 48);
  }

  if (state.combo > 0) {
    drawSpriteNumber(images.comboClean, String(state.combo).padStart(3, "0"), 260, H - 55, 64, 64, 0.5);
    ctx.drawImage(images.renzanSClean, 444, H - 40, 64, 32);
  }
  drawSpriteNumber(images.scoreClean, String(Math.max(0, state.score)).padStart(7, "0"), W - 280, H - 46, 38, 48, 1);

  if (Number.isFinite(state.timerFrames)) {
    const seconds = Math.ceil(state.timerFrames / 60);
    ctx.fillStyle = seconds < 30 ? "#fecaca" : "#e0f2fe";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, W - 12, H - 44);
  } else {
    ctx.fillStyle = "#e0f2fe";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    ctx.fillText("∞", W - 12, H - 44);
  }
}

function drawSpriteNumber(img, text, x, y, digitW, digitH, scale = 1) {
  const dw = digitW * scale;
  const dh = digitH * scale;
  for (let i = 0; i < text.length; i += 1) {
    const n = Number(text[i]);
    if (!Number.isFinite(n)) continue;
    ctx.drawImage(img, n * digitW, 0, digitW, digitH, x + i * dw, y, dw, dh);
  }
}

function drawSpriteNumberRight(img, text, right, y, digitW, digitH, scale = 1) {
  const normalized = String(text);
  const width = normalized.length * digitW * scale;
  drawSpriteNumber(img, normalized, right - width, y, digitW, digitH, scale);
}

function drawGameOver() {
  drawPlayfieldBase();
  ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(images.syuenClean, (W - 220) / 2, 158);
}

function drawResults() {
  ctx.fillStyle = "#8f271b";
  ctx.fillRect(0, 0, W, H);
  const rabbitCol = state.life > 0 ? 0 : 1;
  const rabbitRow = state.life > 0 ? 0 : 1;
  ctx.drawImage(
    images.dat010Clean,
    rabbitCol * RABBIT_FRAME_W, rabbitRow * RABBIT_FRAME_H,
    RABBIT_FRAME_W, RABBIT_FRAME_H,
    32, 46, 72, 72,
  );
  ctx.drawImage(images.seikaClean, (W - 200) / 2, 42);
  if (state.runCleared && state.activeMode.id === "act1") {
    ctx.drawImage(images.dat003Clean, 0, 0, 600, 56, (W - 560) / 2, 394, 560, 52);
  }
  if (state.runCleared && state.activeMode.id === "act2") {
    ctx.drawImage(images.dat019Clean, (W - 440) / 2, 380, 440, 100);
  }
  drawSpriteNumberRight(images.comboClean, String(Math.max(0, state.bestCombo)), 430, 156, 64, 64, 0.95);
  ctx.drawImage(images.renzanClean, 428, 134, 200, 100);
  drawSpriteNumberRight(images.scoreClean, String(Math.max(0, state.score)), 428, 278, 38, 48, 1.15);
  ctx.drawImage(images.tenClean, 438, 252, 100, 100);
  if (state.rank > 0) {
    // Original marks the new ranking top-right with the i.bmp 「位」 glyph.
    drawSpriteNumberRight(images.scoreSClean, String(state.rank), W - 76, 38, 20, 24, 1.4);
    ctx.drawImage(images.infoClean, W - 72, 36, 36, 36);
  }
  if (state.unlockMessage) {
    ctx.fillStyle = "#fde047";
    ctx.font = `bold 17px ${FONT_MINCHO}`;
    ctx.textAlign = "center";
    ctx.fillText(state.unlockMessage.slice(0, 42), W / 2, 354);
  }
}

function drawRanking() {
  ctx.fillStyle = "#967a58";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 4;
  ctx.font = `bold 44px ${FONT_BRUSH}`;
  ctx.textAlign = "center";
  ctx.strokeText("番付表", 245, 72);
  ctx.fillText("番付表", 245, 72);
  const backImg = state.selectedReplay === -1 ? images.modoru2Clean : images.modoruClean;
  ctx.drawImage(backImg, 500, 36, 96, 50);
  ctx.font = `bold 26px ${FONT_BRUSH}`;
  ctx.lineWidth = 3;
  ctx.strokeText(`◀${state.activeMode.label}▶`, 100, 66);
  ctx.fillText(`◀${state.activeMode.label}▶`, 100, 66);
  ctx.lineWidth = 4;

  const rows = currentScores().slice(0, 10);
  for (let i = 0; i < 10; i += 1) {
    const row = rows[i] || { score: 0, combo: 0, replay: null };
    const y = 122 + i * 31;
    if (i === state.selectedReplay) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.16)";
      ctx.fillRect(40, y - 23, 552, 27);
    }
    ctx.fillStyle = i < 3 ? "#fde047" : "#e0f2fe";
    ctx.font = `bold 18px ${FONT_BRUSH}`;
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}位`, 78, y);
    if (i < 3) {
      ctx.drawImage(images.dat013Clean, 82, y - 18, 35, 11);
      ctx.drawImage(images.dat014Clean, 68, y - 19, 12, 9);
    }
    drawSpriteNumber(images.scoreSClean, String(Math.max(0, row.combo)), 104, y - 21, 20, 24, 0.95);
    ctx.drawImage(images.renzanSClean, 166, y - 24, 64, 32);
    drawSpriteNumberRight(images.scoreSClean, String(Math.max(0, row.score)), 392, y - 21, 20, 24, 0.95);
    ctx.drawImage(images.tenSClean, 398, y - 25, 32, 32);
    const btn = row.replay ? (i === state.selectedReplay ? images.saiengi2Clean : images.saiengiClean) : images.saiengiClean;
    ctx.globalAlpha = row.replay ? 1 : 0.35;
    ctx.drawImage(btn, 482, y - 24, 96, 32);
    ctx.globalAlpha = 1;
  }
}

function drawFooterText(text) {
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(0, H - 36, W, 36);
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(text, W / 2, H - 12);
}

function buildTraceFrame() {
  const b = state.building;
  const p = state.player;
  const bottomIndex = b ? b.floors.length - 1 : -1;
  const bottomFloor = b && bottomIndex >= 0 ? b.floors[bottomIndex] : null;
  const bottomCells = bottomFloor ? bottomFloor.cells : null;
  const bottomY = bottomFloor ? floorWorldY(bottomFloor) : null;
  const bottomEdge = bottomY == null ? null : bottomY + ORIGINAL_ROW_HEIGHT;
  const visualBottomCapTop = b ? buildingVisualBottomCapTop(b) : null;
  const visualBottomEdge = b ? buildingVisualBottomEdge(b) : null;
  const collisionSurfaceY = b ? buildingCrushContactSurfaceY(b) : null;
  const airborneClearSurfaceY = visualBottomEdge;
  const laneCell = bottomCells ? bottomCells[p.lane] : null;
  const slashTarget = findSlashTarget();
  const activeRowRemaining = slashTarget
    ? slashTarget.floor.cells.filter((cell) => cell.hp > 0).length
    : null;
  return {
    frame: state.frameCount,
    mode: state.mode,
    activeMode: state.activeMode.id,
    timerFrames: Number.isFinite(state.timerFrames) ? state.timerFrames : null,
    score: state.score,
    combo: state.combo,
    life: state.life,
    guard: Math.round(state.guard),
    waza: Math.round(state.waza),
    player: {
      lane: p.lane,
      x: Math.round(p.x),
      y: Math.round(p.y),
      screenY: Math.round(worldToScreenY(p.y)),
      vy: Math.round(p.vy / ORIGINAL_FRAME_RATE),
      jumping: p.jumpPrepFrames > 0 || p.y < GROUND_Y - 3,
      attackTimer: Number(p.attackTimer.toFixed(3)),
      guardTimer: Number(p.guardTimer.toFixed(3)),
      hurtTimer: Number(p.hurtTimer.toFixed(3)),
      stunTimer: Number(p.stunTimer.toFixed(3)),
      specialTimer: Number(p.specialTimer.toFixed(3)),
      jumpCutApplied: p.jumpCutApplied,
      jumpReleaseActive: p.jumpReleaseActive,
    },
    camera: {
      y: renderCameraY(),
      targetScreenY: CAMERA_TARGET_PLAYER_SCREEN_Y,
      minScreenY: CAMERA_MIN_PLAYER_SCREEN_Y,
    },
    building: b
      ? {
        y: Math.round(b.y),
        speed: Math.round(b.speed),
        level: b.level,
        floorCount: b.floorCount,
        floorsRemaining: b.floors.length,
        objectRows: b.objectRows,
        velocityQ6: b.velocityQ6,
        fixedYQ6: b.fixedYQ6,
        accelerationQ6: b.accelerationQ6,
        bottomY: bottomY == null ? null : Math.round(bottomY),
        bottomEdge: bottomEdge == null ? null : Math.round(bottomEdge),
        visualBottomCapTop: Math.round(visualBottomCapTop),
        visualBottomEdge: Math.round(visualBottomEdge),
        visualContactLine: Math.round(collisionSurfaceY),
        collisionSurfaceY: Math.round(collisionSurfaceY),
        airborneClearSurfaceY: Math.round(airborneClearSurfaceY),
        laneHpAtBottom: laneCell ? Math.max(0, laneCell.hp) : null,
        laneTypeAtBottom: laneCell?.originalType ?? null,
        laneHp0: bottomCells ? Math.max(0, bottomCells[0].hp) : null,
        laneHp1: bottomCells ? Math.max(0, bottomCells[1].hp) : null,
        laneHp2: bottomCells ? Math.max(0, bottomCells[2].hp) : null,
        laneType0: bottomCells ? bottomCells[0].originalType : null,
        laneType1: bottomCells ? bottomCells[1].originalType : null,
        laneType2: bottomCells ? bottomCells[2].originalType : null,
        activeRowIndex: slashTarget ? slashTarget.index : null,
        activeRowY: slashTarget ? Math.round(slashTarget.floorY) : null,
        activeRowFlag: slashTarget ? 0 : null,
        activeRowRemaining,
        activeRowLane: slashTarget ? p.lane : null,
        activeRowDamage: slashTarget ? 1 : null,
      }
      : null,
    collisionProbe: {
      crushContactY: CRUSH_CONTACT_Y,
      airborneSafeY: AIRBORNE_SAFE_Y,
      crushContact: collisionSurfaceY == null ? false : collisionSurfaceY >= CRUSH_CONTACT_Y,
      airborneClearContact: airborneClearSurfaceY == null ? false : airborneClearSurfaceY >= GROUND_Y,
      playerAirborneForCrush: p.y < AIRBORNE_SAFE_Y,
      bottomLanePassSafe: laneCell ? (p.y < AIRBORNE_SAFE_Y || laneCell.hp <= 0) : false,
      slashBandTop: Math.round(p.y - SLASH_REACH_TOP),
      slashBandBottom: Math.round(p.y - SLASH_REACH_BOTTOM),
      slashTarget: slashTarget
        ? {
          index: slashTarget.index,
          y: Math.round(slashTarget.floorY),
          lane: p.lane,
          hp: Math.max(0, slashTarget.cell.hp),
          originalType: slashTarget.cell.originalType,
        }
        : null,
      lastSlash: state.lastSlashTrace
        ? {
          ...state.lastSlashTrace,
          ageFrames: state.frameCount - state.lastSlashTrace.frame,
        }
        : null,
    },
  };
}

function loop(ts) {
  if (!state.lastTs) state.lastTs = ts;
  const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
  state.lastTs = ts;
  if (!manualClock) update(dt);
  render();
  requestAnimationFrame(loop);
}

window.render_game_to_text = () => {
  const b = state.building;
  const visibleFloors = b
    ? b.floors
      .map((floor, index) => ({
        index,
        rowIndex: floor.rowIndex,
        y: Math.round(floorWorldY(floor)),
        cells: floor.cells.map((cell) => ({
          material: materialInfo[cell.type].name,
          originalType: cell.originalType,
          sourceY: cell.sourceY,
          hp: Math.max(0, cell.hp),
        })),
      }))
      .filter((floor) => floor.y > -ORIGINAL_ROW_HEIGHT && floor.y < H)
      .slice(-4)
    : [];
  return JSON.stringify({
    note: "Canvas coordinates use origin at top-left; x increases right, y increases down.",
    mode: state.mode,
    activeMode: state.activeMode.id,
    selectedTitle: titleMenuItems()[state.selectedTitle]?.id || "start",
    titleMenu: titleMenuItems().map((item) => item.id),
    unlocked: saveData.unlocks,
    unlockLevel: saveData.unlockLevel,
    progressUnits: saveData.progressUnits,
    progressThresholds: {
      act2: PROGRESS_UNLOCK_ACT2,
      endless: PROGRESS_UNLOCK_ENDLESS,
    },
    originalStaticRendering: {
      buildingSourceStep: ORIGINAL_BUILDING_SOURCE_STEP,
      buildingBottomSourceY: ORIGINAL_BUILDING_BOTTOM_SOURCE_Y,
      surfaceColorRefs: ORIGINAL_SURFACE_COLORREFS,
    },
    originalCollision: {
      rowPitch: ORIGINAL_ROW_PITCH,
      rowDrawHeight: ORIGINAL_ROW_HEIGHT,
      laneWidth: ORIGINAL_LANE_W,
      fieldBottomY: ORIGINAL_FIELD_BOTTOM_Y,
      crushContactY: CRUSH_CONTACT_Y,
      airborneSafeY: AIRBORNE_SAFE_Y,
      slashReachTop: SLASH_REACH_TOP,
      slashReachBottom: SLASH_REACH_BOTTOM,
      guardMinApprox: CRUSH_GUARD_MIN,
    },
    originalCamera: {
      globalAddress: "0x41f688",
      playerDrawSubtractsCameraY: true,
      buildingSeedUsesCameraY: true,
      targetPlayerScreenY: CAMERA_TARGET_PLAYER_SCREEN_Y,
      minPlayerScreenY: CAMERA_MIN_PLAYER_SCREEN_Y,
      cameraY: renderCameraY(),
    },
    originalJump: {
      maxJumps: ORIGINAL_JUMP_MAX_COUNT,
      originalGroundY: ORIGINAL_JUMP_GROUND_Y,
      originalLandCheckY: ORIGINAL_JUMP_LAND_CHECK_Y,
      startVelocityPerFrame: ORIGINAL_JUMP_START_VY_PER_FRAME,
      gravityPerFrame: ORIGINAL_JUMP_GRAVITY_PER_FRAME,
      releaseTargetVelocityPerFrame: ORIGINAL_JUMP_RELEASE_TARGET_VY_PER_FRAME,
      releaseEasePerFrame: ORIGINAL_JUMP_RELEASE_EASE_PER_FRAME,
      estimatedMaxHeight: ORIGINAL_JUMP_MAX_HEIGHT,
    },
    score: state.score,
    combo: state.combo,
    bestCombo: state.bestCombo,
    life: state.life,
    guard: Math.round(state.guard),
    guardMax: GUARD_MAX,
    waza: Math.round(state.waza),
    timerFrames: Number.isFinite(state.timerFrames) ? state.timerFrames : null,
    rank: state.rank,
    runCleared: state.runCleared,
    hazards: state.hazards.map((hazard) => (hazard.type === "lightning"
      ? { type: hazard.type, lane: hazard.lane, frames: hazard.frames, struck: hazard.struck }
      : { type: hazard.type, x: Math.round(hazard.x), dir: hazard.dir, hit: hazard.hit })),
    replay: {
      recording: Boolean(state.currentReplay),
      playback: Boolean(state.replayPlayback),
      frames: state.currentReplay?.frames.length || state.replayPlayback?.frames.length || 0,
    },
    demoPlayback: state.demoPlayback,
    prologueSeen: Boolean(saveData.prologueSeen),
    selectedReplay: state.selectedReplay,
    datManifest: state.datManifest,
    player: {
      lane: state.player.lane,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      screenY: Math.round(worldToScreenY(state.player.y)),
      vy: Math.round(state.player.vy),
      jumping: state.player.y < GROUND_Y - 3,
      jumpCount: state.player.y < GROUND_Y - 3 ? 1 : 0,
      jumpCutApplied: state.player.jumpCutApplied,
      jumpReleaseActive: state.player.jumpReleaseActive,
      guarding: state.player.guardTimer > 0,
      stunned: state.player.stunTimer > 0,
    },
    building: b
      ? {
        y: Math.round(b.y),
        speed: Math.round(b.speed),
        level: b.level,
        floorCount: b.floorCount,
        floorsRemaining: b.floors.length,
        objectRows: b.objectRows,
        velocityQ6: b.velocityQ6,
        fixedYQ6: b.fixedYQ6,
        accelerationQ6: b.accelerationQ6,
        visibleFloors,
      }
      : null,
    lastSlash: state.lastSlashTrace
      ? {
        ...state.lastSlashTrace,
        ageFrames: state.frameCount - state.lastSlashTrace.frame,
      }
      : null,
  });
};

window.exportTraceFrame = () => JSON.stringify(buildTraceFrame());

window.exportDifficultyMilestones = (frames = [], modeId = state.activeMode.id) => {
  const milestones = Array.isArray(frames) && frames.length ? frames : [0, 600, 1500, 3000, 6000, 9000, 14400, 28800];
  return JSON.stringify(milestones.map((frame) => ({
    ...difficultyProjectionForFrame(frame, modeId),
    tag: `difficulty-${Math.max(0, Math.floor(Number(frame) || 0))}`,
  })));
};

window.exportTraceFrames = (frames = 0) => {
  manualClock = true;
  const steps = Math.max(0, Math.floor(Number(frames) || 0));
  const rows = [];
  for (let i = 0; i <= steps; i += 1) {
    rows.push(buildTraceFrame());
    if (i < steps) update(1 / 60);
  }
  render();
  return JSON.stringify(rows);
};

// Debug hook for automated verification (same family as render_game_to_text).
window.__debugSet = (patch = {}) => {
  if (Number.isFinite(patch.timerFrames)) state.timerFrames = Math.max(0, Math.floor(patch.timerFrames));
};

window.advanceTime = (ms) => {
  manualClock = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  render();
};

window.addEventListener("keydown", (event) => {
  if (event.target === modeSelect) return;
  const gameKeys = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyZ",
    "KeyX",
    "Enter",
    "Space",
    "Escape",
    "Tab",
  ];
  if (gameKeys.includes(event.code)) event.preventDefault();
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  if (event.code === "Escape") {
    state.demoPlayback = false;
    state.pendingMode = null;
    if (state.mode === "play" || state.mode === "replay") setScene("title");
    else if (state.mode !== "title") setScene("title");
  }
  if (event.code === "Tab" && state.mode === "ranking") {
    const row = currentScores()[state.selectedReplay];
    if (row?.replay) startReplay(row.replay, row.mode || state.activeMode.id);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  confirmAction();
});

if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    modeSelect.blur();
    if (!state.ready) {
      syncModeSelect();
      return;
    }
    const mode = modes.find((entry) => entry.id === modeSelect.value);
    if (!mode) {
      setScene("title");
      return;
    }
    playBgmHint();
    startGame(mode);
    playSound("enter");
  });
}

loadAssets().catch((error) => {
  state.mode = "error";
  state.errorMessage = error.message;
  console.error(error);
});

requestAnimationFrame(loop);
