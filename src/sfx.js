// Synthesized SFX via WebAudio. No audio files: replaces the original game's
// wav set entirely (rework directive — remove any original-asset feel).
// All voices are built from two primitives: a filtered noise burst and a
// pitch-swept oscillator, both with exponential decay envelopes.

let ac = null;
let master = null;
let sfxBus = null;
let bgmBus = null;
let noiseBuf = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmNextTime = 0;
let musicMode = "menu";
let audioPaused = false;
const AUDIO_KEY = "monsterday.audio.v1";
let muted = false;

try {
  muted = JSON.parse(localStorage.getItem(AUDIO_KEY) || "{}").muted === true;
} catch {
  muted = false;
}

function applyMasterGain() {
  if (!ac || !master) return;
  const now = ac.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
  master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 1, now + 0.04);
}

export function unlock() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain();
    sfxBus = ac.createGain();
    bgmBus = ac.createGain();
    master.gain.value = muted ? 0.0001 : 1;
    sfxBus.gain.value = 0.42;
    bgmBus.gain.value = 0.14;
    sfxBus.connect(master);
    bgmBus.connect(master);
    master.connect(ac.destination);
    startMusicScheduler();
  }
  if (!audioPaused && ac.state === "suspended") ac.resume().catch(() => {});
}

function ready() {
  return ac !== null && ac.state === "running";
}

function noiseSource() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

function envGain(t0, vol, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(sfxBus);
  return g;
}

function musicNote(frequency, at, duration, volume, type = "triangle") {
  if (!ac || !bgmBus) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(bgmBus);
  osc.start(at);
  osc.stop(at + duration + 0.04);
}

function scheduleMusicStep(time) {
  const menu = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
  const battle = [220, 293.66, 329.63, 440, 246.94, 329.63, 369.99, 493.88];
  const notes = musicMode === "menu" ? menu : battle;
  const beat = musicMode === "menu" ? 0.42 : 0.28;
  const note = notes[bgmStep % notes.length];
  musicNote(note, time, beat * 0.8, musicMode === "menu" ? 0.11 : 0.095);
  if (musicMode === "boss") {
    musicNote(bgmStep % 4 === 0 ? 82.41 : 110, time, beat * 0.9, 0.13, "sawtooth");
  } else if (musicMode === "battle" && bgmStep % 4 === 0) {
    musicNote(110, time, beat * 0.7, 0.07, "sine");
  }
  bgmStep += 1;
  return beat;
}

function startMusicScheduler() {
  if (bgmTimer || !ac) return;
  bgmNextTime = ac.currentTime + 0.05;
  bgmTimer = setInterval(() => {
    if (!ac || ac.state !== "running" || audioPaused) return;
    while (bgmNextTime < ac.currentTime + 0.22) {
      bgmNextTime += scheduleMusicStep(bgmNextTime);
    }
  }, 80);
}

export const audio = {
  setMusicMode(mode) {
    const next = ["menu", "battle", "boss"].includes(mode) ? mode : "menu";
    if (next === musicMode) return;
    musicMode = next;
    bgmStep = 0;
    if (ac) bgmNextTime = ac.currentTime + 0.06;
  },
  toggleMuted() {
    muted = !muted;
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ muted })); } catch { /* storage may be unavailable */ }
    applyMasterGain();
    return muted;
  },
  setPaused(value) {
    audioPaused = Boolean(value);
    if (!ac) return;
    if (audioPaused) ac.suspend().catch(() => {});
    else ac.resume().then(() => { bgmNextTime = ac.currentTime + 0.06; }).catch(() => {});
  },
  state() {
    return { muted, paused: audioPaused, mode: musicMode, unlocked: Boolean(ac) };
  },
};

function tone(type, f0, f1, at, dur, vol, attack = 0.004) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = envGain(t0, vol, attack, dur);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + attack + dur + 0.05);
}

function burst(at, dur, vol, { type = "bandpass", f0 = 1000, f1 = 0, q = 1 } = {}) {
  const t0 = ac.currentTime + at;
  const src = noiseSource();
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(Math.max(20, f0), t0);
  if (f1) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  filter.Q.value = q;
  const g = envGain(t0, vol, 0.003, dur);
  src.connect(filter);
  filter.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

export const sfx = {
  weaponAttack(weaponId) {
    if (!ready()) return;
    if (weaponId === "bow") {
      tone("triangle", 740, 240, 0, 0.07, 0.2);
      tone("square", 1180, 880, 0, 0.03, 0.05);
      burst(0.01, 0.09, 0.08, { f0: 2400, f1: 900, q: 2 });
    } else if (weaponId === "axe") {
      burst(0, 0.16, 0.22, { type: "lowpass", f0: 1150, f1: 170 });
      tone("sawtooth", 150, 62, 0, 0.13, 0.12);
    } else if (weaponId === "spear") {
      burst(0, 0.075, 0.12, { f0: 2600, f1: 780, q: 2.2 });
      tone("triangle", 520, 300, 0, 0.055, 0.08);
    } else if (weaponId === "katana") {
      burst(0, 0.055, 0.11, { f0: 3200, f1: 850, q: 2.8 });
      tone("triangle", 1120, 620, 0, 0.045, 0.07);
    } else {
      burst(0, 0.1, 0.17, { f0: 1700, f1: 320, q: 1.5 });
    }
  },
  swing() { // sword whoosh
    if (!ready()) return;
    burst(0, 0.09, 0.16, { f0: 1500, f1: 320, q: 1.4 });
  },
  whiff() { // swing that hits nothing
    if (!ready()) return;
    burst(0, 0.07, 0.07, { f0: 900, f1: 280, q: 1 });
  },
  bowShoot() { // string pluck + arrow whistle
    if (!ready()) return;
    tone("triangle", 740, 240, 0, 0.07, 0.2);
    tone("square", 1180, 880, 0, 0.03, 0.05);
    burst(0.01, 0.09, 0.08, { f0: 2400, f1: 900, q: 2 });
  },
  arrowFizzle() { // arrow dying mid-air (out of range)
    if (!ready()) return;
    burst(0, 0.12, 0.06, { f0: 1400, f1: 380, q: 1.2 });
  },
  bomber() { // orange vertical blast
    if (!ready()) return;
    burst(0, 0.18, 0.22, { type: "lowpass", f0: 1200, f1: 180 });
    burst(0.02, 0.09, 0.16, { f0: 2800, f1: 700, q: 2.4 });
    tone("sawtooth", 180, 55, 0, 0.18, 0.28);
  },
  hit() { // graze on stone
    if (!ready()) return;
    burst(0, 0.06, 0.2, { f0: 2600, f1: 800, q: 2.2 });
    tone("square", 240, 170, 0, 0.05, 0.08);
  },
  collapse() { // floor comes down
    if (!ready()) return;
    burst(0, 0.32, 0.36, { type: "lowpass", f0: 900, f1: 110 });
    burst(0, 0.05, 0.2, { f0: 3200, f1: 1200, q: 2 });
    tone("sine", 170, 52, 0, 0.3, 0.5);
  },
  crush() { // player crushed
    if (!ready()) return;
    burst(0, 0.5, 0.45, { type: "lowpass", f0: 520, f1: 55 });
    tone("sine", 110, 36, 0, 0.45, 0.65);
    tone("sawtooth", 320, 90, 0, 0.18, 0.1);
  },
  hurtVoice() { // sharp sting layered over crush
    if (!ready()) return;
    tone("sawtooth", 430, 140, 0, 0.22, 0.14);
  },
  deflect() { // guard parry ring
    if (!ready()) return;
    tone("triangle", 880, 840, 0, 0.13, 0.2);
    tone("triangle", 1318, 1280, 0.01, 0.18, 0.12);
    burst(0, 0.05, 0.08, { f0: 3400, q: 3 });
  },
  jump() {
    if (!ready()) return;
    tone("sine", 250, 460, 0, 0.09, 0.1);
  },
  land() {
    if (!ready()) return;
    burst(0, 0.07, 0.1, { type: "lowpass", f0: 320, f1: 120 });
  },
  waza() { // charge sweep + delayed boom
    if (!ready()) return;
    tone("sine", 300, 1400, 0, 0.2, 0.2);
    tone("sine", 190, 48, 0.18, 0.42, 0.55);
    burst(0.18, 0.42, 0.4, { type: "lowpass", f0: 850, f1: 80 });
  },
  cleared() { // building down fanfare
    if (!ready()) return;
    tone("triangle", 523, 523, 0, 0.09, 0.12);
    tone("triangle", 659, 659, 0.07, 0.09, 0.12);
    tone("triangle", 784, 784, 0.14, 0.2, 0.14);
  },
  uiMove() {
    if (!ready()) return;
    tone("square", 520, 520, 0, 0.035, 0.05);
  },
  uiConfirm() {
    if (!ready()) return;
    tone("triangle", 660, 660, 0, 0.06, 0.11);
    tone("triangle", 990, 990, 0.06, 0.1, 0.11);
  },
  uiDeny() {
    if (!ready()) return;
    tone("square", 170, 140, 0, 0.12, 0.1);
  },
  forgePick() { // upgrade chosen
    if (!ready()) return;
    tone("triangle", 523, 523, 0, 0.08, 0.1);
    tone("triangle", 659, 659, 0.06, 0.08, 0.1);
    tone("triangle", 1047, 1047, 0.12, 0.16, 0.12);
  },
};
