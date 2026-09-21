// Scene state machine: title -> preparation/weapon select -> run <-> forge ->
// results -> preparation/ranking. Game rules follow the v3 endless mode and
// v4 shard settlement, tickets, and permanent-growth revisions.
import * as engine from "./engine.js";
import { audio, sfx } from "./sfx.js";
import { createFx } from "./fx.js";
import { createWorld, DEBRIS_PALETTES, MONSTER_DEBRIS_PALETTES } from "./render.js";
import { createUi } from "./ui.js";
import { attackFrameAt, attackImpactTime, attackMotion, idleFrameAt } from "./attack-motion.js";
import { monsterArtLayout } from "./monster-grid.js";
import { selectMonsterDefinition } from "./monster-catalog.js";
import { createBossPattern, updateBossPattern, bossPatternView, DEBRIS_RULES } from "./boss-hazards.js";
import { createProfileService, rerollOfferSetSignature, settlementUnlockIds } from "./economy.js";
import { createEmptyProfileV2 } from "./profile.js";

const RANK_KEY = "monsterday.rankings.v1";
const RANK_MAX = 10;
const EFFECTS_KEY = "monsterday.effects.v1";
const RANK_WEIGHTS = { common: 70, rare: 25, epic: 5 };
const LANE_TWEEN = 0.09;
const SWING_LIFE = 0.18;
const HP_MAX = 100;
const MP_REGEN = 5; // per second, only while the blade rests
const MP_PAUSE = 1.2; // regen pause after any attack/skill
const OPENING_MP_PER_STAGE = 15;
const ATTACK_SPEED_PER_STACK = 0.15;
const ATTACK_COOLDOWN_MIN = 0.08;
const ATTACK_POWER_PER_WHET = 0.15;
const CLEAVE_DAMAGE = 50;
const ARROW_RAIN_MIN_DAMAGE = 100;
const ARROW_RAIN_MAX_HP_RATIO = 0.6;
const BOMBER_DAMAGE = 100;
const BOMBER_PALETTE = DEBRIS_PALETTES[3];
const EXECUTE_GAUGE_RATIO = 1 / 3;
const MUGETSU_DUR = 5;
const MUGETSU_LINGER_DUR = 7;
const MUGETSU_DAMAGE_MUL = 1.3;
const SPEAR_PUSH_SECONDS = 1.5;
const SPEAR_DRIVE_PUSH_SECONDS = 2.5;
const SPEAR_RAGE_DUR = 3;
const SPEAR_RAGE_DAMAGE = 50;
const SWORD_WAVE_DAMAGE = 150;
const BOW_TWIN_CHANCE = 12;
const BOW_TWIN_DELAY = 0.06;
const ENTRANCE_DURATION = 1.15;
const ENTRANCE_VIEW_GAP = 30;

function loadRankings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RANK_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Inserts, sorts by score desc (earlier entry wins ties), trims to top 10.
// Return storage success separately from leaderboard placement: a valid
// saved score can still fall outside the ten visible rows.
function saveRankingEntry(entry) {
  const list = loadRankings();
  entry.id = `${Date.now()}_${list.length}`;
  list.push(entry);
  list.sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0));
  const trimmed = list.slice(0, RANK_MAX);
  try {
    localStorage.setItem(RANK_KEY, JSON.stringify(trimmed));
    return { saved: true, index: trimmed.findIndex((e) => e.id === entry.id) };
  } catch {
    return { saved: false, index: -1 };
  }
}

export function createSceneMachine({
  ctx,
  data,
  input,
  sprites,
  nameEntry,
  layout: initialLayout = null,
  profileWritable = true,
  profileExclusive = false,
  profileLockSupported = true,
}) {
  let W = engine.W;
  let H = engine.H;
  let layout = initialLayout;
  const fx = createFx(sprites);
  let world = createWorld(ctx, sprites);
  let ui = createUi(ctx, sprites, data.forgeAtlas, data.uiAtlas, data.comboAtlas, layout);
  let BUILDING_SPAN = { x: engine.BUILDING_X, w: engine.BUILDING_W };
  // Endless level design (data/stages.json): 10-stage cycles, a shuffled
  // type bag per cycle, boss on every 10th stage. Combat is endless until the
  // player dies or chooses to leave and settle the current run.
  const stageCfg = data.stages;
  const CYCLE_LEN = stageCfg.cycleLength || 10;
  const STAGE_TYPES = stageCfg.types;
  const RANK_ORDER = { common: 0, rare: 1, epic: 2 };
  const validWeaponIds = data.weapons.map((weapon) => weapon.id);
  const defaultWeaponId = data.weapons[0]?.id || "chokento";
  const profileService = createProfileService({
    storage: typeof localStorage === "undefined" ? null : localStorage,
    sessionStorage: typeof sessionStorage === "undefined" ? null : sessionStorage,
    economy: data.economy,
    growth: data.growth,
    validWeaponIds,
    defaultWeaponId,
    writable: profileWritable,
  });
  let profile = profileService.snapshot() || createEmptyProfileV2({ defaultWeaponId });
  let profileAvailable = profileService.status().ok && profileWritable;
  let startupNotice = "";
  const startupUnlockIds = profile.activeRun
    ? unlockIdsForRunSummary(profile, profile.activeRun.summary)
    : [];
  let recoveredRun = profileAvailable
    ? profileService.recoverOwnedOrStaleRun({ unlockedIds: startupUnlockIds })
    : null;
  if (!recoveredRun?.ok && recoveredRun?.kind === "foreign-active" && profileExclusive && profile.activeRun) {
    recoveredRun = profileService.settleRun({
      runId: profile.activeRun.id,
      reason: "recovery",
      unlockedIds: startupUnlockIds,
      allowForeign: true,
    });
    if (recoveredRun.ok) recoveredRun = { ...recoveredRun, recovered: true, kind: "exclusive-recovery" };
  }
  if (recoveredRun?.ok && recoveredRun.recovered) {
    profile = recoveredRun.profile;
    startupNotice = `이전 모험의 파편 ${recoveredRun.receipt?.shardsEarned || 0}개를 정산했습니다`;
  } else if (recoveredRun?.ok) {
    profile = recoveredRun.profile;
  } else if (recoveredRun?.kind === "foreign-active") {
    startupNotice = "다른 탭에서 모험이 진행 중입니다";
  } else if (!profileWritable) {
    startupNotice = profileLockSupported
      ? "다른 탭이 성장 기록을 사용 중입니다 · 해당 탭을 닫고 새로고침하세요"
      : "이 브라우저는 안전한 성장 기록 저장을 지원하지 않습니다";
  } else if (!profileAvailable) {
    startupNotice = profileService.status().error?.message || "성장 기록을 불러오지 못했습니다";
  }
  const economyConfig = profileService.economy;
  const growthConfig = profileService.growth;
  const preparedWeapon = data.weapons.find((weapon) => weapon.id === profile.preparation?.weaponId) || data.weapons[0];

  let clock = 0;
  let reducedMotion = false;
  try { reducedMotion = localStorage.getItem(EFFECTS_KEY) === "reduced"; } catch { /* optional preference */ }
  fx.setIntensity?.(reducedMotion ? "reduced" : "normal");
  let paused = false;
  const pauseMenu = { section: "main", index: 0, scrollOffset: 0 };
  let ensureGameplayAssets = () => Promise.resolve();
  let gameplayAssetsReady = () => true;
  let gameplayAssetsFailed = () => false;
  let gameplayAssetsLoading = false;

  function setGameplayAssetsReady(ensure, ready, failed) {
    ensureGameplayAssets = typeof ensure === "function" ? ensure : ensureGameplayAssets;
    gameplayAssetsReady = typeof ready === "function" ? ready : gameplayAssetsReady;
    gameplayAssetsFailed = typeof failed === "function" ? failed : gameplayAssetsFailed;
  }

  function setPaused(next) {
    const value = scene === "run" && Boolean(next);
    if (value === paused) return paused;
    paused = value;
    pauseMenu.section = "main";
    pauseMenu.index = 0;
    pauseMenu.scrollOffset = 0;
    input.reset?.();
    audio.setPaused(paused);
    if (typeof document !== "undefined") document.body.dataset.gamePaused = String(paused);
    return paused;
  }

  function requestGameplayAssets() {
    if (gameplayAssetsReady() || gameplayAssetsLoading) return;
    gameplayAssetsLoading = true;
    Promise.resolve(ensureGameplayAssets()).finally(() => {
      gameplayAssetsLoading = false;
    });
  }

  const run = {
    weapon: preparedWeapon,
    stageIndex: 0,
    buildingIndex: 0,
    buildingsInStage: 1,
    plan: null, // current stage's level-design plan (type, waves, profile, reward)
    cycleBag: [],
    cycleBagCycle: -1,
    stageBannerShown: false,
    hp: HP_MAX,
    hpMax: HP_MAX,
    guard: engine.GUARD_MAX,
    mp: 0,
    mpPause: 0,
    mugetsuT: 0,
    spearRageT: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    comboIdleTimer: 0,
    shards: 0,
    level: 1,
    experience: 0,
    totalExperience: 0,
    pendingUpgrades: 0,
    stageRewarded: false,
    rerollTickets: 0,
    freeRerolls: 0,
    purchasedRerolls: 0,
    purchasedReserved: 0,
    activeRunId: null,
    economyManaged: false,
    economySaveError: null,
    heartbeatT: 0,
    growthLevels: { maxHp: 0, maxGuard: 0 },
    floorsCollapsed: 0,
    attackCount: 0,
    skillCount: 0,
    cleared: false,
    upgrades: {}, // id -> stack count
    player: null,
    building: null,
    camera: { y: 0 },
    activeAttacks: [],
    projectiles: [],
    pendingAttack: null,
    bossPattern: null,
    deathCause: "contact",
    elapsed: 0,
    lastUpgrade: null,
    respawnTimer: 0,
    lastCellHit: null, // rowIndex:lane key for the "정련" 3-hit streak
    sameCellStreak: 0,
  };

  function unlockSatisfied(unlock, nextProfile = profile) {
    if (!unlock) return true;
    const value = unlock.stat === "runs" ? nextProfile.runs
      : unlock.stat === "totalFloors" ? nextProfile.totalFloors
        : unlock.stat === "bestStage" ? nextProfile.bestStage
          : unlock.stat === "totalScore" ? nextProfile.totalScore
            : 0;
    return value >= Number(unlock.threshold || 0);
  }

  function acceptProfileResult(result, fallbackMessage = "성장 기록을 저장하지 못했습니다") {
    if (result?.ok && result.profile) {
      profile = result.profile;
      profileAvailable = profileWritable;
      return true;
    }
    if (result?.profile) profile = result.profile;
    const code = result?.error?.code || "";
    if (/^(PROFILE|STORAGE)_/.test(code)) profileAvailable = false;
    preparationState.saveError = result?.error?.message || fallbackMessage;
    return false;
  }

  function currentRunStats() {
    return {
      stage: run.stageIndex + 1,
      score: Math.max(0, Math.round(run.score)),
      floorsCollapsed: Math.max(0, Math.round(run.floorsCollapsed)),
      bestCombo: Math.max(0, Math.round(run.bestCombo)),
      attackCount: Math.max(0, Math.round(run.attackCount)),
      skillCount: Math.max(0, Math.round(run.skillCount)),
    };
  }

  function updateRerollTotal() {
    run.rerollTickets = Math.max(0, run.freeRerolls) + Math.max(0, run.purchasedRerolls);
  }

  function refillFreeRerolls() {
    if (run.economyManaged && run.activeRunId) {
      const saved = profileService.refillFreeReroll({ runId: run.activeRunId });
      if (!saved.ok) {
        run.economySaveError = saved.error?.message || "무료 새로고침을 저장하지 못했습니다";
        return 0;
      }
      profile = saved.profile;
      run.freeRerolls = saved.freeRemaining;
      run.economySaveError = null;
      updateRerollTotal();
      return saved.added;
    }
    const before = run.freeRerolls;
    run.freeRerolls = Math.min(
      economyConfig.reroll.freeRerollCap,
      run.freeRerolls + economyConfig.reroll.bossRefillAmount,
    );
    updateRerollTotal();
    return run.freeRerolls - before;
  }

  function growthDefinition(id) {
    return growthConfig.items.find((item) => item.id === id) || null;
  }

  function growthValue(id, levels = run.growthLevels) {
    const item = growthDefinition(id);
    const level = Math.max(0, Math.min(item?.maxLevel || 0, Number(levels?.[id]) || 0));
    return item ? item.baseValue + level * item.valuePerLevel : (id === "maxHp" ? HP_MAX : engine.GUARD_MAX);
  }

  function growthViews() {
    return growthConfig.items.map((item) => {
      const level = Math.max(0, Number(profile.growth?.[item.id]) || 0);
      const maxed = level >= item.maxLevel;
      const cost = maxed ? null : item.costs[level];
      return {
        id: item.id,
        name: item.label,
        level,
        maxLevel: item.maxLevel,
        current: item.baseValue + level * item.valuePerLevel,
        next: maxed ? null : item.baseValue + (level + 1) * item.valuePerLevel,
        cost,
        maxed,
        canBuy: profileAvailable && !maxed && profile.wallet.shards >= cost,
      };
    });
  }

  function unlockIdsForRunSummary(nextProfile, summary) {
    return settlementUnlockIds(nextProfile, summary, data.weapons);
  }

  function weaponViews() {
    return data.weapons.map((weapon) => ({
      ...weapon,
      unlockProgress: weapon.unlock ? {
        value: Number(profile[weapon.unlock.stat] || 0),
        target: Number(weapon.unlock.threshold),
        label: weapon.unlock.label,
      } : null,
      locked: weapon.id !== "chokento"
        && !profile.unlocked.includes(weapon.id)
        && !unlockSatisfied(weapon.unlock),
    }));
  }

  function commitRunResult() {
    if (results.committed) return;
    if (!run.economyManaged || !run.activeRunId) {
      results.committed = true;
      results.profileSaved = true;
      results.settlement = {
        reason: results.endReason,
        shardsEarned: run.shards,
        shardBalance: profile.wallet?.shards || 0,
        returnedTickets: run.purchasedRerolls,
        spentTickets: Math.max(0, run.purchasedReserved - run.purchasedRerolls),
        ticketBalance: profile.wallet?.rerollTickets || 0,
      };
      return;
    }
    const synced = profileService.syncRun({ runId: run.activeRunId, shardsEarned: run.shards, ...currentRunStats() });
    if (!acceptProfileResult(synced, "파편 정산을 준비하지 못했습니다")) {
      results.profileSaved = false;
      results.saveError = preparationState.saveError;
      return;
    }
    const newlyUnlockedIds = unlockIdsForRunSummary(profile, profile.activeRun.summary);
    const newlyUnlocked = newlyUnlockedIds
      .map((id) => data.weapons.find((weapon) => weapon.id === id)?.name)
      .filter(Boolean);
    const settled = profileService.settleRun({
      runId: run.activeRunId,
      reason: results.endReason,
      stats: currentRunStats(),
      unlockedIds: newlyUnlockedIds,
    });
    if (!acceptProfileResult(settled, "파편을 정산하지 못했습니다")) {
      results.profileSaved = false;
      results.saveError = preparationState.saveError;
      return;
    }
    results.newlyUnlocked = newlyUnlocked;
    results.newlyUnlockedIds = newlyUnlockedIds;
    results.committed = true;
    results.profileSaved = true;
    results.saveError = null;
    results.personalBest = Boolean(settled.personalBest);
    results.personalBestStage = settled.personalBestStage;
    results.settlement = settled.receipt;
    run.activeRunId = null;
  }

  function resize(width, height, nextLayout = layout) {
    const oldGroundY = engine.GROUND_Y;
    const oldBuildingX = engine.BUILDING_X;
    layout = nextLayout;
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    engine.configureViewport(width, height);
    W = engine.W;
    H = engine.H;
    world = createWorld(ctx, sprites);
    ui = createUi(ctx, sprites, data.forgeAtlas, data.uiAtlas, data.comboAtlas, layout);
    BUILDING_SPAN = { x: engine.BUILDING_X, w: engine.BUILDING_W };

    const dy = engine.GROUND_Y - oldGroundY;
    const dx = engine.BUILDING_X - oldBuildingX;
    if (run.player) {
      const wasGrounded = run.player.lastGrounded || Math.abs(run.player.y - oldGroundY) < 2;
      run.player.x = engine.BUILDING_X + engine.LANE_W * (run.player.lane + 0.5);
      run.player.y += dy;
      if (wasGrounded) {
        run.player.y = engine.GROUND_Y;
      }
    }
    if (run.building) {
      run.building.y += dy;
      run.building.fixedYQ6 += dy * 0x40;
      if (run.building.entrance) {
        run.building.entrance.startBottom += dy;
        run.building.entrance.endBottom += dy;
      }
    }
    // Resize changes the world's origin, not the progress of attacks already
    // in flight. Move the whole path so remaining reach and swept hits agree
    // with the recentered monster and the visible weapon trail.
    for (const attack of [...run.projectiles, ...run.activeAttacks]) {
      attack.x += dx;
      attack.y += dy;
      attack.prevY += dy;
      attack.fromY += dy;
    }
    anim.laneFromX += dx;
    fx.rebase(dx, dy);
    if (run.bossPattern) {
      for (const hazard of run.bossPattern.hazards) {
        hazard.x = engine.BUILDING_X + (hazard.lane + 0.5) * engine.LANE_W;
        hazard.y += dy; hazard.prevY += dy; hazard.spawnY += dy; hazard.targetY += dy;
      }
    }
    run.camera.y = Math.min(0, run.camera.y);
  }

  // presentation-only state
  const anim = {
    attackT: 9,
    attackDur: data.weapons[0].cooldown || 0.28,
    idleT: 0,
    flip: 1,
    swings: [], // {t, flip}
    laneFromX: 0,
    laneT: 9,
    comboPopT: 9,
    hpFlashT: 9,
    deflectT: 9,
    guardT: 0,
    hintT: 0,
    weaponId: "chokento",
    mugetsu: false,
  };

  function upgradeStack(id) {
    return run.upgrades[id] || 0;
  }

  function slashDamage() {
    let damage = run.weapon.damage * (1 + upgradeStack("whet") * ATTACK_POWER_PER_WHET);
    if (run.weapon.id === "katana" && run.mugetsuT > 0) damage *= MUGETSU_DAMAGE_MUL;
    if (run.weapon.id === "katana" && run.mugetsuT > 0 && upgradeStack("kt_moon") > 0) {
      damage += Math.min(60, run.combo * 2);
    }
    if (run.weapon.id === "spear" && run.spearRageT > 0) {
      damage += SPEAR_RAGE_DAMAGE;
    }
    return damage;
  }

  function guardMax() {
    return growthValue("maxGuard", run.growthLevels) + upgradeStack("core") * 30;
  }

  function mpRegenMul() {
    return 1 + upgradeStack("focus") * 0.2;
  }

  function attackSpeedMul() {
    let mul = 1 + Math.min(4, upgradeStack("haste")) * ATTACK_SPEED_PER_STACK;
    if (run.weapon.id === "katana" && upgradeStack("kt_speed") > 0) mul *= 1.1;
    return mul;
  }

  function attackCooldown() {
    let cooldown = run.weapon.cooldown || 0.28;
    if (run.weapon.id === "axe" && upgradeStack("ax_balance") > 0) cooldown = 0.52;
    return Math.max(ATTACK_COOLDOWN_MIN, cooldown / attackSpeedMul());
  }

  function attackRange() {
    let range = run.weapon.range || engine.SLASH_REACH_TOP;
    if (run.weapon.id === "spear" && upgradeStack("sp_haft") > 0) range += 40;
    return range;
  }

  function gainMp(amount) {
    run.mp = Math.min(run.weapon.mpMax, run.mp + amount);
  }

  function addScore(amount) {
    run.score += Math.round(amount);
  }

  function addCombo(delta) {
    run.combo += delta;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    run.comboIdleTimer = 0;
    anim.comboPopT = 0;
  }

  function experienceRequired() {
    return (stageCfg.experience?.initialRequired ?? 600)
      + (run.level - 1) * (stageCfg.experience?.requiredIncrease ?? 200);
  }

  function experienceState() {
    return { level: run.level, current: run.experience, required: experienceRequired(),
      total: run.totalExperience, pendingUpgrades: run.pendingUpgrades };
  }

  // Only direct attack damage enters this path. Passing/guarding and the
  // untouched cells removed by a row collapse never contribute experience.
  function applyAttackDamage(cell, damage) {
    if (!cell || cell.active === false || cell.hp <= 0) return { collapsed: false, damage: 0 };
    const result = engine.applySlashDamage(cell, damage);
    const actual = Math.max(0, result.hpBefore - result.hpAfter);
    run.experience += actual;
    run.totalExperience += actual;
    while (run.experience >= experienceRequired()) {
      run.experience -= experienceRequired();
      run.level += 1;
      run.pendingUpgrades += 1;
    }
    return { ...result, damage: actual };
  }

  function addShards(amount) {
    const gained = Math.max(0, Math.round(Number(amount) || 0));
    if (gained <= 0) return;
    run.shards += gained;
    if (!run.economyManaged || !run.activeRunId) return;
    const saved = profileService.syncRun({
      runId: run.activeRunId,
      shardsEarned: run.shards,
      ...currentRunStats(),
    });
    if (saved.ok) {
      profile = saved.profile;
      run.economySaveError = null;
    } else {
      run.economySaveError = saved.error?.message || "파편 획득 기록을 저장하지 못했습니다";
    }
  }

  function resetCombo() {
    run.combo = 0;
    run.comboIdleTimer = 0;
  }

  // === Forge pool (spec §3, data/upgrades.json) ===
  function rollForgeCards(minRank = null) {
    const pool = data.upgrades.filter((u) => (
      (!u.weapon || u.weapon === run.weapon.id)
      && !(u.unique && upgradeStack(u.id) > 0)
      && !(u.maxStacks && upgradeStack(u.id) >= u.maxStacks)
    ));
    const picked = [];
    const usedIds = new Set();
    let guard = 0;
    while (picked.length < 3 && guard < 200) {
      guard += 1;
      const rank = rollRank();
      const candidates = pool.filter((u) => u.rank === rank && !usedIds.has(u.id));
      const source = candidates.length ? candidates : pool.filter((u) => !usedIds.has(u.id));
      if (!source.length) break;
      const pick = source[engine.randInt(source.length)];
      usedIds.add(pick.id);
      picked.push(pick);
    }
    // 정예/보스 보상: 최소 등급 1장 보장
    if (minRank && picked.length) {
      const need = RANK_ORDER[minRank] ?? 0;
      if (!picked.some((c) => (RANK_ORDER[c.rank] ?? 0) >= need)) {
        const taken = new Set(picked.slice(1).map((c) => c.id));
        const eligible = pool.filter((u) => (RANK_ORDER[u.rank] ?? 0) >= need && !taken.has(u.id));
        if (eligible.length) picked[0] = eligible[engine.randInt(eligible.length)];
      }
    }
    return picked;
  }

  function rollRank() {
    const total = RANK_WEIGHTS.common + RANK_WEIGHTS.rare + RANK_WEIGHTS.epic;
    const roll = engine.randInt(total);
    if (roll < RANK_WEIGHTS.common) return "common";
    if (roll < RANK_WEIGHTS.common + RANK_WEIGHTS.rare) return "rare";
    return "epic";
  }

  // === Endless stage plan (level design) ===
  function rollCycleBag(cycleIdx) {
    const extras = stageCfg.standardBagExtras || [];
    const bag = cycleIdx === 0
      ? [...stageCfg.firstCycleBag]
      : [
        ...stageCfg.standardBag,
        extras.length ? extras[engine.randInt(extras.length)] : "normal",
        extras.length ? extras[engine.randInt(extras.length)] : "normal",
      ];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = engine.randInt(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  function planForStage(s) {
    const cycleIdx = Math.floor(s / CYCLE_LEN);
    const pos = s % CYCLE_LEN;
    let typeId = "normal"; // cycle openers stay normal (breather after the boss)
    if (pos === CYCLE_LEN - 1) typeId = "boss";
    else if (pos > 0) {
      if (run.cycleBagCycle !== cycleIdx) {
        run.cycleBag = rollCycleBag(cycleIdx);
        run.cycleBagCycle = cycleIdx;
      }
      typeId = run.cycleBag[pos - 1] || "normal";
    }
    const t = STAGE_TYPES[typeId] || STAGE_TYPES.normal;
    return {
      typeId,
      label: t.label,
      color: t.color,
      waves: t.waves || 1,
      rows: t.rows,
      // bosses grow taller every cycle on top of the base endless curve
      rowsAddScaled: (t.rowsAdd || 0) + (typeId === "boss" ? Math.min(8, cycleIdx * 2) : 0),
      speedMul: t.speedMul || 1,
      weights: t.weights || null,
      hpTierAdd: t.hpTierAdd || 0,
      attackMul: t.attackMul || 1,
      shardMul: t.shardMul || 1,
      specials: t.specials || null,
      reward: t.reward || "forge",
      clearShards: t.clearShards ?? 30,
    };
  }

  function enterStage(s) {
    run.stageIndex = s;
    run.plan = planForStage(s);
    run.buildingsInStage = run.plan.waves;
    run.buildingIndex = 0;
    run.stageBannerShown = false;
    run.stageRewarded = false;
    audio.setMusicMode(run.plan.typeId === "boss" ? "boss" : "battle");
  }

  // === Single-monster wave lifecycle ===
  function spawnBuilding() {
    const plan = run.plan || planForStage(run.stageIndex);
    const monsterDefinition = selectMonsterDefinition(run.stageIndex, run.buildingIndex, plan.typeId);
    const monsterSprite = sprites[monsterDefinition.spriteKey];
    if (!monsterSprite) throw new Error(`필수 몬스터 원화가 없습니다: ${monsterDefinition.id}`);
    run.building = engine.newBuilding(run.stageIndex, run.camera.y, {
      rows: plan.rows,
      rowsAdd: plan.rowsAddScaled,
      speedMul: plan.speedMul,
      weights: plan.weights,
      hpAdd: (plan.hpTierAdd || 0) * 100,
      specials: plan.specials,
      monsterDefinition,
      encounterType: plan.typeId,
      monsterLayoutForRows: (rows) => monsterArtLayout(monsterSprite, monsterDefinition, rows, {
        width: engine.BUILDING_W,
        rowHeight: engine.ORIGINAL_ROW_HEIGHT,
        lanes: engine.LANES,
      }),
    });
    run.building.entityId = `monster-${run.stageIndex}-${run.buildingIndex}`;
    const startBottom = entranceStartBottom();
    // The fast approach ends above the grounded view, leaving the jump to
    // bridge the distance. An airborne camera must not raise this destination
    // again on every wave; the current attack boundary still protects the player.
    const projection = layout?.combatProjection;
    const groundedViewTop = -(projection?.translateY || 0) / (projection?.scale || 1);
    const endBottom = Math.min(groundedViewTop - ENTRANCE_VIEW_GAP, entranceCombatBoundary());
    const offset = startBottom - engine.buildingVisualBottomEdge(run.building);
    run.building.y += offset;
    run.building.fixedYQ6 = run.building.y * 0x40;
    run.building.holdFrames = 0;
    run.building.entrance = { phase: "entering", elapsed: 0, duration: ENTRANCE_DURATION, startBottom, endBottom };
    run.bossPattern = monsterDefinition.behavior.hazardPattern
      ? createBossPattern(run.building.entityId, run.stageIndex) : null;
    run.lastCellHit = null;
    run.sameCellStreak = 0;

    // stage-type banner on the first wave
    if (run.buildingIndex === 0 && plan.typeId !== "normal" && !run.stageBannerShown) {
      run.stageBannerShown = true;
      const cx = engine.BUILDING_X + engine.BUILDING_W / 2;
      fx.popup(`${monsterDefinition.name} · ${plan.label}`, cx, engine.GROUND_Y - 260, {
        color: plan.color || "#ece6f4", size: 20, life: 1.3, rise: 20,
      });
      if (plan.typeId === "boss") {
        fx.flash("#e5484d", 0.12, 0.5);
        fx.shake(4, 0.3);
      }
    }
  }

  function entranceStartBottom() {
    const projection = layout?.combatProjection;
    const projectionOffset = (projection?.translateY || 0) / (projection?.scale || 1);
    const visibleTop = run.camera.y - projectionOffset;
    // A jump can lift both the player and camera far above the ground view.
    // Anchor to the ground's full jump apex, not another jump above the current
    // airborne position, so later waves do not spawn progressively farther away.
    const apexY = Math.min(engine.GROUND_Y - engine.JUMP_MAX_RISE, run.player.y);
    const apexCameraY = Math.min(0, run.camera.y, apexY - engine.CAMERA_TARGET_PLAYER_SCREEN_Y);
    return Math.min(visibleTop, apexCameraY - projectionOffset, entranceCombatBoundary(apexY))
      - engine.JUMP_MAX_RISE - engine.ORIGINAL_ROW_HEIGHT;
  }

  function entranceCombatBoundary(playerY = run.player.y) {
    return Math.min(engine.GROUND_Y - 160,
      playerY - (run.weapon.ranged ? 70 : 52) - attackRange() - 20);
  }

  function advanceMonster() {
    const building = run.building;
    const entrance = building.entrance;
    if (!entrance || entrance.phase === "combat") {
      engine.advanceBuilding(building);
      return;
    }
    entrance.elapsed += 1 / 60;
    const boundary = Math.min(entrance.endBottom, entranceCombatBoundary());
    const t = Math.min(1, entrance.elapsed / entrance.duration);
    const desired = Math.min(boundary, entrance.startBottom + (entrance.endBottom - entrance.startBottom) * t);
    const current = engine.buildingVisualBottomEdge(building);
    // Moving/jumping into attack range ends presentation immediately; no rewind.
    if (current < boundary) {
      building.fixedYQ6 += Math.max(0, desired - current) * 0x40;
      building.y = building.fixedYQ6 / 0x40;
    }
    if (engine.buildingVisualBottomEdge(building) >= boundary - 0.5 || t >= 1) {
      entrance.phase = "combat";
      entrance.completedAt = run.elapsed;
    }
  }

  function buildingApproachState() {
    if (!run.building?.floors.length) return null;
    const entrance = run.building.entrance;
    if (!entrance) return null;
    const projection = layout?.combatProjection;
    const bottomScreenY = (engine.buildingVisualBottomEdge(run.building) - run.camera.y)
      * (projection?.scale || 1) + (projection?.translateY || 0);
    if (entrance.phase !== "entering" && bottomScreenY >= 24) return null;
    return {
      bottomScreenY,
      settleY: entrance.endBottom,
      boosted: entrance.phase === "entering",
      offscreen: bottomScreenY < 24,
      seconds: Math.max(0, entrance.duration - entrance.elapsed),
      progress: Math.min(1, entrance.elapsed / entrance.duration),
    };
  }

  // Port order (src/game.js slash ~1194-1197 then collapseFloor ~1212): combo
  // increments first, then the cell-destroy component (tier score + combo*12),
  // then the row-collapse component (300 + combo*20). MP is NOT fed by kills.
  function onFloorCollapsed(floorMaterialType) {
    run.floorsCollapsed += 1;
    addCombo(1);
    const info = engine.materialInfo[floorMaterialType];
    const cellGain = info.score + run.combo * 12;
    addScore(cellGain);
    const floorGain = 300 + run.combo * 20;
    addScore(floorGain);
    return cellGain + floorGain;
  }

  function awardSkillRows(removed) {
    if (removed <= 0) return 0;
    const gained = removed * 700 + run.combo * 30;
    addScore(gained);
    for (let row = 0; row < removed; row += 1) addCombo(1);
    run.floorsCollapsed += removed;
    return gained;
  }

  function collapseFxAt(materialType, x, y, gained) {
    const monsterPalette = run.building?.monsterDefinition?.palette.debris
      || MONSTER_DEBRIS_PALETTES[run.building?.artKind];
    fx.debris(x, y, 14, monsterPalette || DEBRIS_PALETTES[materialType]);
    fx.dust(x, y + 30, 7);
    fx.sparks(x, y, 8, "#ffe9b0");
    fx.crystals(x, y - 10, 3);
    fx.rowCollapse?.(y, monsterPalette?.[0] || "#9fdcff");
    fx.popup(`+${gained}`, x, y - 26, { color: "#ffd98a", size: 17 });
    fx.shake(5, 0.24);
    fx.stop(3);
    sfx.collapse();
  }

  function onGrazeHit(x, y) {
    addScore(20);
    fx.sparks(x, y, 7, "#e8ecff");
    fx.popup("+20", x, y - 8, { color: "#cfd8ea", size: 12, rise: 22, life: 0.6 });
    sfx.hit();
  }

  function collapseFloorByRef(building, floor, lane, yHint = null) {
    const index = building.floors.indexOf(floor);
    if (index === -1) return false;
    const cell = floor.cells[lane];
    const y = yHint ?? engine.floorWorldY(building, floor);
    const gained = onFloorCollapsed(cell.type);
    engine.collapseFloor(building, index);
    collapseFxAt(cell.type, engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2, y + 40, gained);
    return true;
  }

  function damageFloorCellByRef(building, floor, lane, damage, color = "#ffe9b0") {
    if (!building || !floor || building.floors.indexOf(floor) === -1) return false;
    const cell = floor.cells[lane];
    if (!cell || cell.hp <= 0) return false;
    const y = engine.floorWorldY(building, floor);
    const result = applyAttackDamage(cell, damage);
    cell.hitWeapon = run.weapon.id;
    const x = engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2;
    fx.sparks(x, y + 58, 9, color);
    if (result.collapsed) collapseFloorByRef(building, floor, lane, y);
    return result.collapsed;
  }

  function floorAtRowOffset(building, floor, offset) {
    const rowIndex = floor.rowIndex + offset;
    return building.floors.find((candidate) => candidate.rowIndex === rowIndex) || null;
  }

  function triggerBomberExplosion(building, floor, lane, floorY) {
    const originX = engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2;
    fx.debris(originX, floorY + 46, 18, BOMBER_PALETTE);
    fx.sparks(originX, floorY + 48, 18, "#ffb15c");
    fx.flash("#ff7a1a", 0.08, 0.18);
    fx.shake(7, 0.28);
    sfx.bomber();

    const targets = [-1, 1]
      .map((offset) => ({ floor: floorAtRowOffset(building, floor, offset) }))
      .filter((target) => target.floor);

    for (const target of targets) {
      const cell = target.floor.cells[lane];
      if (!cell || cell.hp <= 0) continue;
      const y = engine.floorWorldY(building, target.floor);
      applyAttackDamage(cell, BOMBER_DAMAGE);
      cell.flash = 0.2;
      fx.sparks(originX, y + 58, 12, "#ffb15c");
      fx.debris(originX, y + 58, 8, BOMBER_PALETTE);
      if (cell.hp <= 0) collapseFloorByRef(building, target.floor, lane, y);
    }
  }

  // Resolve all splash targets before removing the row, even on a lethal
  // main hit. Each real HP reduction counts once; collateral deletion does not.
  function applyCleaveSplash(building, floor, hitLane, floorY) {
    if (upgradeStack("cleave") <= 0) return -1;
    let brokenLane = -1;
    for (const lane of [hitLane - 1, hitLane + 1]) {
      if (lane < 0 || lane >= engine.LANES) continue;
      const cell = floor.cells[lane];
      if (cell.hp <= 0) continue;
      applyAttackDamage(cell, CLEAVE_DAMAGE);
      cell.flash = 0.2;
      const laneX = engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2;
      fx.sparks(laneX, floorY + 60, 4, "#9fdcff");
      if (cell.hp <= 0 && brokenLane < 0) brokenLane = lane;
    }
    return brokenLane;
  }

  function applyPierceAbove(building, above, lane) {
    const pierceDamage = upgradeStack("sp_pierce") > 0 ? 100 : run.weapon.pierce;
    damageFloorCellByRef(building, above, lane, pierceDamage, "#9fdcff");
  }

  function applyWeaponHit(target, { lane, mainLane }) {
    const b = run.building;
    if (!b) return { hit: false, collapsed: false };
    const { cell, floorY, index, floor } = target;

    let damage = slashDamage();
    const axeSmashDamage = run.weapon.id === "axe" && upgradeStack("ax_smash") > 0 ? damage * 0.5 : 0;
    if (run.weapon.hardMul && cell.type === 2) damage *= run.weapon.hardMul;

    // "정련" is the 장검's trait only, and only on the player's own lane.
    let refined = false;
    if (mainLane && run.weapon.id === "chokento") {
      const cellKey = `${floor.rowIndex}:${lane}`;
      if (run.lastCellHit === cellKey) run.sameCellStreak += 1;
      else {
        run.lastCellHit = cellKey;
        run.sameCellStreak = 1;
      }
      const refineEvery = upgradeStack("sw_stone") > 0 ? 2 : 3;
      refined = run.sameCellStreak % refineEvery === 0;
      if (refined) damage *= upgradeStack("sw_keen") > 0 ? 3 : 2;
    }

    // "처형": low gauge monsters die in one hit regardless of damage stat.
    if (upgradeStack("execute") > 0 && engine.cellHpRatio(cell) <= EXECUTE_GAUGE_RATIO) {
      damage = Math.max(damage, cell.hp);
    }

    const waveFloor = refined && upgradeStack("sw_wave") > 0 ? floorAtRowOffset(b, floor, -1) : null;
    const smashFloor = axeSmashDamage > 0 ? floorAtRowOffset(b, floor, 1) : null;
    // Capture the row before any kill, cleave, or bomber removes array slots.
    // A spear thrust penetrates whether or not the main target survives.
    const pierceFloor = mainLane && run.weapon.pierce ? floorAtRowOffset(b, floor, -1) : null;
    const result = applyAttackDamage(cell, damage);
    const splashBreak = mainLane ? applyCleaveSplash(b, floor, lane, floorY) : -1;
    const hitX = engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2;
    const hitY = floorY + engine.ORIGINAL_ROW_HEIGHT - 34;
    if (mainLane) {
      fx.weaponHit(run.weapon.id, hitX, hitY, { collapsed: result.collapsed, refined });
      const shake = run.weapon.id === "axe" ? 8.4
        : run.weapon.id === "chokento" ? 4.8
          : run.weapon.id === "spear" ? 4.2
            : run.weapon.id === "bow" ? 3.1 : 2.8;
      const shakeDirection = run.weapon.id === "spear" || run.weapon.id === "bow"
        ? { x: 0, y: -1 }
        : run.weapon.id === "axe" ? { x: 0.42, y: 1 }
          : { x: 1, y: -0.22 };
      fx.shake(shake, run.weapon.id === "axe" ? 0.28 : 0.16, shakeDirection);
    }
    if (refined && !result.collapsed) {
      fx.popup("강한 일격!", hitX, hitY - 26, { color: "#ffe9b0", size: 13, life: 0.6 });
    }

    if (result.collapsed) {
      if (mainLane) {
        run.lastCellHit = null;
        run.sameCellStreak = 0;
      }
      if (waveFloor) {
        damageFloorCellByRef(b, waveFloor, lane, SWORD_WAVE_DAMAGE, "#9fdcff");
      }
      if (mainLane && smashFloor) {
        damageFloorCellByRef(b, smashFloor, lane, axeSmashDamage, "#ffc36a");
      }
      if (cell.special === "bomber") triggerBomberExplosion(b, floor, lane, floorY);
      collapseFloorByRef(b, floor, lane, floorY);
      if (pierceFloor) applyPierceAbove(b, pierceFloor, lane);
      return { hit: true, collapsed: true };
    }

    onGrazeHit(hitX, hitY);
    if (splashBreak >= 0) collapseFloorByRef(b, floor, splashBreak, floorY);

    if (mainLane && smashFloor) {
      damageFloorCellByRef(b, smashFloor, lane, axeSmashDamage, "#ffc36a");
    }

    if (pierceFloor) applyPierceAbove(b, pierceFloor, lane);

    return { hit: true, collapsed: false };
  }

  // One lane's legacy slash resolution, kept for transition and target-state QA.
  function resolveSlashOnLane(lane, { mainLane }) {
    const b = run.building;
    if (!b) return false;
    const probe = { lane, y: run.player.y };
    const target = engine.findSlashTarget(b, probe, { range: attackRange(), ranged: run.weapon.ranged === true });
    if (!target) {
      if (mainLane) sfx.whiff();
      return false;
    }
    applyWeaponHit(target, { lane, mainLane });
    return true;
  }

  function projectileSpeedForWeapon(weapon) {
    if (weapon.id === "bow") return 1700 * (upgradeStack("bw_light") > 0 ? 1.3 : 1);
    return 1400;
  }

  function spawnBowProjectile({ delay = 0, twin = false } = {}) {
    const p = run.player;
    // 시위 위치에서 발사: 활 피벗(x+6, 어깨 높이)과 일치, 레인 트윈 중엔
    // 보간된 캐릭터 x를 따라간다 (레인 중앙 고정 금지 — 진단 #4).
    const y = p.y - 58;
    run.projectiles.push({
      kind: "arrow",
      lane: p.lane,
      x: laneVisualX(p) + 6,
      y,
      fromY: y,
      prevY: y,
      maxDistance: attackRange(),
      speed: projectileSpeedForWeapon(run.weapon),
      delay,
      twin,
      hit: false,
      fading: false,
      fadeT: 0,
    });
  }

  function meleeProfile(weapon) {
    if (weapon.id === "spear") return { kind: "thrust", speed: 2400, width: 30, life: 0.2 };
    if (weapon.id === "axe") return { kind: "heavy", speed: 1900, width: 82, life: 0.25 };
    if (weapon.id === "katana") return { kind: "slash", speed: 2500, width: 46, life: 0.16 };
    return { kind: "slash", speed: 2200, width: 60, life: 0.2 };
  }

  function spawnMeleeAttackTrace(lane, { mainLane }) {
    const p = run.player;
    const profile = meleeProfile(run.weapon);
    const y = p.y - 52;
    run.activeAttacks.push({
      kind: profile.kind,
      weaponId: run.weapon.id,
      lane,
      mainLane,
      x: engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2,
      fromY: y,
      y,
      prevY: y,
      maxDistance: attackRange(),
      speed: profile.speed,
      width: profile.width,
      life: profile.life,
      t: 0,
      hit: false,
      didHit: false,
      done: false,
      whiffed: false,
    });
  }

  function mugetsuTargetLane() {
    const p = run.player;
    if (!p || !run.building) return p?.lane ?? 1;
    const fromY = p.y - 52;
    let best = null;
    for (let lane = 0; lane < engine.LANES; lane += 1) {
      const target = engine.findFirstReachTarget(run.building, {
        lane,
        fromY,
        toY: fromY - attackRange(),
      });
      if (!target) continue;
      const laneDistance = Math.abs(lane - p.lane);
      if (!best
        || target.cell.hp < best.hp
        || (target.cell.hp === best.hp && laneDistance < best.laneDistance)) {
        best = { lane, hp: target.cell.hp, laneDistance };
      }
    }
    return best?.lane ?? p.lane;
  }

  function updateProjectiles(dt) {
    for (const projectile of run.projectiles) {
      if (projectile.delay > 0) {
        projectile.delay = Math.max(0, projectile.delay - dt);
        continue;
      }
      // 사거리 소진: 즉시 삭제 대신 짧게 흩어지며 사라진다 (진단 #5)
      if (projectile.fading) {
        projectile.fadeT += dt;
        projectile.y -= projectile.speed * 0.25 * dt; // 힘 빠진 채 살짝 더 뻗는다
        if (projectile.fadeT >= 0.22) projectile.hit = true;
        continue;
      }
      const remaining = projectile.maxDistance - Math.abs(projectile.fromY - projectile.y);
      projectile.prevY = projectile.y;
      projectile.y -= Math.min(projectile.speed * dt, Math.max(0, remaining));
      const traveled = Math.abs(projectile.fromY - projectile.y);
      const target = engine.findFirstReachTarget(run.building, {
        lane: projectile.lane,
        fromY: projectile.prevY,
        toY: projectile.y,
      });

      if (target && traveled <= projectile.maxDistance) {
        applyWeaponHit(target, { lane: projectile.lane, mainLane: true });
        projectile.hit = true;
        projectile.didHit = true;
      } else if (traveled >= projectile.maxDistance) {
        projectile.fading = true;
        fx.arrowFizzle(projectile.x, projectile.y);
        sfx.arrowFizzle();
      }
    }
    run.projectiles = run.projectiles.filter((projectile) => !projectile.hit);
  }

  function updateActiveAttacks(dt) {
    for (const attack of run.activeAttacks) {
      attack.t += dt;
      if (attack.done) {
        if (attack.t >= attack.life) attack.hit = true;
        continue;
      }
      const remaining = attack.maxDistance - Math.abs(attack.fromY - attack.y);
      if (remaining <= 0) {
        attack.done = true;
        if (attack.mainLane && !attack.whiffed) {
          sfx.whiff();
          attack.whiffed = true;
        }
        if (attack.t >= attack.life) attack.hit = true;
        continue;
      }
      attack.prevY = attack.y;
      attack.y -= Math.min(attack.speed * dt, remaining);
      const traveled = Math.abs(attack.fromY - attack.y);
      const target = engine.findFirstReachTarget(run.building, {
        lane: attack.lane,
        fromY: attack.prevY,
        toY: attack.y,
      });

      if (target && traveled <= attack.maxDistance) {
        applyWeaponHit(target, { lane: attack.lane, mainLane: attack.mainLane });
        attack.done = true;
        attack.didHit = true;
      } else if (traveled >= attack.maxDistance || attack.t >= attack.life) {
        attack.done = true;
      }
      if (attack.done && !attack.didHit && attack.mainLane && !attack.whiffed) {
        sfx.whiff();
        attack.whiffed = true;
      }
      if (attack.done && attack.t >= attack.life) attack.hit = true;
    }
    run.activeAttacks = run.activeAttacks.filter((attack) => !attack.hit);
  }

  function releasePendingAttack() {
    const pending = run.pendingAttack;
    if (!pending || pending.released) return false;
    pending.released = true;
    const p = run.player;
    if (!p) return false;

    if (pending.weaponId === "bow") {
      sfx.weaponAttack("bow");
      fx.weaponRelease("bow", laneVisualX(p), p.y, { grounded: p.y >= engine.GROUND_Y - 2 });
      spawnBowProjectile();
      if (pending.twin) spawnBowProjectile({ delay: BOW_TWIN_DELAY, twin: true });
      return true;
    }

    anim.flip = -anim.flip;
    anim.swings.push({ t: 0, flip: anim.flip, weaponId: pending.weaponId });
    if (anim.swings.length > 4) anim.swings.shift();
    sfx.weaponAttack(pending.weaponId);
    fx.weaponRelease(pending.weaponId, laneVisualX(p), p.y, { grounded: p.y >= engine.GROUND_Y - 2 });
    const attackLane = pending.weaponId === "katana" && run.mugetsuT > 0
      ? mugetsuTargetLane()
      : p.lane;
    spawnMeleeAttackTrace(attackLane, { mainLane: true });
    return true;
  }

  function updatePendingAttack() {
    const pending = run.pendingAttack;
    if (!pending) return;
    const visibleFrame = attackFrameAt(anim.attackT, anim.attackDur);
    if (!pending.released && visibleFrame >= pending.impactFrame) releasePendingAttack();
    if (pending.released && anim.attackT >= anim.attackDur) run.pendingAttack = null;
  }

  function performSlash() {
    const p = run.player;
    if (p.attackCooldown > 0) return false;
    const duration = attackCooldown();
    p.attackCooldown = duration;
    p.attackTimer = duration;
    run.attackCount += 1;
    run.mpPause = MP_PAUSE; // 칼을 쓰면 MP 회복이 멈춘다
    anim.attackT = 0;
    anim.attackDur = duration;
    run.pendingAttack = {
      weaponId: run.weapon.id,
      impactFrame: attackMotion(run.weapon.id).impactFrame,
      releaseAt: attackImpactTime(run.weapon.id, duration),
      released: false,
      twin: run.weapon.id === "bow"
        && upgradeStack("bw_twin") > 0
        && engine.randInt(100) < BOW_TWIN_CHANCE,
    };
    return true;
  }

  // === per-weapon skills (MP 소모, 사냥으로는 충전되지 않음) ===
  function performSkill() {
    const w = run.weapon;
    const b = run.building;
    if (!b) return;
    if (run.mp < w.mpCost) {
      fx.popup("MP 부족", run.player.x, run.player.y - 100, { color: "#8fb0d8", size: 13, life: 0.6 });
      sfx.uiDeny();
      return;
    }
    run.mp -= w.mpCost;
    run.skillCount += 1;
    run.mpPause = MP_PAUSE;
    run.player.specialTimer = 0.75;
    const cx = engine.BUILDING_X + engine.BUILDING_W / 2;

    if (w.id === "katana") {
      // 무월: 사거리 안에서 가장 약한 부위를 추적하고 공격력을 높인다.
      run.mugetsuT = upgradeStack("kt_linger") > 0 ? MUGETSU_LINGER_DUR : MUGETSU_DUR;
      fx.flash("#c9b8ff", 0.14, 0.3);
      fx.popup("무월", run.player.x, run.player.y - 120, { color: "#c9b8ff", size: 20, life: 1.0 });
      sfx.waza();
      return;
    }

    if (w.id === "spear") {
      // 용승격: 하단 1층 파괴 + 무리를 밀어 올린다
      collapseBottomRows(b, 1, cx);
      const pushSeconds = upgradeStack("sp_drive") > 0
        ? SPEAR_DRIVE_PUSH_SECONDS
        : SPEAR_PUSH_SECONDS;
      const speedPerFrame = Math.abs(b.velocityQ6 / 0x40) || 0.85;
      engine.pushBackBuilding(b, speedPerFrame * engine.ORIGINAL_FRAME_RATE * pushSeconds);
      if (upgradeStack("sp_drive") > 0) run.spearRageT = SPEAR_RAGE_DUR;
      fx.popup("밀어냈다!", cx, engine.GROUND_Y - 220, { color: "#9fdcff", size: 16, life: 0.9 });
      fx.shake(6, 0.3);
      fx.stop(4);
      sfx.waza();
      return;
    }

    if (w.id === "bow") {
      // 화살비: 최상단 몸통에 최대 체력 비례 피해를 준다.
      const targets = b.floors.slice(0, upgradeStack("bw_storm") > 0 ? 4 : 2);
      const collapsedEvents = [];
      for (const floor of targets) {
        const idx = b.floors.indexOf(floor);
        if (idx === -1) continue;
        const fy = engine.floorWorldY(b, floor);
        let brokenLane = -1;
        for (let lane = 0; lane < engine.LANES; lane += 1) {
          const cell = floor.cells[lane];
          if (cell.hp <= 0) continue;
          const laneX = engine.BUILDING_X + lane * engine.LANE_W + engine.LANE_W / 2;
          fx.bolt(laneX, fy + 320, fy + 60, lane * 0.04);
          const damage = Math.max(
            ARROW_RAIN_MIN_DAMAGE,
            Math.ceil(engine.cellMaxHp(cell) * ARROW_RAIN_MAX_HP_RATIO),
          );
          applyAttackDamage(cell, damage);
          cell.flash = 0.2;
          if (cell.hp <= 0 && brokenLane < 0) brokenLane = lane;
        }
        if (brokenLane >= 0) {
          engine.collapseFloor(b, b.floors.indexOf(floor));
          collapsedEvents.push({ materialType: floor.cells[brokenLane].type,
            x: engine.BUILDING_X + (brokenLane + 0.5) * engine.LANE_W, y: fy + 40 });
        }
      }
      const gained = awardSkillRows(collapsedEvents.length);
      if (collapsedEvents.length > 0) {
        const baseGain = Math.floor(gained / collapsedEvents.length);
        let remainder = gained - baseGain * collapsedEvents.length;
        for (const event of collapsedEvents) {
          const eventGain = baseGain + (remainder > 0 ? 1 : 0);
          remainder = Math.max(0, remainder - 1);
          collapseFxAt(event.materialType, event.x, event.y, eventGain);
        }
      }
      fx.shake(4, 0.25);
      sfx.waza();
      return;
    }

    // 장검 일문자베기(3층) / 도끼 천지가르기(4층)
    const rows = w.id === "axe" ? (upgradeStack("ax_quake") > 0 ? 5 : 4) : 3;
    collapseBottomRows(b, rows, cx);
    fx.stop(6);
    sfx.waza();
  }

  // All row-removing skills share the same score/combo contract.
  function collapseBottomRows(b, rows, cx) {
    const count = Math.min(rows, b.floors.length);
    const resistance = b.monsterDefinition?.behavior.rowSkillDamageRatios?.[run.weapon.id];
    if (resistance) {
      let removed = 0;
      for (const floor of b.floors.slice(-count)) {
        const y = engine.floorWorldY(b, floor);
        let brokenLane = -1;
        for (let lane = 0; lane < floor.cells.length; lane += 1) {
          const cell = floor.cells[lane];
          if (cell.hp <= 0 || cell.active === false) continue;
          applyAttackDamage(cell, Math.ceil(engine.cellMaxHp(cell) * resistance));
          cell.flash = 0.2;
          cell.hitWeapon = run.weapon.id;
          if (cell.hp <= 0 && brokenLane < 0) brokenLane = lane;
        }
        fx.band(y + 50, 0);
        if (brokenLane >= 0) {
          collapseFloorByRef(b, floor, brokenLane, y);
          removed += 1;
        }
      }
      fx.popup(`보스 몸통에 ${Math.round(resistance * 100)}% 피해`, cx, engine.GROUND_Y - 240, { color: "#ffe2a3", size: 15 });
      fx.shake(6, 0.25);
      return removed;
    }
    const collapsingFloors = b.floors.slice(b.floors.length - count);
    const bandYs = collapsingFloors
      .map((f) => engine.floorWorldY(b, f) + engine.ORIGINAL_ROW_HEIGHT / 2);
    // Row-removing skills directly destroy each active cell. Credit its
    // remaining HP before the engine removes the row.
    for (const floor of collapsingFloors) {
      for (const cell of floor.cells) applyAttackDamage(cell, cell.hp);
    }
    const removed = engine.performWaza(b, rows);
    const gained = awardSkillRows(removed);

    bandYs.forEach((y, i) => {
      fx.band(y, i * 0.05);
      fx.debris(cx, y, 9, DEBRIS_PALETTES[1]);
    });
    fx.dust(cx, bandYs[bandYs.length - 1] || run.player.y - 80, 10);
    fx.popup(`+${gained}`, cx, (bandYs[0] || run.player.y - 140) - 30, { color: "#fff2c8", size: 20 });
    fx.flash("#ffe9b0", 0.14, 0.22);
    fx.shake(9, 0.4);
    return removed;
  }

  function afterBuildingCleared() {
    run.bossPattern = null;
    sfx.cleared();

    run.buildingIndex += 1;
    run.building = null;
    if (run.buildingIndex >= run.buildingsInStage) {
      resolveStageReward();
    } else {
      finishEncounter(false);
    }
  }

  // Stage completion includes monsters that passed the player. Shards are
  // awarded exactly once per stage; forging is earned only through damage XP.
  function resolveStageReward() {
    if (run.stageRewarded) return;
    run.stageRewarded = true;
    const reward = run.plan?.reward || "forge";
    const cx = engine.BUILDING_X + engine.BUILDING_W / 2;
    const shards = run.plan?.clearShards ?? 30;
    addShards(shards);
    fx.crystals(cx, engine.GROUND_Y - 150, 7);
    fx.popup(`스테이지 클리어 · 파편 +${shards}`, cx, engine.GROUND_Y - 190, { color: "#ffd98a", size: 18, life: 1.1 });
    if (reward === "treasure") {
      healPlayer(10);
    }
    if (reward === "forgeEpic") {
      healPlayer(20);
      refillFreeRerolls();
    }
    finishEncounter(true, reward === "forgeEpic" ? "epic" : reward === "forgeRare" ? "rare" : null);
  }

  function finishEncounter(advanceStage, minRank = null) {
    // Projectiles from the completed monster must not hit the next one.
    run.activeAttacks = [];
    run.projectiles = [];
    run.pendingAttack = null;
    forgeState.advanceStageAfter = advanceStage;
    forgeState.resumeCombat = false;
    if (run.pendingUpgrades > 0) goToForge(minRank);
    else resumeAfterForge();
  }

  function resumeAfterForge() {
    if (forgeState.resumeCombat) changeScene("run");
    else if (forgeState.advanceStageAfter) advanceToNextStage();
    else {
      run.respawnTimer = 1.5;
      if (scene !== "run") changeScene("run");
    }
  }

  function healPlayer(amount) {
    if (!run.player || run.hp <= 0) return;
    const before = run.hp;
    run.hp = Math.min(run.hpMax, run.hp + amount);
    const gained = Math.round(run.hp - before);
    if (gained > 0) {
      fx.popup(`체력 +${gained}`, run.player.x, run.player.y - 120, { color: "#7de3b0", size: 14 });
    }
  }

  function goToForge(minRank = null) {
    input.reset?.();
    forgeState.minRank = minRank;
    forgeState.cards = rollForgeCards(minRank);
    forgeState.selected = 0;
    forgeState.enterT = 0;
    forgeState.rerollDenied = 0;
    forgeState.rerollDeniedReason = "";
    forgeState.rerollOfferQueue = [];
    changeScene("forge");
  }

  function advanceToNextStage() {
    enterStage(run.stageIndex + 1); // endless: the player eventually dies or exits and settles
    run.respawnTimer = 0.5;
    const openingStacks = upgradeStack("opening");
    if (openingStacks > 0) gainMp(OPENING_MP_PER_STAGE * openingStacks);
    if (scene !== "run") changeScene("run");
  }

  function finishRun(reason = run.deathCause === "debris" ? "death_debris" : "death_contact") {
    run.bossPattern = null;
    results.section = "main";
    results.index = 0;
    results.scrollOffset = 0;
    results.enterT = 0;
    results.registered = false;
    results.saveError = null;
    results.committed = false;
    results.newlyUnlocked = [];
    results.newlyUnlockedIds = [];
    results.endReason = reason;
    results.settlement = null;
    results.bankBefore = profile.wallet?.shards || 0;
    results.profileSaved = null;
    quitState.active = false;
    commitRunResult();
    changeScene("results");
  }

  // === Screens' local state ===
  const titleState = { index: 0 };
  const weaponSelect = { index: 0, enterT: 0, deniedT: 0 };
  const preparationState = {
    section: "main",
    index: 0,
    enterT: 0,
    notice: startupNotice,
    saveError: profileAvailable ? "" : startupNotice,
  };
  const forgeState = {
    advanceStageAfter: true,
    resumeCombat: false,
    cards: [],
    selected: 0,
    enterT: 0,
    rerollDenied: 0,
    rerollDeniedReason: "",
    rerollOfferQueue: [],
  };
  const results = {
    section: "main",
    index: 0,
    scrollOffset: 0,
    enterT: 0,
    registered: false,
    saveError: null,
    committed: false,
    newlyUnlocked: [],
    newlyUnlockedIds: [],
    endReason: "death_contact",
    settlement: null,
    bankBefore: 0,
    profileSaved: null,
  };
  const quitState = { active: false, origin: null, returnToPause: false, enterT: 0, index: 0 };
  const rankingState = { entries: [], highlight: -1, enterT: 0, returnScene: "title", scrollOffset: 0, revealHighlight: false };

  function applyForgeCard(card) {
    if (card.unique && upgradeStack(card.id) > 0) return;
    if (card.maxStacks && upgradeStack(card.id) >= card.maxStacks) return;
    run.upgrades[card.id] = card.unique ? 1 : (run.upgrades[card.id] || 0) + 1;
    if (card.id === "core") {
      run.guard = Math.min(guardMax(), run.guard + 30);
    }
  }

  function openRanking(highlight = -1) {
    rankingState.returnScene = scene === "results" ? "results" : "title";
    rankingState.entries = loadRankings();
    rankingState.highlight = highlight;
    rankingState.enterT = 0;
    rankingState.scrollOffset = 0;
    rankingState.revealHighlight = highlight >= 0;
    changeScene("ranking");
  }

  function closeRanking() {
    sfx.uiMove();
    changeScene(rankingState.returnScene);
  }

  function registerScore() {
    if (results.registered) return;
    nameEntry.open((name) => {
      if (name === null) {
        sfx.uiMove();
        return;
      }
      const finalName = name || "무명";
      const saved = saveRankingEntry({
        name: finalName,
        score: run.score,
        stage: run.stageIndex + 1,
        weapon: run.weapon.name,
        weaponId: run.weapon.id,
        rulesVersion: results.settlement?.rulesVersion || economyConfig.version,
        growthLevels: { ...(results.settlement?.growthLevels || run.growthLevels) },
        endReason: results.endReason,
        ts: Date.now(),
      });
      if (!saved.saved) {
        results.saveError = "순위 기록을 저장하지 못했습니다.";
        sfx.uiDeny();
        return;
      }
      results.saveError = null;
      results.registered = true;
      sfx.uiConfirm();
      openRanking(saved.index);
    });
  }

  function refreshPreparationProfile() {
    const refreshed = profileService.get();
    if (refreshed.ok) {
      profile = refreshed.profile;
      profileAvailable = profileWritable;
      const selected = data.weapons.find((weapon) => weapon.id === profile.preparation.weaponId);
      if (selected) {
        run.weapon = selected;
        weaponSelect.index = Math.max(0, data.weapons.findIndex((weapon) => weapon.id === selected.id));
      }
      return true;
    }
    acceptProfileResult(refreshed, "모험 준비를 불러오지 못했습니다");
    return false;
  }

  function openPreparation(section = "main") {
    requestGameplayAssets();
    refreshPreparationProfile();
    preparationState.section = section;
    preparationState.index = 0;
    preparationState.enterT = 0;
    changeScene("preparation");
  }

  function preparationSuccess(result, message = "") {
    if (!acceptProfileResult(result)) return false;
    preparationState.notice = message;
    preparationState.saveError = "";
    sfx.uiConfirm();
    return true;
  }

  function selectPreparedWeapon() {
    if (!profileAvailable) {
      preparationState.saveError = startupNotice || "이 탭에서는 성장 기록을 변경할 수 없습니다";
      sfx.uiDeny();
      return false;
    }
    const weapon = weaponViews()[weaponSelect.index];
    if (gameplayAssetsFailed()) {
      requestGameplayAssets();
      weaponSelect.deniedT = 0.4;
      sfx.uiConfirm();
      return false;
    }
    if (!gameplayAssetsReady()) {
      requestGameplayAssets();
      weaponSelect.deniedT = 0.4;
      sfx.uiDeny();
      return false;
    }
    if (!weapon || weapon.locked) {
      weaponSelect.deniedT = 0.4;
      sfx.uiDeny();
      return false;
    }
    const selected = profileService.setWeapon(weapon.id);
    if (!preparationSuccess(selected)) {
      sfx.uiDeny();
      return false;
    }
    run.weapon = weapon;
    openPreparation("main");
    return true;
  }

  function changeCarry(delta) {
    if (!profileAvailable) {
      sfx.uiDeny();
      return false;
    }
    const limit = Math.min(economyConfig.reroll.carryLimit, profile.wallet.rerollTickets);
    const next = Math.max(0, Math.min(limit, profile.preparation.carryTickets + delta));
    if (next === profile.preparation.carryTickets) {
      sfx.uiDeny();
      return false;
    }
    const result = profileService.setCarry(next);
    if (!preparationSuccess(result)) {
      sfx.uiDeny();
      return false;
    }
    return true;
  }

  function buyPreparationGrowth(id) {
    if (!profileAvailable) {
      sfx.uiDeny();
      return false;
    }
    const result = profileService.buyGrowth(id);
    const item = growthDefinition(id);
    if (!result.ok) {
      acceptProfileResult(result, "성장을 저장하지 못했습니다");
      preparationState.notice = "";
      sfx.uiDeny();
      return false;
    }
    return preparationSuccess(result, `${item?.label || "성장"} ${result.purchasedLevel}단계를 각인했습니다`);
  }

  function handlePreparationAction(arg) {
    if (arg === "weapon") {
      weaponSelect.index = Math.max(0, data.weapons.findIndex((weapon) => weapon.id === run.weapon.id));
      sfx.uiConfirm();
      changeScene("weaponSelect");
      return;
    }
    if (arg === "growth") {
      preparationState.section = arg;
      preparationState.index = 0;
      preparationState.notice = "";
      preparationState.saveError = "";
      sfx.uiConfirm();
      return;
    }
    if (arg === "home") {
      preparationState.section = "main";
      preparationState.index = 0;
      preparationState.notice = "";
      preparationState.saveError = "";
      sfx.uiMove();
      return;
    }
    if (arg === "carryLess") return void changeCarry(-1);
    if (arg === "carryMore") return void changeCarry(1);
    if (arg === "buyHp") return void buyPreparationGrowth("maxHp");
    if (arg === "buyGuard") return void buyPreparationGrowth("maxGuard");
    if (arg === "tickets") {
      if (!profileAvailable) {
        sfx.uiDeny();
        return;
      }
      const result = profileService.buyTicket(1);
      if (!result.ok) {
        acceptProfileResult(result, "새로고침 구매를 저장하지 못했습니다");
        preparationState.notice = "";
        sfx.uiDeny();
        return;
      }
      preparationSuccess(result);
      return;
    }
    if (arg === "start") {
      if (!gameplayAssetsReady()) {
        requestGameplayAssets();
        sfx.uiDeny();
        return;
      }
      if (beginRun()) sfx.uiConfirm();
      else sfx.uiDeny();
      return;
    }
    if (arg === "back") {
      sfx.uiMove();
      changeScene("title");
    }
  }

  function openQuitConfirmation(origin = scene) {
    if (!run.player || !["run", "forge"].includes(origin)) return;
    quitState.active = true;
    quitState.origin = origin;
    quitState.returnToPause = paused;
    quitState.enterT = 0;
    quitState.index = 0;
    if (origin === "run") setPaused(true);
    sfx.uiMove();
  }

  function cancelQuitConfirmation() {
    const origin = quitState.origin;
    quitState.active = false;
    quitState.origin = null;
    if (origin === "run") setPaused(quitState.returnToPause);
    sfx.uiMove();
  }

  function confirmVoluntaryQuit() {
    if (!quitState.active) return;
    setPaused(false);
    run.deathCause = "quit";
    sfx.uiConfirm();
    finishRun("quit");
  }

  // === Scene machine with fade transitions ===
  let scene = "title";
  const fade = { t: 0.35, dur: 0.7, pending: null }; // boots mid-fade → title fades in

  function changeScene(next) {
    fade.pending = next;
    fade.t = 0;
  }

  function applyScene(next) {
    if (next !== "run" && paused) setPaused(false);
    if (next !== "run" && !(next === "forge" && forgeState.resumeCombat)) {
      run.bossPattern = null;
      fx.clear();
      fx.setDangerActive?.(false);
    }
    scene = next;
    if (typeof document !== "undefined") {
      document.body.dataset.gameScene = next;
    }
    if (next === "weaponSelect") {
      weaponSelect.enterT = 0;
      weaponSelect.deniedT = 0;
      requestGameplayAssets();
    }
    if (next === "preparation") {
      preparationState.enterT = 0;
      requestGameplayAssets();
    }
    audio.setMusicMode(next === "run" ? (run.plan?.typeId === "boss" ? "boss" : "battle") : "menu");
  }

  function fadeAlpha() {
    if (fade.t >= fade.dur) return 0;
    const half = fade.dur / 2;
    if (fade.t < half) return fade.pending !== null ? fade.t / half : 1 - fade.t / half;
    return 1 - (fade.t - half) / half;
  }

  function fadeBusy() {
    return fade.t < fade.dur;
  }

  function beginRun({ managed = true } = {}) {
    let activeEconomy = null;
    if (managed) {
      if (!profileWritable || !profileAvailable) {
        preparationState.saveError = startupNotice || "다른 탭을 닫고 다시 시도해주세요";
        return false;
      }
      const latest = profileService.get();
      if (latest.ok) profile = latest.profile;
      if (profile.activeRun) {
        const recoveryUnlockIds = unlockIdsForRunSummary(profile, profile.activeRun.summary);
        let recovered = profileService.recoverOwnedOrStaleRun({ unlockedIds: recoveryUnlockIds });
        if (!recovered.ok && recovered.kind === "foreign-active" && profileExclusive) {
          recovered = profileService.settleRun({
            runId: profile.activeRun.id,
            reason: "recovery",
            unlockedIds: recoveryUnlockIds,
            allowForeign: true,
          });
        }
        if (!recovered.ok) {
          preparationState.saveError = recovered.error?.message || "이전 모험 정산을 다시 확인해주세요";
          return false;
        }
        profile = recovered.profile;
        if (recovered.receipt) {
          preparationState.notice = `이전 모험의 파편 ${recovered.receipt.shardsEarned}개를 정산했습니다`;
        }
      }
      const started = profileService.startRun({ weaponId: run.weapon.id });
      if (!started.ok) {
        preparationState.saveError = started.error?.message || "모험 준비를 저장하지 못했습니다";
        preparationState.notice = "";
        profileAvailable = false;
        return false;
      }
      profile = started.profile;
      profileAvailable = true;
      preparationState.saveError = "";
      activeEconomy = started.run;
    } else {
      activeEconomy = {
        id: null,
        freeRerollsRemaining: economyConfig.reroll.freePerRun,
        purchasedTicketsReserved: 0,
        purchasedTicketsRemaining: 0,
        growthLevels: { maxHp: 0, maxGuard: 0 },
      };
    }
    engine.seedRng(Date.now() >>> 0);
    run.cycleBagCycle = -1;
    run.cycleBag = [];
    enterStage(0);
    run.growthLevels = { ...activeEconomy.growthLevels };
    run.hpMax = growthValue("maxHp", run.growthLevels);
    run.hp = run.hpMax;
    run.guard = growthValue("maxGuard", run.growthLevels);
    run.mp = 0;
    run.mpPause = 0;
    run.mugetsuT = 0;
    run.spearRageT = 0;
    run.score = 0;
    run.combo = 0;
    run.bestCombo = 0;
    run.comboIdleTimer = 0;
    run.shards = 0;
    run.level = 1;
    run.experience = 0;
    run.totalExperience = 0;
    run.pendingUpgrades = 0;
    forgeState.resumeCombat = false;
    forgeState.advanceStageAfter = true;
    run.freeRerolls = activeEconomy.freeRerollsRemaining;
    run.purchasedRerolls = activeEconomy.purchasedTicketsRemaining;
    run.purchasedReserved = activeEconomy.purchasedTicketsReserved;
    run.activeRunId = activeEconomy.id;
    run.economyManaged = managed;
    run.economySaveError = null;
    run.heartbeatT = 0;
    updateRerollTotal();
    run.floorsCollapsed = 0;
    run.attackCount = 0;
    run.skillCount = 0;
    run.cleared = false;
    run.upgrades = {};
    run.player = engine.createPlayer();
    run.player.attackCooldown = 0;
    run.building = null;
    run.camera = { y: 0 };
    run.activeAttacks = [];
    run.projectiles = [];
    run.pendingAttack = null;
    run.bossPattern = null;
    run.deathCause = "contact";
    run.elapsed = 0;
    run.lastUpgrade = null;
    run.respawnTimer = 0;
    run.lastCellHit = null;
    run.sameCellStreak = 0;
    fx.clear();
    anim.attackT = 9;
    anim.idleT = 0;
    anim.attackDur = run.weapon.cooldown || 0.28;
    anim.flip = 1;
    anim.swings = [];
    anim.laneT = 9;
    anim.comboPopT = 9;
    anim.hpFlashT = 9;
    anim.deflectT = 9;
    anim.guardT = 0;
    anim.hintT = 0;
    anim.weaponId = run.weapon.id;
    anim.mugetsu = false;
    changeScene("run");
    return true;
  }

  // === Mouse support (menu buttons only) ===
  function click(x, y) {
    // Pausing also freezes the transition clock. Its visible resume control
    // must remain usable even if the run was paused during a scene fade.
    if (fadeBusy() && !paused) return;
    const region = ui.hitAt(x, y);
    if (!region) return;
    handleRegion(region.id);
  }

  function hoverHit(x, y) {
    return (!fadeBusy() || paused) && ui.hitAt(x, y) !== null;
  }

  function setPointer(x, y, down = false) {
    ui.setPointer?.(x, y, down);
  }

  function activeScroll() {
    if (quitState.active || (fadeBusy() && !paused)) return null;
    const metrics = ui.metrics();
    if (paused) return { state: pauseMenu, area: metrics.pause?.scroll };
    if (scene === "results") return { state: results, area: metrics.results?.scroll };
    if (scene === "ranking") return { state: rankingState, area: metrics.ranking?.scroll };
    return null;
  }

  function canScrollAt(x, y) {
    const area = activeScroll()?.area;
    return Boolean(area?.maxOffset > 0 && x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h);
  }

  function scrollBy(delta) {
    const current = activeScroll();
    if (!current?.area || current.area.maxOffset <= 0) return false;
    const offset = Math.max(0, Math.min(current.area.maxOffset, current.state.scrollOffset));
    current.state.scrollOffset = Math.max(0, Math.min(current.area.maxOffset, offset + delta));
    return true;
  }

  function scrollAt(x, y, delta) {
    return canScrollAt(x, y) && scrollBy(delta);
  }

  function setPauseSection(section) {
    pauseMenu.section = section;
    pauseMenu.index = 0;
    pauseMenu.scrollOffset = 0;
    sfx.uiMove();
  }

  function handleResultsAction(arg, weaponId) {
    if (arg === "details" || arg === "back") {
      results.section = arg === "details" ? "details" : "main";
      results.index = 0;
      results.scrollOffset = 0;
      sfx.uiMove();
      return;
    }
    if (arg === "retrySave") {
      commitRunResult();
      if (results.committed) { results.index = 0; sfx.uiConfirm(); }
      else sfx.uiDeny();
      return;
    }
    if (!["retry", "newChallenge", "newWeapon", "primary"].includes(arg)) return;
    if (!results.committed) { sfx.uiDeny(); return; }
    if (arg === "retry") {
      if (beginRun()) sfx.uiConfirm();
      else sfx.uiDeny();
    } else if (arg === "newChallenge") {
      sfx.uiMove();
      openPreparation("main");
    } else if (arg === "newWeapon") {
      const weapon = weaponId
        ? data.weapons.find((item) => item.id === weaponId && results.newlyUnlockedIds.includes(item.id) && profile.unlocked.includes(item.id))
        : newlyUnlockedWeapon();
      if (!weapon || !profileAvailable) { sfx.uiDeny(); return; }
      const selected = profileService.setWeapon(weapon.id);
      if (!acceptProfileResult(selected, "새 무기를 준비하지 못했습니다")) {
        results.saveError = preparationState.saveError;
        sfx.uiDeny();
        return;
      }
      run.weapon = weapon;
      results.saveError = null;
      preparationState.notice = "";
      preparationState.saveError = "";
      sfx.uiConfirm();
      openPreparation("main");
    } else if (results.registered) openRanking(-1);
    else registerScore();
  }

  function handleRegion(id) {
    if (quitState.active && !id.startsWith("quit:")) return;
    if (paused && !quitState.active && !id.startsWith("pause:") && !["system:motion", "system:mute", "system:pause"].includes(id)) return;
    if (id === "pause:block" || id === "ranking:list") return;
    if (id === "pause:back") {
      setPauseSection(pauseMenu.section === "controls" ? "settings" : "main");
      return;
    }
    if (["pause:upgrades", "pause:settings", "pause:controls"].includes(id)) {
      setPauseSection(id.split(":")[1]);
      return;
    }
    if (id === "system:motion") {
      reducedMotion = !reducedMotion;
      fx.setIntensity?.(reducedMotion ? "reduced" : "normal");
      try { localStorage.setItem(EFFECTS_KEY, reducedMotion ? "reduced" : "normal"); } catch { /* optional */ }
      return;
    }
    if (id === "system:pause" || id === "pause:resume") {
      if (quitState.active) {
        cancelQuitConfirmation();
        return;
      }
      setPaused(!paused);
      return;
    }
    if (id === "pause:quit") {
      openQuitConfirmation(scene);
      return;
    }
    if (id === "quit:continue") {
      cancelQuitConfirmation();
      return;
    }
    if (id === "quit:confirm") {
      confirmVoluntaryQuit();
      return;
    }
    if (id === "system:mute") {
      audio.toggleMuted();
      return;
    }
    const [kind, arg, detail] = id.split(":");
    if (scene === "title" && kind === "title") {
      const i = Number(arg);
      titleState.index = i;
      sfx.uiConfirm();
      if (i === 0) openPreparation("main");
      else openRanking(-1);
    } else if (scene === "preparation" && kind === "preparation") {
      handlePreparationAction(arg);
    } else if (scene === "weaponSelect" && kind === "weapon" && arg === "preparation") {
      openPreparation("main");
    } else if (scene === "weaponSelect" && kind === "weapon" && arg === "confirm") {
      selectPreparedWeapon();
    } else if (scene === "weaponSelect" && kind === "weapon") {
      const i = Number(arg);
      const weapon = weaponViews()[i];
      if (!weapon) return;
      if (weaponSelect.index !== i) {
        weaponSelect.index = i;
        sfx.uiMove();
      }
    } else if (scene === "forge") {
      if (kind === "forge" && arg === "quit") {
        openQuitConfirmation("forge");
      } else if (kind === "forge" && arg === "reroll") {
        tryReroll();
      } else if (kind === "forge" && arg === "confirm") {
        confirmForge("button");
      } else if (kind === "forge") {
        const i = Number(arg);
        if (!forgeState.cards[i]) return;
        if (forgeState.selected !== i) {
          forgeState.selected = i;
          sfx.uiMove();
        }
      }
    } else if (scene === "results" && kind === "results") {
      handleResultsAction(arg, detail);
    } else if (scene === "ranking" && kind === "ranking" && arg === "back") {
      closeRanking();
    }
  }

  function newlyUnlockedWeapon() {
    const id = results.newlyUnlockedIds.find((weaponId) => profile.unlocked.includes(weaponId));
    return data.weapons.find((weapon) => weapon.id === id) || null;
  }

  function tryReroll() {
    if (run.rerollTickets <= 0) {
      forgeState.rerollDenied = 0.5;
      forgeState.rerollDeniedReason = "새로고침 없음";
      sfx.uiDeny();
      return false;
    }
    const previous = rerollOfferSetSignature(forgeState.cards);
    let candidate = forgeState.cards;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const rolled = forgeState.rerollOfferQueue.length
        ? forgeState.rerollOfferQueue.shift()
        : rollForgeCards(forgeState.minRank);
      if (rerollOfferSetSignature(rolled) !== previous) {
        candidate = rolled;
        break;
      }
    }
    if (candidate === forgeState.cards) {
      forgeState.rerollDenied = 0.5;
      forgeState.rerollDeniedReason = "다른 조합 없음";
      sfx.uiDeny();
      return false;
    }
    if (run.economyManaged && run.activeRunId) {
      const saved = profileService.useReroll({
        runId: run.activeRunId,
        cards: candidate.map((card) => card.id),
        minRank: forgeState.minRank || null,
      });
      if (!saved.ok) {
        run.economySaveError = saved.error?.message || "새로고침 사용을 저장하지 못했습니다";
        forgeState.rerollDenied = 0.5;
        forgeState.rerollDeniedReason = "저장 실패";
        sfx.uiDeny();
        return false;
      }
      profile = saved.profile;
      run.freeRerolls = saved.freeRemaining;
      run.purchasedRerolls = saved.purchasedRemaining;
      run.economySaveError = null;
    } else if (run.freeRerolls > 0) {
      run.freeRerolls -= 1;
    } else if (run.purchasedRerolls > 0) {
      run.purchasedRerolls -= 1;
    }
    updateRerollTotal();
    forgeState.cards = candidate;
    forgeState.selected = 0;
    forgeState.enterT = 0;
    forgeState.rerollDenied = 0;
    forgeState.rerollDeniedReason = "";
    sfx.uiConfirm();
    return true;
  }

  function confirmForge(source = "keyboard") {
    // Touch gameplay's attack action must never act as a menu confirmation.
    // On touch layouts only the explicit bottom button may spend an upgrade.
    if (layout?.touchVisible && source !== "button") return;
    if (scene !== "forge" || fadeBusy() || run.pendingUpgrades <= 0) return;
    const card = forgeState.cards[forgeState.selected];
    if (!card) return;
    applyForgeCard(card);
    run.pendingUpgrades -= 1;
    run.lastUpgrade = card ? { name: card.name, until: run.elapsed + 4 } : null;
    sfx.forgePick();
    if (run.pendingUpgrades > 0) goToForge(forgeState.minRank);
    else resumeAfterForge();
  }

  // === Update ===
  function update(dt) {
    if (input.justPressed("mute")) audio.toggleMuted();
    if (quitState.active) {
      quitState.enterT += dt;
      if (input.justPressed("left") || input.justPressed("jump")) {
        quitState.index = 0;
        sfx.uiMove();
      }
      if (input.justPressed("right") || input.justPressed("guard")) {
        quitState.index = 1;
        sfx.uiMove();
      }
      if (input.justPressed("slash")) {
        if (quitState.index === 0) cancelQuitConfirmation();
        else confirmVoluntaryQuit();
      }
      else if (input.justPressed("skill") || input.justPressed("pause")) cancelQuitConfirmation();
      return;
    }
    if (paused) return updatePauseMenu();
    if (scene === "run" && input.justPressed("pause")) { setPaused(true); return; }
    clock += dt;

    if (fadeBusy()) {
      fade.t += dt;
      if (fade.pending !== null && fade.t >= fade.dur / 2) {
        applyScene(fade.pending);
        fade.pending = null;
      }
      if (!(forgeState.resumeCombat && (scene === "forge" || fade.pending === "forge" || scene === "run"))) fx.update(dt);
      return;
    }

    if (scene === "run" && fx.consumeStop()) return; // hit-stop freeze frame

    if (scene !== "forge" || !forgeState.resumeCombat) fx.update(dt);
    if (scene === "title") return updateTitle();
    if (scene === "preparation") return updatePreparation(dt);
    if (scene === "weaponSelect") return updateWeaponSelect(dt);
    if (scene === "run") return updateRun(dt);
    if (scene === "forge") return updateForge(dt);
    if (scene === "results") return updateResults(dt);
    if (scene === "ranking") return updateRanking(dt);
  }

  function moveMenuFocus(state, order) {
    const direction = input.justPressed("left") || input.justPressed("jump") ? -1
      : input.justPressed("right") || input.justPressed("guard") ? 1 : 0;
    if (!direction || !order.length) return;
    state.index = (state.index + direction + order.length) % order.length;
    sfx.uiMove();
  }

  function updatePauseMenu() {
    const pausePressed = input.justPressed("pause");
    const backPressed = input.justPressed("skill");
    if (pausePressed || backPressed) {
      if (pauseMenu.section !== "main") handleRegion("pause:back");
      else if (pausePressed) setPaused(false);
      else openQuitConfirmation("run");
      return;
    }
    if (pauseMenu.section === "main" && input.justPressed("aux")) { openQuitConfirmation("run"); return; }
    const metrics = ui.metrics().pause;
    const order = metrics?.focusOrder || ["pause:resume", "pause:upgrades", "pause:settings", "pause:quit"];
    if (["upgrades", "controls"].includes(pauseMenu.section)) {
      const amount = metrics?.scroll?.rowHeight || 56 * (layout?.uiScale || 1);
      if (input.justPressed("jump")) scrollBy(-amount);
      if (input.justPressed("guard")) scrollBy(amount);
    } else moveMenuFocus(pauseMenu, order);
    if (input.justPressed("slash")) handleRegion(order[pauseMenu.index] || order[0]);
  }

  function updateTitle() {
    const move = (dir) => {
      const next = Math.max(0, Math.min(1, titleState.index + dir));
      if (next !== titleState.index) {
        titleState.index = next;
        sfx.uiMove();
      }
    };
    if (input.justPressed("jump")) move(-1);
    if (input.justPressed("guard")) move(1);
    if (input.justPressed("slash")) {
      sfx.uiConfirm();
      if (titleState.index === 0) openPreparation("main");
      else openRanking(-1);
    }
  }

  function updatePreparation(dt) {
    preparationState.enterT += dt;
    const orders = {
      main: ["weapon", "growth", "tickets", "carryLess", "carryMore", "start", "back"],
      growth: ["buyHp", "buyGuard", "home"],
    };
    const order = orders[preparationState.section] || orders.main;
    const move = (delta) => {
      const next = Math.max(0, Math.min(order.length - 1, preparationState.index + delta));
      if (next !== preparationState.index) {
        preparationState.index = next;
        sfx.uiMove();
      }
    };
    if (input.justPressed("jump") || input.justPressed("left")) move(-1);
    if (input.justPressed("guard") || input.justPressed("right")) move(1);
    if (input.justPressed("skill")) {
      handlePreparationAction(preparationState.section === "main" ? "back" : "home");
      return;
    }
    if (input.justPressed("slash")) handlePreparationAction(order[preparationState.index]);
  }

  function updateWeaponSelect(dt) {
    weaponSelect.enterT += dt;
    weaponSelect.deniedT = Math.max(0, weaponSelect.deniedT - dt);
    const columns = data.weapons.length;
    const moveTo = (next) => {
      const clamped = Math.max(0, Math.min(data.weapons.length - 1, next));
      if (clamped === weaponSelect.index) return;
      weaponSelect.index = clamped;
      sfx.uiMove();
    };
    const moveHorizontal = (dir) => {
      const rowStart = Math.floor(weaponSelect.index / columns) * columns;
      const rowEnd = Math.min(data.weapons.length - 1, rowStart + columns - 1);
      moveTo(Math.max(rowStart, Math.min(rowEnd, weaponSelect.index + dir)));
    };
    const moveVertical = (dir) => {
      moveTo(weaponSelect.index + dir);
    };
    if (input.justPressed("left")) moveHorizontal(-1);
    if (input.justPressed("right")) moveHorizontal(1);
    if (input.justPressed("jump")) moveVertical(-1);
    if (input.justPressed("guard")) moveVertical(1);
    if (input.justPressed("skill")) {
      sfx.uiMove();
      openPreparation("main");
      return;
    }
    if (input.justPressed("slash")) {
      selectPreparedWeapon();
    }
  }

  function updateRun(dt) {
    const p = run.player;
    run.elapsed += dt;
    if (run.economyManaged && run.activeRunId) {
      run.heartbeatT += dt;
      if (run.heartbeatT >= 5) {
        run.heartbeatT = 0;
        const saved = profileService.syncRun({
          runId: run.activeRunId,
          shardsEarned: run.shards,
          ...currentRunStats(),
        });
        if (saved.ok) {
          profile = saved.profile;
          run.economySaveError = null;
        } else {
          run.economySaveError = saved.error?.message || "진행 기록을 저장하지 못했습니다";
        }
      }
    }
    for (const floor of run.building?.floors || []) {
      for (const cell of floor.cells) cell.flash = Math.max(0, (cell.flash || 0) - dt);
    }
    anim.attackT += dt;
    anim.laneT += dt;
    anim.comboPopT += dt;
    anim.hpFlashT += dt;
    anim.deflectT += dt;
    anim.hintT += dt;
    anim.mugetsu = run.mugetsuT > 0;
    const idleReady = anim.attackT >= anim.attackDur
      && anim.laneT >= LANE_TWEEN
      && p.y >= engine.GROUND_Y - 2
      && p.jumpPrepFrames === 0
      && p.hurtTimer <= 0
      && p.guardTimer <= 0
      && p.specialTimer <= 0;
    anim.idleT = idleReady ? anim.idleT + dt : 0;
    for (const s of anim.swings) s.t += dt;
    anim.swings = anim.swings.filter((s) => s.t < SWING_LIFE);

    // MP: 칼을 쉬는 동안만 5/s (사냥으로는 차오르지 않는다)
    run.mpPause = Math.max(0, run.mpPause - dt);
    if (run.mpPause <= 0) gainMp(MP_REGEN * mpRegenMul() * dt);
    run.mugetsuT = Math.max(0, run.mugetsuT - dt);
    run.spearRageT = Math.max(0, run.spearRageT - dt);
    p.attackCooldown = Math.max(0, (p.attackCooldown || 0) - dt);

    if (run.respawnTimer > 0) {
      run.respawnTimer -= dt;
      if (run.respawnTimer <= 0) spawnBuilding();
      updateComboIdle(dt);
      return;
    }
    if (!run.building) {
      spawnBuilding();
    }

    const stunned = p.stunTimer > 0;
    if (!stunned) {
      if (input.justPressed("left")) tryMoveLane(p, -1);
      if (input.justPressed("right")) tryMoveLane(p, 1);
      if (input.justPressed("jump")) {
        if (engine.jump(p)) sfx.jump();
      }
      if (input.justPressed("slash") || input.held("slash")) performSlash();
      if (input.justPressed("skill")) performSkill();
    }

    updatePendingAttack();

    const guarding = input.held("guard") && run.guard > 0;
    if (!stunned && guarding) {
      run.guard = Math.max(0, run.guard - dt * 60);
      p.guardTimer = 0.1;
    } else {
      run.guard = Math.min(guardMax(), run.guard + dt * 15);
      p.guardTimer = Math.max(0, p.guardTimer - dt);
    }
    anim.guardT = p.guardTimer > 0 ? anim.guardT + dt : 0;

    const jumpResult = engine.stepJumpPhysics(p, dt);
    if (jumpResult.justLanded) {
      sfx.land();
      fx.footDust(p.x, engine.GROUND_Y);
    }
    engine.updateCamera(run.camera, p);

    p.attackTimer = Math.max(0, p.attackTimer - dt);
    p.specialTimer = Math.max(0, p.specialTimer - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.stunTimer = Math.max(0, p.stunTimer - dt);

    updateProjectiles(dt);
    updateActiveAttacks(dt);

    // Finish this frame's damage batch (including all splash targets), then
    // freeze immediately. Surviving monsters, attacks and boss timers remain
    // intact while the player chooses every earned upgrade.
    if (run.pendingUpgrades > 0) {
      if (run.building?.floors.length === 0) afterBuildingCleared();
      else {
        forgeState.resumeCombat = true;
        forgeState.advanceStageAfter = false;
        goToForge(run.plan?.reward === "forgeEpic" ? "epic" : run.plan?.reward === "forgeRare" ? "rare" : null);
      }
      return;
    }

    if (run.building) {
      advanceMonster();
      updateBossDebris(dt);
      if (run.hp <= 0) return;
      const guardState = { value: run.guard };
      const outcome = engine.resolveCrush(run.building, p, guardState);
      run.guard = guardState.value;
      if (outcome.outcome === "deflect") {
        const gained = 60 + run.combo * 8;
        addScore(gained);
        anim.deflectT = 0;
        fx.sparks(p.x, p.y - 74, 12, "#9fdcff");
        fx.popup(`+${gained}`, p.x, p.y - 96, { color: "#9fdcff", size: 14 });
        fx.shake(3, 0.16);
        sfx.deflect();
      } else if (outcome.outcome === "crush") {
        const damage = Math.round(
          engine.monsterAttack(outcome.cellType, run.stageIndex, run.building.monsterDefinition) * (run.plan?.attackMul || 1),
        );
        run.hp = Math.max(0, run.hp - damage);
        resetCombo();
        anim.hpFlashT = 0;
        fx.shake(11, 0.38, { x: 0.24, y: 1 });
        fx.stop(5);
        fx.flash("#e5484d", 0.26, 0.4);
        fx.dust(p.x, p.y - 20, 8);
        fx.popup(`몸통에 깔렸다  -${damage}`, p.x, p.y - 110, { color: "#ff8a8f", size: 15, life: 1.0 });
        sfx.crush();
        sfx.hurtVoice();
        if (run.hp <= 0) {
          run.deathCause = "contact";
          finishRun();
          return;
        }
      }
      if (run.building.floors.length === 0) {
        afterBuildingCleared();
        return;
      }
    }
    engine.resolveAirborneBuildingPush(p, run.building);
    updateComboIdle(dt);
  }

  function tryMoveLane(p, dir) {
    const fromX = laneVisualX(p);
    const before = p.lane;
    engine.moveLane(p, dir);
    if (p.lane !== before) {
      anim.laneFromX = fromX;
      anim.laneT = 0;
    }
  }

  function updateBossDebris(dt) {
    const building = run.building;
    if (!run.bossPattern || !building?.floors.length || building.entrance?.phase === "entering") {
      fx.setDangerActive?.(false);
      return;
    }
    const p = run.player;
    const projection = layout?.combatProjection;
    const floorScreenY = (engine.GROUND_Y - run.camera.y) * (projection?.scale || 1) + (projection?.translateY || 0);
    const floorLimit = projection?.touchTrayCssTop
      ? projection.touchTrayCssTop / (layout.cssScaleY || 1) : H;
    const events = updateBossPattern(run.bossPattern, dt, {
      player: p, groundY: engine.GROUND_Y,
      bodyBottom: engine.buildingVisualBottomEdge(building), contactY: engine.CRUSH_CONTACT_Y,
      buildingX: engine.BUILDING_X, laneWidth: engine.LANE_W, randomInt: engine.randInt,
      allowLaunch: p.stunTimer <= 0,
      groundVisible: floorScreenY > 20 && floorScreenY < floorLimit - 20,
    });
    for (const event of events) {
      if (event.type === "warning") sfx.uiDeny();
      if (event.type === "land") {
        fx.dust(event.hazard.x, engine.GROUND_Y - 5, 6);
      }
      if (event.type !== "contact" || p.invulnTimer > 0) continue;
      if (p.guardTimer > 0 && run.guard >= DEBRIS_RULES.guardCost) {
        run.guard -= DEBRIS_RULES.guardCost;
        p.invulnTimer = DEBRIS_RULES.protection;
        fx.sparks(p.x, p.y - 90, 12, "#a9e8ff");
        sfx.deflect();
      } else {
        const damage = Math.round(DEBRIS_RULES.damage * Math.min(1.5, 1 + run.stageIndex * 0.01));
        run.hp = Math.max(0, run.hp - damage);
        run.deathCause = "debris";
        p.hurtTimer = 0.8;
        p.invulnTimer = DEBRIS_RULES.protection;
        p.stunTimer = 0.15;
        resetCombo();
        anim.hpFlashT = 0;
        fx.shake(6, 0.18);
        fx.flash("#e5484d", 0.16, 0.15);
        fx.popup(`잔해 피격  -${damage}`, p.x, p.y - 125, { color: "#ffaaaa", size: 14 });
        sfx.hurtVoice();
        if (run.hp <= 0) { finishRun(); return; }
      }
    }
    fx.setDangerActive?.(run.bossPattern.hazards.length > 0);
  }

  function currentUpgrades() {
    return Object.entries(run.upgrades).map(([id, count]) => {
      const card = data.upgrades.find((u) => u.id === id);
      return { id, name: card?.name || id, rank: card?.rank || "common", count };
    });
  }

  function forgePreview(id) {
    const card = data.upgrades.find((item) => item.id === id);
    if (!card) return null;
    const stack = upgradeStack(id);
    const uniqueValues = {
      sp_pierce: { label: "관통 피해", before: run.weapon.pierce || 35, after: 100 },
      sw_stone: { label: "정련 발동 타수", before: 3, after: 2 },
      sw_keen: { label: "정련 피해 배수", before: 2, after: 3 },
      kt_linger: { label: "무월 지속 초", before: MUGETSU_DUR, after: MUGETSU_LINGER_DUR },
      ax_quake: { label: "기술 파괴 줄", before: 4, after: 5 },
      sp_drive: { label: "밀어내는 거리 초", before: SPEAR_PUSH_SECONDS, after: SPEAR_DRIVE_PUSH_SECONDS },
      bw_storm: { label: "기술 공격 줄", before: 2, after: 4 },
      bw_twin: { label: "추가 발사 확률 %", before: 0, after: BOW_TWIN_CHANCE },
      bw_light: { label: "화살 속도 %", before: 100, after: 130 },
      cleave: { label: "양옆 피해", before: 0, after: CLEAVE_DAMAGE },
      sw_wave: { label: "정련 파괴 후 위쪽 피해", before: 0, after: SWORD_WAVE_DAMAGE },
    };
    if (uniqueValues[id]) return { ...uniqueValues[id], before: stack ? uniqueValues[id].after : uniqueValues[id].before };
    if (card.unique && !["ax_balance", "kt_speed", "sp_haft"].includes(id)) return card.desc;
    const read = () => id === "whet" ? slashDamage()
      : id === "haste" || id === "ax_balance" || id === "kt_speed" ? 1 / attackCooldown()
        : id === "core" ? guardMax()
          : id === "focus" ? MP_REGEN * mpRegenMul()
            : id === "sp_haft" ? attackRange()
              : id === "opening" ? OPENING_MP_PER_STAGE * upgradeStack(id) : upgradeStack(id);
    const before = read();
    run.upgrades[id] = card.unique ? 1 : Math.min(stack + 1, card.maxStacks || Infinity);
    const after = read();
    if (stack) run.upgrades[id] = stack; else delete run.upgrades[id];
    const label = id === "whet" ? "공격력" : ["haste", "ax_balance", "kt_speed"].includes(id) ? "초당 공격"
      : id === "core" ? "방어 최대" : id === "focus" ? "초당 MP" : id === "sp_haft" ? "사거리"
        : id === "opening" ? "시작 MP" : "강화 단계";
    return { label, before: Number(before.toFixed(1)), after: Number(after.toFixed(1)) };
  }

  function tutorialHint() {
    if (run.lastUpgrade && run.elapsed < run.lastUpgrade.until) return `${run.lastUpgrade.name} 강화 적용`;
    if (run.bossPattern?.hazards.length) return "표시된 레인을 피해 이동하거나 방어하세요";
    if (run.stageIndex > 2 || profile.runs > 2) return null;
    if (run.mp >= run.weapon.mpCost) return layout?.touchVisible ? "기술 준비 완료 · 기술 버튼" : "기술 준비 완료 · K";
    if (run.mpPause > 0 && run.elapsed > 5) return "공격을 쉬면 기술 게이지 충전";
    if (run.elapsed < 5) return layout?.touchVisible ? "좌우 이동 · 공격을 누르면 연속 공격" : "A D 이동 · J 공격 · W 점프 · S 방어 · K 기술";
    return "한 칸을 깨면 몸통 한 줄이 무너집니다";
  }

  function laneVisualX(p) {
    if (anim.laneT >= LANE_TWEEN) return p.x;
    const k = anim.laneT / LANE_TWEEN;
    return anim.laneFromX + (p.x - anim.laneFromX) * (1 - Math.pow(1 - k, 3));
  }

  function updateComboIdle(dt) {
    if (run.combo <= 0) return;
    run.comboIdleTimer += dt;
    if (run.comboIdleTimer >= 5) resetCombo();
  }

  function updateForge(dt) {
    forgeState.enterT += dt;
    forgeState.rerollDenied = Math.max(0, forgeState.rerollDenied - dt);
    const selectPrev = input.justPressed("jump") || input.justPressed("left");
    const selectNext = input.justPressed("guard") || input.justPressed("right");
    if (selectPrev && forgeState.selected > 0) {
      forgeState.selected -= 1;
      sfx.uiMove();
    }
    if (selectNext && forgeState.selected < forgeState.cards.length - 1) {
      forgeState.selected += 1;
      sfx.uiMove();
    }
    if (input.justPressed("aux")) tryReroll();
    if (input.justPressed("slash")) confirmForge();
    if (input.justPressed("skill")) openQuitConfirmation("forge");
  }

  function updateResults(dt) {
    results.enterT += dt;
    if (results.enterT < 0.5) return;
    if (results.section === "details") {
      const amount = ui.metrics().results?.scroll?.rowHeight || 54 * (layout?.uiScale || 1);
      if (input.justPressed("jump")) scrollBy(-amount);
      if (input.justPressed("guard")) scrollBy(amount);
      if (input.justPressed("slash") || input.justPressed("skill") || input.justPressed("pause")) handleResultsAction("back");
      return;
    }
    const order = ui.metrics().results?.focusOrder || [results.committed ? "results:retry" : "results:retrySave", "results:newChallenge", "results:primary", "results:details"];
    const previousIndex = results.index;
    moveMenuFocus(results, order);
    if (results.index !== previousIndex) {
      const metrics = ui.metrics().results;
      const area = metrics?.scroll;
      const reward = metrics?.newWeapons?.find(item => item.action?.id === order[results.index]);
      if (area?.maxOffset > 0 && reward) {
        if (reward.y < area.y) scrollBy(reward.y - area.y);
        else if (reward.y + reward.h > area.y + area.h) scrollBy(reward.y + reward.h - area.y - area.h);
      }
    }
    if (input.justPressed("slash")) handleRegion(order[results.index] || order[0]);
    else if (input.justPressed("skill")) handleResultsAction("newChallenge");
    else if (input.justPressed("aux")) handleResultsAction("retry");
  }

  function updateRanking(dt) {
    rankingState.enterT += dt;
    const amount = ui.metrics().ranking?.scroll?.rowHeight || 56 * (layout?.uiScale || 1);
    if (input.justPressed("jump")) scrollBy(-amount);
    if (input.justPressed("guard")) scrollBy(amount);
    if (input.justPressed("slash") || input.justPressed("skill")) {
      closeRanking();
    }
  }

  // === Render ===
  function render() {
    ui.beginFrame(); // clears this frame's mouse hit regions
    ctx.clearRect(0, 0, W, H);
    const screenShake = scene === "run" ? fx.offset() : null;
    if (screenShake) {
      ctx.fillStyle = "#061c48";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(screenShake.x * 0.18, screenShake.y * 0.18);
      world.drawBackground(clock, run.camera.y, stageVisual());
      ctx.restore();
    } else {
      world.drawBackground(clock, 0, stageVisual());
    }

    if (scene === "run") renderRun(screenShake);
    else if (scene === "title") {
      const top = loadRankings()[0];
      ui.drawTitle({
        t: clock,
        best: top ? top.score : 0,
        bestName: top ? top.name : "",
        index: titleState.index,
        bankShards: profile.wallet?.shards || 0,
      });
    } else if (scene === "preparation") {
      ui.drawPreparation({
        section: preparationState.section,
        weapon: run.weapon,
        bankShards: profile.wallet?.shards || 0,
        ticketStock: profile.wallet?.rerollTickets || 0,
        carryTickets: profile.preparation?.carryTickets || 0,
        carryLimit: economyConfig.reroll.carryLimit,
        freeRerolls: economyConfig.reroll.freePerRun,
        growthItems: growthViews(),
        ticketPrice: economyConfig.reroll.ticketPriceShards,
        focusedIndex: preparationState.index,
        notice: preparationState.notice,
        saveError: preparationState.saveError,
        canTransact: profileAvailable,
        enterT: preparationState.enterT,
        t: reducedMotion ? 0 : clock,
        assetsReady: gameplayAssetsReady(),
        assetsLoading: !gameplayAssetsReady() && !gameplayAssetsFailed(),
        assetsFailed: gameplayAssetsFailed(),
      });
    } else if (scene === "weaponSelect") {
      ui.drawWeaponSelect({
        weapons: weaponViews(),
        index: weaponSelect.index,
        t: weaponSelect.enterT,
        deniedT: weaponSelect.deniedT,
        assetsLoading: !gameplayAssetsReady() && !gameplayAssetsFailed(),
        assetsFailed: gameplayAssetsFailed(),
        preparation: {
          bankShards: profile.wallet?.shards || 0,
          ticketStock: profile.wallet?.rerollTickets || 0,
          carryTickets: profile.preparation?.carryTickets || 0,
        },
      });
    } else if (scene === "forge") {
      ui.drawForge({
        cards: forgeState.cards,
        selected: forgeState.selected,
        rerolls: run.rerollTickets,
        freeRerolls: run.freeRerolls,
        purchasedRerolls: run.purchasedRerolls,
        stackOf: upgradeStack,
        deniedT: forgeState.rerollDenied,
        deniedReason: forgeState.rerollDeniedReason,
        saveError: run.economySaveError,
        enterT: forgeState.enterT,
        t: clock,
        stage: run.stageIndex,
        level: run.level,
        pendingUpgrades: run.pendingUpgrades,
        rewardNote: forgeState.minRank === "rare"
          ? "정예 보상 — 희귀 이상 보장"
          : forgeState.minRank === "epic" ? "보스 보상 — 영웅 강화" : null,
        previewOf: forgePreview,
        canReroll: run.rerollTickets > 0,
        reducedMotion,
      });
    } else if (scene === "results") {
      ui.drawResults({
        section: results.section,
        focusedIndex: results.index,
        scrollOffset: results.scrollOffset,
        unlockedWeapons: results.newlyUnlockedIds.map((id) => data.weapons.find((weapon) => weapon.id === id && profile.unlocked.includes(id))).filter(Boolean),
        score: run.score,
        bestCombo: run.bestCombo,
        floors: run.floorsCollapsed,
        stage: run.stageIndex + 1,
        weapon: run.weapon.name,
        weaponId: run.weapon.id,
        attacks: run.attackCount,
        skills: run.skillCount,
        unlocked: results.newlyUnlocked,
        newlyUnlockedIds: results.newlyUnlockedIds,
        newWeapon: newlyUnlockedWeapon(),
        registered: results.registered,
        saveError: results.saveError,
        profileSaved: results.profileSaved,
        personalBest: results.personalBest,
        personalBestStage: results.personalBestStage,
        deathCause: run.deathCause,
        endReason: results.endReason,
        earnedShards: results.settlement?.shardsEarned ?? run.shards,
        bankBefore: results.bankBefore,
        bankAfter: results.settlement?.shardBalance ?? results.bankBefore,
        returnedTickets: results.settlement?.returnedTickets ?? 0,
        settlementPending: !results.committed,
        settlementError: results.committed ? "" : results.saveError,
        enterT: results.enterT,
      });
    } else if (scene === "ranking") {
      ui.drawRanking({
        scrollOffset: rankingState.scrollOffset,
        entries: rankingState.entries,
        highlight: rankingState.highlight,
        enterT: rankingState.enterT,
      });
      if (rankingState.revealHighlight) {
        const area = ui.metrics().ranking?.scroll;
        rankingState.revealHighlight = false;
        if (area) {
          rankingState.scrollOffset = Math.max(0, Math.min(area.maxOffset, (rankingState.highlight + 1) * area.rowHeight - area.h));
          if (rankingState.scrollOffset > 0) return render();
        }
      }
    }

    fx.renderScreen(ctx, W, H);
    ui.vignette();
    if (paused) ui.fadeOverlay(fadeAlpha());
    if (paused && !quitState.active) ui.drawPauseOverlay?.({
      section: pauseMenu.section,
      focusedIndex: pauseMenu.index,
      scrollOffset: pauseMenu.scrollOffset,
      muted: audio.state().muted,
      touchInput: layout?.coarsePointer === true,
      upgrades: currentUpgrades(), weaponName: run.weapon.name,
      stats: { power: slashDamage(), range: attackRange(), speed: Number((1 / attackCooldown()).toFixed(1)) },
      reducedMotion,
      shards: run.shards,
    });
    ui.drawSystemControls?.({ scene, paused, muted: audio.state().muted });
    if (!paused) ui.fadeOverlay(fadeAlpha());
    if (quitState.active) ui.drawQuitConfirm?.({
      shards: run.shards,
      enterT: quitState.enterT,
      focusedIndex: quitState.index,
      saveError: run.economySaveError || "",
    });
  }

  function renderRun(sh) {
    const p = run.player;
    ctx.save();
    const projection = layout?.combatProjection;
    if (projection) {
      ctx.translate(projection.translateX, projection.translateY);
      ctx.scale(projection.scale, projection.scale);
    }
    ctx.translate(sh.x, -run.camera.y + sh.y);
    world.drawGround(run.camera.y, { worldScale: projection?.scale || 1 });
    world.drawLaneGlow(run.camera.y, stageVisual());
    fx.renderWorldBack(ctx);
    if (run.building) world.drawMonster(run.building, clock, stageVisual());
    world.drawActiveAttacks(run.activeAttacks);
    world.drawPlayer(p, anim, clock); // lane tween is applied inside drawPlayer
    world.drawProjectiles(run.projectiles);
    fx.renderWorld(ctx, BUILDING_SPAN);
    world.drawBossHazards?.(run.bossPattern?.hazards || [], { cameraY: run.camera.y, time: clock, reducedEffects: reducedMotion });
    ctx.restore();

    ui.drawHud({
      hp: run.hp,
      hpMax: run.hpMax,
      guard: run.guard,
      guardMax: guardMax(),
      mp: run.mp,
      mpMax: run.weapon.mpMax,
      mpCost: run.weapon.mpCost,
      mpPaused: run.mpPause > 0,
      skillName: run.weapon.skill,
      mugetsuT: run.mugetsuT,
      spearRageT: run.spearRageT,
      score: run.score,
      combo: run.combo,
      comboIdleTimer: run.comboIdleTimer,
      shards: run.shards,
      stage: run.stageIndex,
      experience: experienceState(),
      stageType: run.plan?.typeId || "normal",
      stageLabel: run.plan?.label || "일반",
      stageColor: run.plan?.color || "#ece6f4",
      waveIndex: run.buildingIndex,
      waveCount: run.buildingsInStage,
      upgrades: currentUpgrades(),
      boss: run.building?.encounterType === "boss" ? {
        name: run.building.monsterName, hp: engine.buildingHp(run.building), maxHp: run.building.maxBodyHp,
        action: run.building.entrance?.phase === "entering" ? "등장 중" : "강인함",
      } : null,
      hazardActive: Boolean(run.bossPattern?.hazards.length),
      hazardLanes: run.bossPattern?.hazards.map((h) => h.lane) || [],
      hazardPhase: run.bossPattern?.phase,
      comboCelebration: run.combo > 0 && run.combo % 10 === 0,
      hint: tutorialHint(), reducedMotion,
      t: clock,
      comboPopT: anim.comboPopT,
      hpFlashT: anim.hpFlashT,
      hintT: anim.hintT,
      showHints: run.stageIndex === 0 && run.buildingIndex === 0,
      approach: buildingApproachState(),
    });
  }

  function stageVisual() {
    return {
      scene,
      typeId: scene === "run" ? (run.plan?.typeId || "normal") : "normal",
      color: run.plan?.color || "#ece6f4",
      stageIndex: run.stageIndex,
      waveIndex: run.buildingIndex,
      bossAction: bossPatternView(run.bossPattern),
      effectsReduced: reducedMotion,
    };
  }

  // QA hooks — only exist with ?dev=1, for scripted screenshot verification.
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("dev")) {
    const testCells = (lane, hp, maxHp = hp, type = 0, special = null) => (
      Array.from({ length: engine.LANES }, (_, index) => ({
        type,
        originalType: type + 1,
        hp: index === lane ? hp : 0,
        maxHp,
        flash: 0,
        lastHitCell: null,
        special: index === lane ? special : null,
      }))
    );
    const installTestBuilding = (buildingY, floors) => {
      run.building = {
        fixture: true,
        entityKind: "monster",
        entityId: "monster-test",
        y: buildingY,
        fixedYQ6: buildingY * 0x40,
        velocityQ6: 0,
        holdFrames: 999999,
        floors,
        floorCount: floors.length,
        originalFloorCount: floors.length,
        maxBodyHp: floors.reduce(
          (sum, floor) => sum + floor.cells.reduce((rowSum, cell) => rowSum + engine.cellMaxHp(cell), 0),
          0,
        ),
      };
      run.lastCellHit = null;
      run.sameCellStreak = 0;
    };
    window.__zanDev = {
      scene: () => scene,
      seed: (n) => engine.seedRng(n),
      loadGameplayAssets: async () => {
        await ensureGameplayAssets();
        return gameplayAssetsReady();
      },
      gameplayAssetsReady: () => gameplayAssetsReady(),
      gameplayArtStatus: () => ({
        hero: Boolean(
          sprites.idle_chokento_v1
          && sprites.motion_chokento_jump_v1
          && sprites.motion_chokento_fall_v1
          && sprites.motion_chokento_guard_v1
          && sprites.motion_chokento_hurt_v1
        ),
        slime: Boolean(sprites.monster_slime_v2),
        weaponIdle: {
          chokento: Boolean(sprites.idle_chokento_v1),
          katana: Boolean(sprites.idle_katana_v1),
          axe: Boolean(sprites.idle_axe_v1),
          spear: Boolean(sprites.idle_spear_v1),
          bow: Boolean(sprites.idle_bow_v1),
        },
      }),
      startTestRun: (weaponId = "chokento") => {
        const weapon = data.weapons.find((w) => w.id === weaponId);
        if (!weapon) return false;
        run.weapon = weapon;
        beginRun({ managed: false });
        run.building = null;
        run.respawnTimer = 0;
        run.mp = weapon.mpMax;
        fade.pending = null;
        fade.t = fade.dur;
        applyScene("run");
        return true;
      },
      finishEntrance: () => {
        if (run.building?.entrance) run.building.entrance.phase = "combat";
      },
      placeMonsterBottom: (bottomY) => {
        if (!run.building?.floors.length) return false;
        const dy = Number(bottomY) - engine.buildingVisualBottomEdge(run.building);
        run.building.y += dy;
        run.building.fixedYQ6 = run.building.y * 64;
        return true;
      },
      getBossPattern: () => run.bossPattern ? JSON.parse(JSON.stringify(run.bossPattern)) : null,
      fillMp: () => { run.mp = run.weapon.mpMax; },
      giveCard: (id) => {
        const card = data.upgrades.find((u) => u.id === id);
        if (!card) return false;
        applyForgeCard(card);
        return true;
      },
      clearBuilding: () => {
        if (!run.building) return;
        run.building.floors.length = 0;
        afterBuildingCleared();
      },
      addShards: (n) => addShards(n),
      setHp: (n) => { run.hp = n; },
      setHudState: ({ hp, guard, mp, score, shards, rerolls, freeRerolls, purchasedRerolls } = {}) => {
        if (Number.isFinite(Number(hp))) run.hp = Math.max(0, Math.min(run.hpMax, Number(hp)));
        if (Number.isFinite(Number(guard))) run.guard = Math.max(0, Math.min(guardMax(), Number(guard)));
        if (Number.isFinite(Number(mp))) run.mp = Math.max(0, Math.min(run.weapon.mpMax, Number(mp)));
        if (Number.isFinite(Number(score))) run.score = Math.max(0, Math.round(Number(score)));
        if (Number.isFinite(Number(shards))) run.shards = Math.max(0, Math.round(Number(shards)));
        if (Number.isFinite(Number(rerolls))) {
          run.freeRerolls = Math.max(0, Math.round(Number(rerolls)));
          run.purchasedRerolls = 0;
        }
        if (Number.isFinite(Number(freeRerolls))) run.freeRerolls = Math.max(0, Math.round(Number(freeRerolls)));
        if (Number.isFinite(Number(purchasedRerolls))) run.purchasedRerolls = Math.max(0, Math.round(Number(purchasedRerolls)));
        updateRerollTotal();
        return true;
      },
      setPlayerY: (y) => {
        if (!run.player) return false;
        run.player.y = Number(y);
        run.player.vy = 0;
        run.player.jumpPrepFrames = 0;
        run.player.lastGrounded = Math.abs(run.player.y - engine.GROUND_Y) <= 1;
        return true;
      },
      setPlayerVisualState: ({ guard = 0, hurt = 0, special = 0, vy = null } = {}) => {
        if (!run.player) return false;
        run.player.guardTimer = Math.max(0, Number(guard) || 0);
        run.player.hurtTimer = Math.max(0, Number(hurt) || 0);
        run.player.specialTimer = Math.max(0, Number(special) || 0);
        if (vy !== null) run.player.vy = Number(vy) || 0;
        return true;
      },
      setCombo: (n) => {
        run.combo = Math.max(0, Math.round(n));
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        run.comboIdleTimer = 0;
        anim.comboPopT = 0;
      },
      setExperience: ({ level = 1, current = 0, total = 0, pendingUpgrades = 0 } = {}) => {
        run.level = Math.max(1, Math.floor(level));
        run.experience = Math.max(0, Math.min(experienceRequired() - 1, current));
        run.totalExperience = Math.max(run.experience, total);
        run.pendingUpgrades = Math.max(0, Math.floor(pendingUpgrades));
      },
      setWeapon: (id) => {
        const weapon = data.weapons.find((w) => w.id === id);
        if (!weapon) return false;
        run.weapon = weapon;
        anim.weaponId = weapon.id;
        anim.attackDur = weapon.cooldown || 0.28;
        anim.attackT = 9;
        anim.idleT = 0;
        run.pendingAttack = null;
        if (run.player) run.player.attackCooldown = 0;
        run.mp = Math.min(run.mp, weapon.mpMax);
        return true;
      },
      clearAttacks: () => {
        run.activeAttacks = [];
        run.projectiles = [];
        run.pendingAttack = null;
        anim.attackT = 9;
        anim.idleT = 0;
        fx.clear();
        if (run.player) {
          run.player.attackCooldown = 0;
          run.player.hurtTimer = 0;
          run.player.invulnTimer = 0;
          run.player.stunTimer = 0;
        }
      },
      setSingleTarget: ({ floorY, lane = 1, hp = 100, maxHp = hp, type = 0 }) => {
        installTestBuilding(floorY - engine.FLOOR_H, [{
          rowIndex: 1,
          cells: testCells(lane, hp, maxHp, type),
        }]);
      },
      setSpearPair: ({ targetFloorY, lane = 1, targetHp = 200, aboveHp = 100, type = 0 }) => {
        installTestBuilding(targetFloorY - engine.FLOOR_H * 2, [
          { rowIndex: 1, cells: testCells(lane, aboveHp, aboveHp, type) },
          { rowIndex: 2, cells: testCells(lane, targetHp, targetHp, type) },
        ]);
      },
      setColumn: ({ bottomFloorY, lane = 1, hps = [100], type = 0 }) => {
        const floors = hps.map((hp, index) => ({
          rowIndex: index + 1,
          cells: testCells(lane, hp, hp, type),
        }));
        installTestBuilding(bottomFloorY - engine.FLOOR_H * hps.length, floors);
      },
      setBuildingSpeed: (pxPerFrame) => {
        if (!run.building || !Number.isFinite(Number(pxPerFrame))) return false;
        run.building.velocityQ6 = Number(pxPerFrame) * 0x40;
        return true;
      },
      setFullRow: ({ floorY, hps = [100, 100, 100], maxHps = hps, types = [0, 0, 0] }) => {
        const cells = Array.from({ length: engine.LANES }, (_, lane) => ({
          type: types[lane] ?? 0,
          originalType: (types[lane] ?? 0) + 1,
          hp: Math.max(0, Number(hps[lane]) || 0),
          maxHp: Math.max(1, Number(maxHps[lane]) || Number(hps[lane]) || 1),
          flash: 0,
          lastHitCell: null,
          special: null,
        }));
        installTestBuilding(floorY - engine.FLOOR_H, [{ rowIndex: 1, cells }]);
      },
      setBomberColumn: ({ floorY, lane = 1, hp = 100, aboveHp = 100, belowHp = 100 }) => {
        installTestBuilding(floorY - engine.FLOOR_H * 2, [
          { rowIndex: 1, cells: testCells(lane, aboveHp, aboveHp, 0) },
          { rowIndex: 2, cells: testCells(lane, hp, hp, 0, "bomber") },
          { rowIndex: 3, cells: testCells(lane, belowHp, belowHp, 0) },
        ]);
      },
      forceForge: (minRank = null) => {
        run.pendingUpgrades = Math.max(1, run.pendingUpgrades);
        forgeState.advanceStageAfter = true;
        forgeState.resumeCombat = false;
        goToForge(minRank);
      },
      forceForgeCards: (ids, minRank = null) => {
        run.pendingUpgrades = 1;
        forgeState.advanceStageAfter = true;
        forgeState.resumeCombat = false;
        const cards = ids
          .map((id) => data.upgrades.find((u) => u.id === id))
          .filter(Boolean);
        forgeState.minRank = minRank;
        forgeState.cards = cards;
        forgeState.selected = 0;
        forgeState.enterT = 0.5;
        forgeState.rerollDenied = 0;
        forgeState.rerollDeniedReason = "";
        fade.pending = null;
        fade.t = fade.dur;
        applyScene("forge");
        return cards.length;
      },
      queueForgeRerollOffers: (offers) => {
        if (!Array.isArray(offers)) return 0;
        const queued = offers.map((ids) => (
          Array.isArray(ids)
            ? ids.map((id) => data.upgrades.find((upgrade) => upgrade.id === id)).filter(Boolean)
            : []
        ));
        if (queued.some((cards) => cards.length !== 3)) return 0;
        forgeState.rerollOfferQueue = queued;
        return queued.length;
      },
      forceResults: () => {
        results.enterT = 2;
        results.registered = false;
        results.saveError = null;
        changeScene("results");
      },
      forceRanking: () => {
        openRanking(-1);
      },
      placeBottomFloor: (floorY) => {
        if (!run.building || !run.building.floors.length) return false;
        const bottom = run.building.floors[run.building.floors.length - 1];
        const y = floorY - bottom.rowIndex * engine.FLOOR_H;
        run.building.y = y;
        run.building.fixedYQ6 = y * 0x40;
        run.building.holdFrames = 999999;
        return true;
      },
      forceRewardStage: (typeId, { waveIndex = null } = {}) => {
        const type = STAGE_TYPES[typeId] || STAGE_TYPES.normal;
        run.plan = {
          typeId,
          label: type.label,
          color: type.color,
          waves: type.waves || 1,
          rows: type.rows,
          rowsAddScaled: type.rowsAdd || 0,
          speedMul: type.speedMul || 1,
          weights: type.weights || null,
          hpTierAdd: type.hpTierAdd || 0,
          attackMul: type.attackMul || 1,
          shardMul: type.shardMul || 1,
          specials: type.specials || null,
          reward: type.reward || "forge",
          clearShards: type.clearShards ?? 30,
        };
        run.stageRewarded = false;
        run.buildingsInStage = run.plan.waves;
        run.buildingIndex = waveIndex === null ? Math.max(0, run.buildingsInStage - 1)
          : Math.max(0, Math.min(run.buildingsInStage - 1, waveIndex));
        if (!run.building) spawnBuilding();
        changeScene("run");
      },
      getTestCells: () => (run.building ? run.building.floors.map((floor) => ({
        rowIndex: floor.rowIndex,
        floorY: Math.round(engine.floorWorldY(run.building, floor)),
        cells: floor.cells.map((cell) => ({
          active: cell.active !== false,
          coverage: Number((cell.coverage || 0).toFixed(4)),
          type: cell.type,
          special: cell.special || null,
          hp: Math.round(cell.hp),
          maxHp: engine.cellMaxHp(cell),
        })),
      })) : []),
      setMonsterCell: ({ rowIndex, lane, type, hp, maxHp }) => {
        if (!run.building) return false;
        const floor = run.building.floors.find((candidate) => candidate.rowIndex === Number(rowIndex));
        const cell = floor?.cells?.[Number(lane)];
        if (!cell || cell.active === false) return false;
        if (Number.isFinite(Number(type))) {
          cell.type = Math.max(0, Math.min(engine.materialInfo.length - 1, Math.round(Number(type))));
          cell.originalType = cell.type + 1;
        }
        if (Number.isFinite(Number(maxHp))) cell.maxHp = Math.max(1, Number(maxHp));
        if (Number.isFinite(Number(hp))) cell.hp = Math.max(0, Math.min(engine.cellMaxHp(cell), Number(hp)));
        return true;
      },
      warp: (n) => {
        fx.clear();
        run.bossPattern = null;
        enterStage(Math.max(0, n)); // endless: no upper bound
        run.building = null;
        run.respawnTimer = 0.3;
        fade.pending = null;
        fade.t = fade.dur;
        applyScene("run");
      },
      plan: () => (run.plan ? { stage: run.stageIndex + 1, ...run.plan } : null),
    };
  }

  function targetEnemyState() {
    if (!run.building || !run.player) return null;
    const fromY = run.player.y - (run.weapon.id === "bow" ? 70 : 52);
    const target = engine.findFirstReachTarget(run.building, {
      lane: run.player.lane,
      fromY,
      toY: fromY - attackRange(),
    });
    if (!target) return null;
    const lane = target.floor.cells.indexOf(target.cell);
    const info = engine.materialInfo[target.cell.type];
    return {
      label: info.label,
      lane,
      row: target.floor.rowIndex,
      distance: Math.max(0, Math.round(fromY - target.floorY)),
      range: attackRange(),
      hp: Number(Math.max(0, target.cell.hp).toFixed(2)),
      maxHp: engine.cellMaxHp(target.cell),
      gauge: Number(engine.cellHpRatio(target.cell).toFixed(3)),
    };
  }

  function textState() {
    return JSON.stringify({
      scene,
      paused,
      pauseMenu: paused ? { ...pauseMenu } : null,
      ranking: scene === "ranking" ? { returnScene: rankingState.returnScene, scrollOffset: rankingState.scrollOffset } : null,
      elapsed: Number(run.elapsed.toFixed(3)),
      effects: { reducedMotion },
      deathCause: run.deathCause,
      coordinateSystem: "logical canvas pixels; origin top-left; +x right; +y down",
      quitConfirm: quitState.active ? { origin: quitState.origin, shards: run.shards } : null,
      results: scene === "results" ? {
        section: results.section,
        focusedIndex: results.index,
        scrollOffset: results.scrollOffset,
        registered: results.registered,
        saveError: results.saveError,
        profileSaved: results.profileSaved,
        committed: results.committed,
        deathCause: run.deathCause,
        reason: results.endReason,
        settlement: results.settlement ? { ...results.settlement } : null,
        bankBefore: results.bankBefore,
        newlyUnlockedIds: [...results.newlyUnlockedIds],
        newWeaponId: newlyUnlockedWeapon()?.id || null,
      } : null,
      audio: audio.state(),
      profile: {
        version: profile.version,
        revision: profile.revision,
        runs: profile.runs,
        bestStage: profile.bestStage,
        totalFloors: profile.totalFloors,
        unlocked: [...profile.unlocked],
        bankShards: profile.wallet?.shards || 0,
        ticketInventory: profile.wallet?.rerollTickets || 0,
        growth: { ...(profile.growth || {}) },
        selectedWeapon: profile.preparation?.weaponId || defaultWeaponId,
        selectedBring: profile.preparation?.carryTickets || 0,
        activeRun: profile.activeRun ? {
          id: profile.activeRun.id,
          shardsEarned: profile.activeRun.shardsEarned,
          freeRerollsRemaining: profile.activeRun.freeRerollsRemaining,
          purchasedTicketsReserved: profile.activeRun.purchasedTicketsReserved,
          purchasedTicketsRemaining: profile.activeRun.purchasedTicketsRemaining,
          purchasedTicketsSpent: profile.activeRun.purchasedTicketsSpent,
          rerollSequence: profile.activeRun.rerollSequence,
          lastReroll: profile.activeRun.lastReroll ? { ...profile.activeRun.lastReroll } : null,
          growthLevels: { ...profile.activeRun.growthLevels },
        } : null,
      },
      economy: {
        writable: profileWritable && profileAvailable,
        exclusive: profileExclusive,
        lockSupported: profileLockSupported,
        ticketPrice: economyConfig.reroll.ticketPriceShards,
        freePerRun: economyConfig.reroll.freePerRun,
        carryLimit: economyConfig.reroll.carryLimit,
        activeRun: run.economyManaged && run.activeRunId ? {
          id: run.activeRunId,
          shardsEarned: run.shards,
          freeRerollsRemaining: run.freeRerolls,
          purchasedTicketsReserved: run.purchasedReserved,
          purchasedTicketsRemaining: run.purchasedRerolls,
          purchasedTicketsSpent: Math.max(0, run.purchasedReserved - run.purchasedRerolls),
          growthLevels: { ...run.growthLevels },
          saveError: run.economySaveError,
        } : null,
      },
      viewport: {
        w: W,
        h: H,
        groundY: engine.GROUND_Y,
        buildingX: engine.BUILDING_X,
        buildingW: engine.BUILDING_W,
      },
      layout: layout ? {
        mode: layout.mode,
        portrait: layout.portrait,
        coarsePointer: layout.coarsePointer,
        touchVisible: layout.touchVisible,
        cssFrame: {
          w: Number(layout.cssFrameWidth.toFixed(2)),
          h: Number(layout.cssFrameHeight.toFixed(2)),
        },
        visualViewport: {
          w: Number(layout.visualWidth.toFixed(2)),
          h: Number(layout.visualHeight.toFixed(2)),
        },
        canvasCss: {
          w: Number(layout.canvasCssWidth.toFixed(2)),
          h: Number(layout.canvasCssHeight.toFixed(2)),
        },
        cssScale: Number(layout.cssScaleY.toFixed(4)),
        uiScale: Number(layout.uiScale.toFixed(4)),
        hudScale: Number(layout.hudScale.toFixed(4)),
        hudTargetScale: Number(layout.hudTargetScale.toFixed(4)),
        fluidScaleT: Number(layout.fluidScaleT.toFixed(4)),
        visibleLogicalWidth: Number(layout.visibleLogicalWidth.toFixed(2)),
        devicePixelRatio: Number(layout.devicePixelRatio.toFixed(2)),
      } : null,
      player: run.player ? {
        lane: run.player.lane,
        x: Math.round(run.player.x),
        y: Math.round(run.player.y),
        screenY: Math.round(run.player.y - run.camera.y),
        hp: Math.round(run.hp),
        hpMax: Math.round(run.hpMax),
        guard: Math.round(run.guard),
        guardMax: Math.round(guardMax()),
        mp: Math.round(run.mp),
        attackCooldown: Number((run.player.attackCooldown || 0).toFixed(3)),
        vy: Number((run.player.vy || 0).toFixed(2)),
        falling: run.player.y < engine.GROUND_Y - 2 && run.player.jumpPrepFrames === 0 && run.player.vy > 80,
      } : null,
      camera: {
        y: Number(run.camera.y.toFixed(2)),
        followStartRise: engine.CAMERA_FOLLOW_START_RISE,
        following: Boolean(run.camera.airFocus),
        targetScreenY: engine.CAMERA_TARGET_PLAYER_SCREEN_Y,
        deadzoneTop: engine.CAMERA_DEADZONE_TOP_SCREEN_Y,
        deadzoneBottom: engine.CAMERA_DEADZONE_BOTTOM_SCREEN_Y,
      },
      building: run.building && run.building.floors.length ? {
        entityKind: run.building.entityKind || "monster",
        entityId: run.building.entityId || null,
        monsterKind: run.building.monsterKind || "slime",
        monsterId: run.building.monsterId,
        monsterName: run.building.monsterName,
        spriteKey: run.building.spriteKey,
        artKind: run.building.artKind,
        encounterType: run.building.encounterType,
        body: engine.monsterBodyMetrics(run.building),
        artBounds: engine.monsterArtBounds(run.building),
        entrance: run.building.entrance ? { ...run.building.entrance } : null,
        speedPerSecond: Number((run.building.velocityQ6 / 64 * 60).toFixed(2)),
        floors: run.building.floors.length,
        originalFloors: run.building.originalFloorCount || run.building.floorCount,
        activeCells: run.building.floors.reduce(
          (sum, floor) => sum + floor.cells.filter((cell) => cell.active !== false && cell.hp > 0).length,
          0,
        ),
        inactiveCells: run.building.floors.reduce(
          (sum, floor) => sum + floor.cells.filter((cell) => cell.active === false).length,
          0,
        ),
        y: Math.round(run.building.y),
        topScreenY: Math.round(run.building.y - run.camera.y),
        bottomScreenY: Math.round(engine.buildingVisualBottomEdge(run.building) - run.camera.y),
      } : null,
      approach: buildingApproachState() ? {
        boosted: buildingApproachState().boosted,
        offscreen: buildingApproachState().offscreen,
        seconds: Number(buildingApproachState().seconds.toFixed(2)),
        progress: Number(buildingApproachState().progress.toFixed(3)),
      } : null,
      bossPattern: run.bossPattern ? {
        ...bossPatternView(run.bossPattern), casts: run.bossPattern.casts, dodges: run.bossPattern.dodges,
        hazards: run.bossPattern.hazards.map((h) => ({ ...h })),
      } : null,
      attack: {
        power: slashDamage(),
        range: attackRange(),
        speed: Number((1 / attackCooldown()).toFixed(2)),
        delay: Number(attackCooldown().toFixed(3)),
        count: run.attackCount,
        motionFrame: attackFrameAt(anim.attackT, anim.attackDur),
        motionElapsed: Number(anim.attackT.toFixed(3)),
        motionDuration: Number(anim.attackDur.toFixed(3)),
        idleFrame: idleFrameAt(anim.idleT),
        pending: run.pendingAttack ? {
          weaponId: run.pendingAttack.weaponId,
          impactFrame: run.pendingAttack.impactFrame,
          released: run.pendingAttack.released,
          releaseAt: Number(run.pendingAttack.releaseAt.toFixed(3)),
        } : null,
      },
      fx: fx.stats(),
      buffs: {
        mugetsuT: Number(run.mugetsuT.toFixed(3)),
        spearRageT: Number(run.spearRageT.toFixed(3)),
      },
      attacks: {
        active: run.activeAttacks.length,
        projectiles: run.projectiles.length,
        firstProjectile: run.projectiles[0] ? {
          kind: run.projectiles[0].kind,
          lane: run.projectiles[0].lane,
          x: Math.round(run.projectiles[0].x),
          y: Math.round(run.projectiles[0].y),
          fromY: Math.round(run.projectiles[0].fromY),
          prevY: Math.round(run.projectiles[0].prevY),
          speed: Math.round(run.projectiles[0].speed),
          delay: Number((run.projectiles[0].delay || 0).toFixed(3)),
          twin: run.projectiles[0].twin === true,
        } : null,
        firstActive: run.activeAttacks[0] ? {
          kind: run.activeAttacks[0].kind,
          lane: run.activeAttacks[0].lane,
          x: Math.round(run.activeAttacks[0].x),
          y: Math.round(run.activeAttacks[0].y),
          fromY: Math.round(run.activeAttacks[0].fromY),
          prevY: Math.round(run.activeAttacks[0].prevY),
          elapsed: Number(run.activeAttacks[0].t.toFixed(3)),
        } : null,
      },
      targetEnemy: targetEnemyState(),
      combo: run.combo,
      comboIdleTimer: Number(run.comboIdleTimer.toFixed(3)),
      score: run.score,
      shards: run.shards,
      rerolls: run.rerollTickets,
      experience: experienceState(),
      freeRerolls: run.freeRerolls,
      purchasedRerolls: run.purchasedRerolls,
      purchasedReserved: run.purchasedReserved,
      growthLevels: { ...run.growthLevels },
      upgrades: { ...run.upgrades },
      stage: run.stageIndex + 1,
      stageType: run.plan?.typeId || "normal",
      stageLabel: run.plan?.label || "일반",
      waveIndex: run.buildingIndex,
      waveCount: run.buildingsInStage,
      forge: scene === "forge" ? {
        resumeCombat: forgeState.resumeCombat,
        pendingUpgrades: run.pendingUpgrades,
        minRank: forgeState.minRank,
        selected: forgeState.selected,
        rerolls: run.rerollTickets,
        freeRerolls: run.freeRerolls,
        purchasedRerolls: run.purchasedRerolls,
        deniedReason: forgeState.rerollDeniedReason || null,
        saveError: run.economySaveError,
        cards: forgeState.cards.map((card) => ({
          id: card.id,
          name: card.name,
          rank: card.rank,
          weapon: card.weapon || null,
          unique: card.unique === true,
        })),
      } : null,
      ui: ui.metrics(),
    });
  }

  function abandonRun() {
    if (!profileWritable || !run.economyManaged || !run.activeRunId) return false;
    const synced = profileService.syncRun({
      runId: run.activeRunId,
      shardsEarned: run.shards,
      ...currentRunStats(),
    });
    if (!synced.ok) return false;
    profile = synced.profile;
    const unlockedIds = profile.activeRun
      ? unlockIdsForRunSummary(profile, profile.activeRun.summary)
      : [];
    const settled = profileService.abandonRun({
      runId: run.activeRunId,
      reason: scene === "results" ? results.endReason : "quit",
      stats: currentRunStats(),
      unlockedIds,
    });
    if (!settled.ok) return false;
    profile = settled.profile;
    run.activeRunId = null;
    return true;
  }

  return { update, render, click, hoverHit, setPointer, canScrollAt, scrollAt, resize, textState, setGameplayAssetsReady, setPaused, abandonRun };
}
