// Visual juice layer: particles, floating text, screen shake, hit-stop and
// full-screen flashes. Purely presentational — no game-rule state lives here.

const MAX_PARTICLES = 420;
const GRAVITY = 620;
const MAX_SHAKE = 10;
const MAX_FLASH_ALPHA = 0.22;

const WEAPON_COLORS = Object.freeze({
  chokento: ["#edf8ff", "#86d7ff", "#4b7cff"],
  katana: ["#ffffff", "#c8b5ff", "#8068d8"],
  axe: ["#fff3c4", "#ffbf62", "#c95d30"],
  spear: ["#f5ffff", "#8deaff", "#3c91c9"],
  bow: ["#fff8cf", "#a7f0ff", "#60a8d8"],
});

const VFX_CELL_WIDTH = 256;
const VFX_CELL_HEIGHT = 384;
const VFX_COLUMNS = 3;
const PARTICLE_CELL_SIZE = 72;
const PARTICLE_COLUMNS = 4;
const WEAPON_PARTICLE_ROW = Object.freeze({ chokento: 0, katana: 1, axe: 2, spear: 3, bow: 4 });
const VFX_SPECS = Object.freeze({
  chokento: {
    release: {
      width: 210,
      height: 315,
      anchorX: 0.3,
      anchorY: 0.92,
      offsetY: -20,
      rotation: -0.6,
      life: 0.25,
      frames: [1, 2, 2],
    },
    hit: { width: 220, height: 330, anchorX: 0.18, anchorY: 0.66, offsetY: 0, life: 0.3 },
  },
  katana: {
    release: {
      width: 210,
      height: 330,
      anchorX: 0,
      anchorY: 0.8,
      offsetY: 20,
      rotation: -0.73,
      life: 0.18,
    },
    hit: { width: 215, height: 323, anchorX: 0.5, anchorY: 0.57, offsetY: 0, life: 0.22 },
  },
  axe: {
    release: { width: 230, height: 345, anchorX: 0.08, anchorY: 0.93, offsetY: 2, life: 0.3 },
    hit: { width: 250, height: 375, anchorX: 0.5, anchorY: 0.63, offsetY: 6, life: 0.38 },
  },
  spear: {
    release: { width: 220, height: 330, anchorX: 0.44, anchorY: 0.98, offsetY: -2, life: 0.22 },
    hit: { width: 220, height: 330, anchorX: 0.5, anchorY: 0.83, offsetY: 6, life: 0.28 },
  },
  bow: {
    release: { width: 220, height: 330, anchorX: 0.5, anchorY: 0.83, offsetY: -105, life: 0.2 },
    hit: { width: 215, height: 323, anchorX: 0.5, anchorY: 0.57, offsetY: 0, life: 0.24 },
  },
});

export function createFx(sprites = {}) {
  let particles = [];
  let spriteEffects = [];
  let popups = [];
  let flashes = [];
  let shakeMag = 0;
  let shakeT = 0;
  let shakeDur = 0;
  let shakeDirX = 0;
  let shakeDirY = 0;
  let hitstopFrames = 0;
  let intensity = "normal";
  let dangerActive = false;

  function push(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function pushSprite(weaponId, phase, x, y, strength = 1) {
    if (!sprites[`vfx_${weaponId}_v1`]) return;
    const spec = VFX_SPECS[weaponId]?.[phase];
    if (!spec) return;
    if (spriteEffects.length >= 24) spriteEffects.shift();
    spriteEffects.push({
      weaponId,
      phase,
      x,
      y,
      strength,
      t: 0,
      frames: phase === "hit" ? [4, 4, 5] : (spec.frames || [1, 2, 2]),
      ...spec,
    });
  }

  function generatedFragments(weaponId, x, y, count) {
    if (!sprites.vfx_weapon_particles_v1) return;
    for (let i = 0; i < count; i += 1) {
      const angle = weaponId === "spear" || weaponId === "bow"
        ? -Math.PI / 2 + (Math.random() - 0.5) * 1.25
        : weaponId === "axe"
          ? -Math.PI + Math.random() * Math.PI
          : -Math.PI * 0.9 + Math.random() * Math.PI * 1.35;
      const speed = (weaponId === "axe" ? 145 : 110) + Math.random() * 270;
      push({
        kind: "spriteShard",
        weaponId,
        variant: i % PARTICLE_COLUMNS,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 12,
        size: (weaponId === "axe" ? 25 : weaponId === "katana" ? 16 : 20) + Math.random() * 15,
        life: 0.28 + Math.random() * (weaponId === "axe" ? 0.32 : 0.22),
        drag: 0.92,
        t: 0,
      });
    }
  }

  const api = {
    setIntensity(level) {
      intensity = level === "reduced" ? "reduced" : "normal";
      return intensity;
    },
    setDangerActive(active) {
      dangerActive = Boolean(active);
    },
    rebase(dx, dy) {
      for (const particle of particles) {
        if (Number.isFinite(particle.x)) particle.x += dx;
        if (Number.isFinite(particle.y)) particle.y += dy;
        if (Number.isFinite(particle.y1)) particle.y1 += dy;
      }
      for (const effect of spriteEffects) {
        effect.x += dx;
        effect.y += dy;
      }
      for (const popup of popups) {
        if (!popup.world) continue;
        popup.x += dx;
        popup.y += dy;
      }
    },
    clear() {
      particles = [];
      spriteEffects = [];
      popups = [];
      flashes = [];
      shakeMag = 0;
      shakeT = 0;
      shakeDur = 0;
      shakeDirX = 0;
      shakeDirY = 0;
      hitstopFrames = 0;
      dangerActive = false;
    },

    // --- spawners (world coordinates) ---
    sparks(x, y, count, color = "#ffe9b0") {
      for (let i = 0; i < count; i += 1) {
        const ang = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 260;
        push({
          kind: "spark", x, y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 60,
          life: 0.22 + Math.random() * 0.2, t: 0,
          color, len: 5 + Math.random() * 7,
        });
      }
    },
    weaponRelease(weaponId, x, y, { grounded = false } = {}) {
      const colors = WEAPON_COLORS[weaponId] || WEAPON_COLORS.chokento;
      const centerY = y - (weaponId === "bow" ? 146 : weaponId === "spear" ? 136 : 92);
      pushSprite(weaponId, "release", x, y);
      if (weaponId === "bow") {
        for (let i = 0; i < 6; i += 1) {
          push({
            kind: "mote", x: x + (Math.random() - 0.5) * 56,
            y: centerY + (Math.random() - 0.5) * 32,
            vx: (Math.random() - 0.5) * 48, vy: -35 - Math.random() * 70,
            size: 1.8 + Math.random() * 2.2, life: 0.2 + Math.random() * 0.16,
            color: colors[i % colors.length], phase: Math.random() * Math.PI * 2, t: 0,
          });
        }
      } else if (weaponId === "spear") {
        for (let i = 0; i < 8; i += 1) {
          push({
            kind: "ray", x: x + (Math.random() - 0.5) * 16,
            y: centerY + 48 + Math.random() * 45,
            vx: (Math.random() - 0.5) * 45, vy: -150 - Math.random() * 170,
            t: 0, life: 0.18 + Math.random() * 0.14,
            color: colors[i % colors.length], len: 10 + Math.random() * 18,
            width: 1.2 + Math.random(), drag: 0.92,
          });
        }
      } else if (weaponId === "axe" && grounded) {
        for (let i = 0; i < 9; i += 1) {
          push({
            kind: i < 6 ? "puff" : "mote",
            x: x + (Math.random() - 0.5) * 92, y: y - 4,
            vx: (Math.random() - 0.5) * 130, vy: -25 - Math.random() * 65,
            size: 4 + Math.random() * 8, life: 0.28 + Math.random() * 0.18,
            color: i < 6 ? "#a77a61" : colors[1], alpha: 0.32,
            phase: Math.random() * Math.PI * 2, t: 0,
          });
        }
      } else {
        for (let i = 0; i < (weaponId === "katana" ? 6 : 9); i += 1) {
          push({
            kind: "mote", x: x + (Math.random() - 0.5) * 52,
            y: centerY + (Math.random() - 0.5) * 56,
            vx: (Math.random() - 0.5) * 42, vy: -20 - Math.random() * 42,
            size: 2 + Math.random() * 2.5, life: 0.18 + Math.random() * 0.16,
            color: colors[1], phase: Math.random() * Math.PI * 2, t: 0,
          });
        }
      }
    },
    weaponHit(weaponId, x, y, { collapsed = false, refined = false } = {}) {
      const colors = WEAPON_COLORS[weaponId] || WEAPON_COLORS.chokento;
      const strength = collapsed ? 1.32 : refined ? 1.18 : 0.9;
      const baseRays = weaponId === "axe" ? 16
        : weaponId === "katana" ? 6
          : weaponId === "bow" ? 7
            : weaponId === "spear" ? 10 : 11;
      const rayCount = Math.ceil(baseRays * (collapsed ? 1.2 : refined ? 1.08 : 0.8));
      pushSprite(weaponId, "hit", x, y, strength);
      generatedFragments(weaponId, x, y, (weaponId === "axe" ? 8 : weaponId === "chokento" ? 6 : 4) + (collapsed ? 3 : 0));
      if (collapsed || refined) api.flash(colors[1], collapsed ? 0.07 : 0.045, 0.11);

      for (let i = 0; i < rayCount; i += 1) {
        let angle = Math.random() * Math.PI * 2;
        if (weaponId === "axe") angle = -Math.PI * 0.95 + Math.random() * Math.PI * 0.9;
        if (weaponId === "spear") angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
        if (weaponId === "bow") angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        const speed = (weaponId === "axe" ? 210 : 150) + Math.random() * (weaponId === "katana" ? 300 : 340);
        push({
          kind: "ray", x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: (0.14 + Math.random() * 0.14) * strength,
          t: 0, color: colors[i % colors.length],
          len: (weaponId === "axe" ? 15 : 9) + Math.random() * 22,
          width: weaponId === "axe" ? 3.8 : weaponId === "katana" ? 1.5 : 2.3,
          drag: 0.9,
        });
      }
    },
    arrowFizzle(x, y) {
      const colors = WEAPON_COLORS.bow;
      push({
        kind: "ring", x, y, t: 0, life: 0.28,
        radius: 5, radiusEnd: 34, stretch: 0.55, rotation: 0,
        color: colors[2], width: 1.5,
      });
      for (let i = 0; i < 6; i += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 45 + Math.random() * 100;
        push({
          kind: i % 2 ? "mote" : "ray", x, y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          size: 2 + Math.random() * 2, len: 5 + Math.random() * 8,
          width: 1.2, color: colors[1 + (i % 2)],
          phase: Math.random() * Math.PI * 2, drag: 0.88,
          life: 0.22 + Math.random() * 0.18, t: 0,
        });
      }
    },
    debris(x, y, count, colors) {
      for (let i = 0; i < count; i += 1) {
        const ang = -Math.PI * 0.9 + Math.random() * Math.PI * 0.8;
        const speed = 90 + Math.random() * 240;
        push({
          kind: "chunk",
          x: x + (Math.random() - 0.5) * 110,
          y: y + (Math.random() - 0.5) * 30,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 9,
          size: 4 + Math.random() * 8,
          life: 0.4 + Math.random() * 0.28, t: 0,
          color: colors[i % colors.length],
        });
      }
    },
    dust(x, y, count = 6) {
      for (let i = 0; i < count; i += 1) {
        push({
          kind: "puff",
          x: x + (Math.random() - 0.5) * 130,
          y: y + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 60,
          vy: -20 - Math.random() * 40,
          size: 10 + Math.random() * 16,
          life: 0.55 + Math.random() * 0.35, t: 0,
        });
      }
    },
    crystals(x, y, count = 3) { // shard pickup sparkle
      for (let i = 0; i < count; i += 1) {
        push({
          kind: "crystal",
          x: x + (Math.random() - 0.5) * 60,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 40,
          vy: -90 - Math.random() * 70,
          size: 3 + Math.random() * 3,
          life: 0.8 + Math.random() * 0.3, t: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
    },
    band(y, delay = 0) { // skill horizontal slash band across the horde
      push({ kind: "band", y, t: -delay, life: 0.34 });
    },
    rowCollapse(y, color = "#fff2c8") {
      // Distinct from a skill's large light band: a fast seam at the actual
      // removed row, followed by a little separation into two fading lines.
      push({ kind: "seam", y, color, t: 0, life: 0.24 });
    },
    bolt(x, y0, y1, delay = 0) { // arrow streak flying from y0 up to y1
      push({ kind: "bolt", x, y: y0, y1, t: -delay, life: 0.16 });
    },
    footDust(x, y) {
      for (let i = 0; i < 4; i += 1) {
        push({
          kind: "puff",
          x: x + (Math.random() - 0.5) * 26, y: y - 2,
          vx: (Math.random() - 0.5) * 90, vy: -12 - Math.random() * 20,
          size: 5 + Math.random() * 6, life: 0.3 + Math.random() * 0.15, t: 0,
        });
      }
    },

    popup(text, x, y, { color = "#f5e6c8", size = 15, life = 0.9, rise = 36, world = true, stroke = true } = {}) {
      popups.push({ text, x, y, color, size, life, rise, world, stroke, t: 0 });
    },
    flash(color, alpha, dur) {
      if (flashes.length >= 8) flashes.shift();
      flashes.push({ color, alpha: Math.min(MAX_FLASH_ALPHA, Math.max(0, alpha)), dur: Math.min(0.4, Math.max(0.001, dur)), t: 0 });
    },
    shake(mag, dur, direction = null) {
      mag = Math.min(MAX_SHAKE, Math.max(0, mag));
      dur = Math.min(0.4, Math.max(0, dur));
      if (mag >= shakeMag * (1 - (shakeDur ? shakeT / shakeDur : 1))) {
        shakeMag = mag;
        shakeDur = dur;
        shakeT = 0;
        const length = direction ? Math.hypot(direction.x || 0, direction.y || 0) : 0;
        shakeDirX = length ? (direction.x || 0) / length : 0;
        shakeDirY = length ? (direction.y || 0) / length : 0;
      }
    },
    stop(frames) {
      hitstopFrames = Math.max(hitstopFrames, frames);
    },
    consumeStop() {
      if (hitstopFrames > 0) {
        hitstopFrames -= 1;
        return true;
      }
      return false;
    },
    offset() {
      if (shakeT >= shakeDur || shakeMag <= 0) return { x: 0, y: 0 };
      const falloff = 1 - shakeT / shakeDur;
      const m = shakeMag * falloff * (intensity === "reduced" ? 0.18 : 1);
      const directional = Math.sin(shakeT * 110) * m;
      const jitter = shakeDirX || shakeDirY ? 0.48 : 1;
      const x = Math.sin(shakeT * 173 + 0.8) * m * jitter + shakeDirX * directional;
      const y = Math.sin(shakeT * 211 + 2.1) * m * jitter + shakeDirY * directional;
      const bound = Math.min(1, m / (Math.hypot(x, y) || 1));
      return { x: x * bound, y: y * bound };
    },

    update(dt) {
      shakeT += dt;
      for (const effect of spriteEffects) effect.t += dt;
      spriteEffects = spriteEffects.filter((effect) => effect.t < effect.life);
      for (const p of particles) {
        p.t += dt;
        if (p.kind === "band" || p.kind === "bolt" || p.kind === "ring"
          || p.kind === "cut" || p.kind === "shock" || p.kind === "seam") continue;
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        if (p.drag) {
          const damping = Math.pow(p.drag, dt * 60);
          p.vx *= damping;
          p.vy *= damping;
        }
        if (p.kind === "chunk") {
          p.vy += GRAVITY * dt;
          p.rot += p.vr * dt;
        } else if (p.kind === "spark") {
          p.vy += GRAVITY * 0.55 * dt;
        } else if (p.kind === "puff") {
          p.vy -= 26 * dt;
          p.size += 26 * dt;
        } else if (p.kind === "crystal") {
          p.vy += 60 * dt;
        } else if (p.kind === "spriteShard") {
          p.vy += GRAVITY * (p.weaponId === "axe" ? 0.36 : 0.12) * dt;
          p.rot += p.vr * dt;
        }
      }
      particles = particles.filter((p) => p.t < p.life);
      for (const p of popups) p.t += dt;
      popups = popups.filter((p) => p.t < p.life);
      for (const f of flashes) f.t += dt;
      flashes = flashes.filter((f) => f.t < f.dur);
    },

    renderWorldBack(ctx) {
      for (const effect of spriteEffects) {
        if (effect.phase === "release") drawSpriteEffect(ctx, effect);
      }
    },

    // Called inside the world transform (camera + shake already applied).
    renderWorld(ctx, buildingSpan) {
      const detailAlpha = dangerActive ? 0.48 : intensity === "reduced" ? 0.7 : 1;
      for (const effect of spriteEffects) {
        if (effect.phase === "hit") drawSpriteEffect(ctx, effect);
      }
      for (const p of particles) {
        if (p.t < 0) continue;
        const k = 1 - p.t / p.life;
        if (p.kind === "spark") {
          ctx.save();
          ctx.globalAlpha = Math.max(0, k) * detailAlpha;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.6;
          const nx = p.vx, ny = p.vy;
          const mag = Math.hypot(nx, ny) || 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (nx / mag) * p.len, p.y - (ny / mag) * p.len);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "spriteShard") {
          const shardAtlas = sprites.vfx_weapon_particles_v1;
          const row = WEAPON_PARTICLE_ROW[p.weaponId] ?? 0;
          const size = p.size * (0.7 + k * 0.3);
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.7)) * detailAlpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(
            shardAtlas,
            p.variant * PARTICLE_CELL_SIZE,
            row * PARTICLE_CELL_SIZE,
            PARTICLE_CELL_SIZE,
            PARTICLE_CELL_SIZE,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          ctx.restore();
        } else if (p.kind === "ray") {
          const nx = p.vx || 0;
          const ny = p.vy || 0;
          const mag = Math.hypot(nx, ny) || 1;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, k) * detailAlpha;
          ctx.strokeStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 7;
          ctx.lineWidth = p.width || 1.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (nx / mag) * p.len, p.y - (ny / mag) * p.len);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "ring") {
          const progress = clampT(p.t / p.life);
          const radius = p.radius + (p.radiusEnd - p.radius) * easeOutCubic(progress);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, k * 0.85) * detailAlpha;
          ctx.strokeStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.lineWidth = (p.width || 2) * (0.45 + k * 0.55);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation || 0);
          ctx.beginPath();
          ctx.ellipse(0, 0, radius, radius * (p.stretch ?? 1), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "cut") {
          const progress = clampT(p.t / p.life);
          const length = p.length * Math.min(1, progress / 0.28);
          const dx = Math.cos(p.angle) * length * 0.5;
          const dy = Math.sin(p.angle) * length * 0.5;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, k) * detailAlpha;
          ctx.strokeStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.lineWidth = p.width || 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x - dx, p.y - dy);
          ctx.lineTo(p.x + dx, p.y + dy);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.shadowBlur = 0;
          ctx.lineWidth = Math.max(1, (p.width || 3) * 0.28);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "shock") {
          const progress = clampT(p.t / p.life);
          const radius = p.radius + (p.radiusEnd - p.radius) * easeOutCubic(progress);
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          gradient.addColorStop(0, p.color);
          gradient.addColorStop(0.32, p.color);
          gradient.addColorStop(1, "rgba(255,255,255,0)");
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, k * (p.alpha || 0.35)) * detailAlpha;
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.kind === "mote") {
          const twinkle = 0.65 + Math.sin((p.phase || 0) + p.t * 24) * 0.35;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.max(0, k * twinkle) * detailAlpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        } else if (p.kind === "chunk") {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4)) * detailAlpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.6, -p.size * 0.4);
          ctx.lineTo(p.size * 0.5, -p.size * 0.55);
          ctx.lineTo(p.size * 0.62, p.size * 0.42);
          ctx.lineTo(-p.size * 0.42, p.size * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (p.kind === "puff") {
          ctx.save();
          ctx.fillStyle = p.color || "#b9a8d8";
          ctx.globalAlpha = Math.max(0, k * (p.alpha ?? 0.28)) * detailAlpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.kind === "crystal") {
          const tw = 0.6 + 0.4 * Math.sin(p.phase + p.t * 18);
          ctx.save();
          ctx.globalAlpha = Math.max(0, k) * tw * detailAlpha;
          ctx.fillStyle = "#8fe3ff";
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        } else if (p.kind === "bolt") {
          const bk = clampT(p.t / p.life);
          const yNow = p.y + (p.y1 - p.y) * bk;
          ctx.save();
          ctx.globalAlpha = 0.9 * (1 - bk * 0.4);
          ctx.strokeStyle = "#ffe9b0";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(p.x, yNow + 26);
          ctx.lineTo(p.x, yNow);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, yNow + 12);
          ctx.lineTo(p.x, yNow);
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "seam") {
          const progress = clampT(p.t / p.life);
          ctx.save();
          ctx.globalAlpha = k * (dangerActive ? 0.54 : 0.88);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5 * k + 0.5;
          for (const direction of [-1, 1]) {
            const y = p.y + direction * easeOutCubic(progress) * 8;
            ctx.beginPath();
            ctx.moveTo(buildingSpan.x + 9 + progress * 24, y);
            ctx.lineTo(buildingSpan.x + buildingSpan.w - 9 - progress * 24, y);
            ctx.stroke();
          }
          ctx.restore();
        } else if (p.kind === "band") {
          const bk = 1 - p.t / p.life;
          const grow = Math.min(1, p.t / 0.08);
          ctx.save();
          ctx.globalAlpha = Math.max(0, bk * (dangerActive ? 0.52 : 0.9));
          const grad = ctx.createLinearGradient(buildingSpan.x, 0, buildingSpan.x + buildingSpan.w, 0);
          grad.addColorStop(0, "rgba(255,236,170,0)");
          grad.addColorStop(0.5, "#fff6d8");
          grad.addColorStop(1, "rgba(255,236,170,0)");
          ctx.fillStyle = grad;
          const h = 5 + 9 * grow;
          ctx.fillRect(buildingSpan.x - 30, p.y - h / 2, buildingSpan.w + 60, h);
          ctx.restore();
        }
      }
      for (const p of popups) {
        if (!p.world) continue;
        drawPopup(ctx, p, 0);
      }
    },

    renderScreen(ctx, W, H) {
      for (const p of popups) {
        if (p.world) continue;
        drawPopup(ctx, p, 0);
      }
      // Simultaneous hits compete for a single screen flash. They never stack
      // toward white, even when a skill severs several rows on the same tick.
      const strongest = flashes.reduce((best, f) => {
        const alpha = f.alpha * Math.max(0, 1 - f.t / f.dur);
        return !best || alpha > best.alpha ? { color: f.color, alpha } : best;
      }, null);
      if (strongest) {
        ctx.save();
        ctx.globalAlpha = strongest.alpha * (intensity === "reduced" ? 0.18 : dangerActive ? 0.4 : 1);
        ctx.fillStyle = strongest.color;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    },
    stats() {
      const currentOffset = api.offset();
      const kinds = {};
      for (const particle of particles) kinds[particle.kind] = (kinds[particle.kind] || 0) + 1;
      const spriteKinds = {};
      for (const effect of spriteEffects) {
        const key = `${effect.weaponId}:${effect.phase}`;
        spriteKinds[key] = (spriteKinds[key] || 0) + 1;
      }
      return {
        intensity,
        dangerActive,
        maxShake: MAX_SHAKE,
        maxFlashAlpha: MAX_FLASH_ALPHA,
        particles: particles.length,
        spriteEffects: spriteEffects.length,
        popups: popups.length,
        flashes: flashes.length,
        kinds,
        spriteKinds,
        shake: {
          active: shakeT < shakeDur && shakeMag > 0,
          magnitude: Number(shakeMag.toFixed(2)),
          remaining: Number(Math.max(0, shakeDur - shakeT).toFixed(3)),
          direction: [Number(shakeDirX.toFixed(3)), Number(shakeDirY.toFixed(3))],
          offset: [Number(currentOffset.x.toFixed(3)), Number(currentOffset.y.toFixed(3))],
        },
      };
    },
  };

  function drawSpriteEffect(ctx, effect) {
    const sprite = sprites[`vfx_${effect.weaponId}_v1`];
    if (!sprite) return;
    const progress = clampT(effect.t / effect.life);
    const sequence = effect.frames || (effect.phase === "release" ? [0, 1, 2] : [3, 4, 5]);
    const frame = sequence[Math.min(sequence.length - 1, Math.floor(progress * sequence.length))];
    const sourceX = (frame % VFX_COLUMNS) * VFX_CELL_WIDTH;
    const sourceY = Math.floor(frame / VFX_COLUMNS) * VFX_CELL_HEIGHT;
    const peak = progress < 0.68 ? 1 : Math.max(0, (1 - progress) / 0.32);
    const scale = effect.phase === "hit"
      ? (0.9 + easeOutCubic(progress) * 0.14) * Math.min(1.16, effect.strength || 1)
      : 0.96 + easeOutCubic(progress) * 0.06;
    const width = effect.width * scale;
    const height = effect.height * scale;
    const rotation = effect.rotation || 0;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.max(0, peak * (effect.phase === "hit" ? 1 : 0.86))
      * (dangerActive ? 0.58 : intensity === "reduced" ? 0.8 : 1);
    ctx.imageSmoothingEnabled = true;
    if (rotation) {
      ctx.translate(effect.x, effect.y + effect.offsetY);
      ctx.rotate(rotation);
      ctx.drawImage(
        sprite,
        sourceX,
        sourceY,
        VFX_CELL_WIDTH,
        VFX_CELL_HEIGHT,
        -width * effect.anchorX,
        -height * effect.anchorY,
        width,
        height,
      );
    } else {
      ctx.drawImage(
        sprite,
        sourceX,
        sourceY,
        VFX_CELL_WIDTH,
        VFX_CELL_HEIGHT,
        effect.x - width * effect.anchorX,
        effect.y + effect.offsetY - height * effect.anchorY,
        width,
        height,
      );
    }
    ctx.restore();
  }

  function drawPopup(ctx, p) {
    const k = p.t / p.life;
    const alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    const y = p.y - p.rise * easeOutCubic(k);
    const scale = k < 0.12 ? 0.65 + (k / 0.12) * 0.35 : 1;
    ctx.save();
    const isReward = /^(\+\d|몬스터 격파|보물!)/.test(p.text);
    ctx.globalAlpha = Math.max(0, alpha) * (dangerActive && isReward ? 0.42 : 1);
    ctx.translate(p.x, y);
    ctx.scale(scale, scale);
    ctx.font = `800 ${p.size}px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (p.stroke) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(10,6,20,0.85)";
      ctx.strokeText(p.text, 0, 0);
    }
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  return api;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clampT(t) {
  return Math.max(0, Math.min(1, t));
}
