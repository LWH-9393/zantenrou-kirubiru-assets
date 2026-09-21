import { createProfileRepository } from "./profile.js";

export const PROFILE_SESSION_KEY = "monsterday.profile.v2.session";
export const SETTLEMENT_REASONS = Object.freeze([
  "death",
  "death_contact",
  "death_debris",
  "quit",
  "recovery",
]);

const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

export class EconomyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EconomyError";
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function integer(value, { min = 0, max = MAX_COUNTER } = {}) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function requireInteger(value, code, message, options) {
  const normalized = integer(value, options);
  if (normalized === null) throw new EconomyError(code, message);
  return normalized;
}

function requireId(value, code, message) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new EconomyError(code, message);
  }
  return value;
}

function safeAdd(left, right, code = "VALUE_OVERFLOW") {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new EconomyError(code, "재화 또는 기록 값이 허용 범위를 넘었습니다.");
  }
  return result;
}

export function normalizeEconomyConfig(value) {
  const reroll = value?.reroll;
  const recovery = value?.recovery;
  const config = {
    version: integer(value?.version, { min: 1 }),
    reroll: {
      ticketPriceShards: integer(reroll?.ticketPriceShards, { min: 1 }),
      freePerRun: integer(reroll?.freePerRun),
      carryLimit: integer(reroll?.carryLimit),
      bossRefillAmount: integer(reroll?.bossRefillAmount),
      freeRerollCap: integer(reroll?.freeRerollCap),
      consumeOrder: Array.isArray(reroll?.consumeOrder) ? [...reroll.consumeOrder] : null,
    },
    recovery: {
      staleAfterMs: integer(recovery?.staleAfterMs, { min: 1000 }),
    },
  };
  if (
    config.version === null
    || Object.values(config.reroll).some((item) => item === null)
    || config.recovery.staleAfterMs === null
    || config.reroll.freePerRun > config.reroll.freeRerollCap
    || config.reroll.consumeOrder.length !== 2
    || config.reroll.consumeOrder[0] !== "free"
    || config.reroll.consumeOrder[1] !== "purchased"
  ) throw new EconomyError("INVALID_ECONOMY_CONFIG", "경제 설정 파일의 값이 올바르지 않습니다.");
  return config;
}

export function normalizeGrowthConfig(value) {
  if (integer(value?.version, { min: 1 }) === null || !Array.isArray(value?.items)) {
    throw new EconomyError("INVALID_GROWTH_CONFIG", "성장 설정 파일의 구조가 올바르지 않습니다.");
  }
  const items = value.items.map((item) => {
    const id = requireId(item?.id, "INVALID_GROWTH_CONFIG", "성장 항목 ID가 올바르지 않습니다.");
    const label = requireId(item?.label, "INVALID_GROWTH_CONFIG", "성장 항목 이름이 올바르지 않습니다.");
    const baseValue = requireInteger(item?.baseValue, "INVALID_GROWTH_CONFIG", "성장 기본값이 올바르지 않습니다.");
    const valuePerLevel = requireInteger(item?.valuePerLevel, "INVALID_GROWTH_CONFIG", "성장 증가값이 올바르지 않습니다.", { min: 1 });
    const maxLevel = requireInteger(item?.maxLevel, "INVALID_GROWTH_CONFIG", "성장 최대 단계가 올바르지 않습니다.", { min: 1 });
    if (!Array.isArray(item.costs) || item.costs.length !== maxLevel) {
      throw new EconomyError("INVALID_GROWTH_CONFIG", `${label}의 단계별 비용 수가 맞지 않습니다.`);
    }
    const costs = item.costs.map((cost) => requireInteger(
      cost,
      "INVALID_GROWTH_CONFIG",
      `${label}의 단계별 비용이 올바르지 않습니다.`,
      { min: 1 },
    ));
    return { id, label, baseValue, valuePerLevel, maxLevel, costs };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new EconomyError("INVALID_GROWTH_CONFIG", "성장 항목 ID가 중복되었습니다.");
  }
  return { version: value.version, items };
}

function growthItem(config, id) {
  const item = config.items.find((candidate) => candidate.id === id);
  if (!item) throw new EconomyError("UNKNOWN_GROWTH", "알 수 없는 성장 항목입니다.");
  if (!Object.hasOwn({ maxHp: true, maxGuard: true }, id)) {
    throw new EconomyError("UNSUPPORTED_GROWTH", "현재 프로필에서 지원하지 않는 성장 항목입니다.");
  }
  return item;
}

export function growthQuote(profile, growthConfig, id) {
  const config = normalizeGrowthConfig(growthConfig);
  const item = growthItem(config, id);
  const level = requireInteger(profile?.growth?.[id], "INVALID_GROWTH_LEVEL", "저장된 성장 단계가 올바르지 않습니다.");
  if (level > item.maxLevel) throw new EconomyError("INVALID_GROWTH_LEVEL", "저장된 성장 단계가 최대 단계를 넘었습니다.");
  return {
    id,
    label: item.label,
    level,
    maxLevel: item.maxLevel,
    currentValue: item.baseValue + level * item.valuePerLevel,
    nextValue: level < item.maxLevel ? item.baseValue + (level + 1) * item.valuePerLevel : null,
    cost: level < item.maxLevel ? item.costs[level] : null,
    maxed: level >= item.maxLevel,
  };
}

function ensureLobby(profile) {
  if (profile.activeRun) throw new EconomyError("RUN_ACTIVE", "진행 중인 모험이 있어 로비 거래를 할 수 없습니다.");
}

export function applyCarrySelection(profile, economyConfig, count) {
  ensureLobby(profile);
  const config = normalizeEconomyConfig(economyConfig);
  const carry = requireInteger(count, "INVALID_CARRY", "구매 새로고침 횟수가 올바르지 않습니다.");
  const available = Math.min(config.reroll.carryLimit, profile.wallet.rerollTickets);
  if (carry > available) throw new EconomyError("CARRY_UNAVAILABLE", "보유량 또는 반입 한도를 넘었습니다.");
  profile.preparation.carryTickets = carry;
  return { carryTickets: carry, available };
}

export function applyWeaponSelection(profile, weaponId, validWeaponIds = null) {
  ensureLobby(profile);
  const weapon = requireId(weaponId, "INVALID_WEAPON_ID", "무기 ID가 올바르지 않습니다.");
  if (validWeaponIds && !new Set(validWeaponIds).has(weapon)) {
    throw new EconomyError("UNKNOWN_WEAPON", "알 수 없는 무기는 준비할 수 없습니다.");
  }
  profile.preparation.weaponId = weapon;
  return { weaponId: weapon };
}

export function applyTicketPurchase(profile, economyConfig, quantity = 1) {
  ensureLobby(profile);
  const config = normalizeEconomyConfig(economyConfig);
  const count = requireInteger(quantity, "INVALID_QUANTITY", "구매 수량이 올바르지 않습니다.", { min: 1 });
  const cost = config.reroll.ticketPriceShards * count;
  if (!Number.isSafeInteger(cost)) throw new EconomyError("VALUE_OVERFLOW", "구매 비용이 허용 범위를 넘었습니다.");
  if (profile.wallet.shards < cost) throw new EconomyError("INSUFFICIENT_SHARDS", "파편이 부족합니다.");
  profile.wallet.shards -= cost;
  profile.wallet.rerollTickets = safeAdd(profile.wallet.rerollTickets, count);
  return {
    quantity: count,
    cost,
    shardBalance: profile.wallet.shards,
    ticketBalance: profile.wallet.rerollTickets,
  };
}

export function applyGrowthPurchase(profile, growthConfig, id) {
  ensureLobby(profile);
  const config = normalizeGrowthConfig(growthConfig);
  const quote = growthQuote(profile, config, id);
  if (quote.maxed) throw new EconomyError("GROWTH_MAXED", "이미 최대 단계입니다.");
  if (profile.wallet.shards < quote.cost) throw new EconomyError("INSUFFICIENT_SHARDS", "파편이 부족합니다.");
  profile.wallet.shards -= quote.cost;
  profile.growth[id] += 1;
  return {
    ...growthQuote(profile, config, id),
    purchasedLevel: profile.growth[id],
    purchasedValue: quote.nextValue,
    paid: quote.cost,
    shardBalance: profile.wallet.shards,
  };
}

function emptyRunSummary() {
  return { stage: 1, score: 0, floorsCollapsed: 0, bestCombo: 0, attackCount: 0, skillCount: 0 };
}

export function applyRunStart(profile, economyConfig, { runId, ownerId, weaponId, now }) {
  ensureLobby(profile);
  const config = normalizeEconomyConfig(economyConfig);
  const id = requireId(runId, "INVALID_RUN_ID", "모험 ID가 올바르지 않습니다.");
  if (profile.lastSettlement?.runId === id) {
    throw new EconomyError("RUN_ID_REUSED", "이미 정산된 모험 ID는 다시 사용할 수 없습니다.");
  }
  const owner = requireId(ownerId, "INVALID_OWNER_ID", "세션 ID가 올바르지 않습니다.");
  const weapon = requireId(weaponId, "INVALID_WEAPON_ID", "무기 ID가 올바르지 않습니다.");
  if (!profile.unlocked.includes(weapon)) {
    throw new EconomyError("WEAPON_LOCKED", "아직 해금되지 않은 무기로 모험을 시작할 수 없습니다.");
  }
  const timestamp = requireInteger(now, "INVALID_TIME", "모험 시작 시간이 올바르지 않습니다.");
  const reserved = Math.min(
    profile.preparation.carryTickets,
    profile.wallet.rerollTickets,
    config.reroll.carryLimit,
  );
  profile.wallet.rerollTickets -= reserved;
  profile.preparation.weaponId = weapon;
  profile.activeRun = {
    id,
    ownerId: owner,
    status: "active",
    startedAt: timestamp,
    updatedAt: timestamp,
    rulesVersion: config.version,
    weaponId: weapon,
    shardsEarned: 0,
    freeRerollsRemaining: config.reroll.freePerRun,
    purchasedTicketsReserved: reserved,
    purchasedTicketsRemaining: reserved,
    purchasedTicketsSpent: 0,
    rerollSequence: 0,
    lastReroll: null,
    growthLevels: clone(profile.growth),
    summary: emptyRunSummary(),
  };
  return { run: clone(profile.activeRun), reservedTickets: reserved };
}

function activeRun(profile, runId, ownerId = null, allowForeign = false) {
  const run = profile.activeRun;
  if (!run) throw new EconomyError("NO_ACTIVE_RUN", "진행 중인 모험이 없습니다.");
  if (runId && run.id !== runId) throw new EconomyError("RUN_ID_MISMATCH", "다른 모험의 기록은 변경할 수 없습니다.");
  if (!allowForeign && ownerId && run.ownerId !== ownerId) {
    throw new EconomyError("RUN_OWNED_BY_OTHER_SESSION", "다른 탭에서 진행 중인 모험입니다.");
  }
  return run;
}

function applySummary(run, stats = {}) {
  const fields = ["stage", "score", "floorsCollapsed", "bestCombo", "attackCount", "skillCount"];
  for (const field of fields) {
    if (stats[field] === undefined) continue;
    const minimum = field === "stage" ? 1 : 0;
    const value = requireInteger(stats[field], "INVALID_RUN_STATS", `${field} 값이 올바르지 않습니다.`, { min: minimum });
    if (value < run.summary[field]) {
      throw new EconomyError("STALE_RUN_STATS", `${field} 값은 저장된 진행보다 작아질 수 없습니다.`);
    }
    run.summary[field] = value;
  }
}

export function applyRunSync(profile, { runId, ownerId, now, shardsEarned, ...stats }) {
  const run = activeRun(profile, runId, ownerId);
  const timestamp = requireInteger(now, "INVALID_TIME", "모험 저장 시간이 올바르지 않습니다.");
  if (shardsEarned !== undefined) {
    const shards = requireInteger(shardsEarned, "INVALID_SHARDS", "획득 파편 값이 올바르지 않습니다.");
    if (shards < run.shardsEarned) throw new EconomyError("STALE_SHARDS", "획득 파편은 저장된 값보다 작아질 수 없습니다.");
    run.shardsEarned = shards;
  }
  applySummary(run, stats);
  run.updatedAt = Math.max(run.updatedAt, timestamp);
  return { run: clone(run) };
}

export function applyShardAward(profile, { runId, ownerId, now, amount, stats = {} }) {
  const run = activeRun(profile, runId, ownerId);
  const gain = requireInteger(amount, "INVALID_SHARD_AWARD", "파편 획득량이 올바르지 않습니다.", { min: 1 });
  run.shardsEarned = safeAdd(run.shardsEarned, gain);
  applySummary(run, stats);
  run.updatedAt = Math.max(run.updatedAt, requireInteger(now, "INVALID_TIME", "모험 저장 시간이 올바르지 않습니다."));
  return { gained: gain, shardsEarned: run.shardsEarned, run: clone(run) };
}

function normalizeRerollCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) {
    throw new EconomyError("INVALID_REROLL_CARDS", "새로고침 결과는 서로 다른 카드 3장이어야 합니다.");
  }
  const normalized = cards.map((id) => requireId(id, "INVALID_REROLL_CARDS", "새로고침 카드 ID가 올바르지 않습니다."));
  if (new Set(normalized).size !== normalized.length) {
    throw new EconomyError("INVALID_REROLL_CARDS", "새로고침 결과에 같은 카드가 중복되었습니다.");
  }
  return normalized;
}

export function rerollOfferSetSignature(cards) {
  if (!Array.isArray(cards)) {
    throw new EconomyError("INVALID_REROLL_CARDS", "새로고침 카드 목록이 올바르지 않습니다.");
  }
  const ids = cards.map((card) => requireId(
    typeof card === "string" ? card : card?.id,
    "INVALID_REROLL_CARDS",
    "새로고침 카드 ID가 올바르지 않습니다.",
  ));
  return JSON.stringify(ids.sort());
}

export function applyRerollUse(profile, { runId, ownerId, now, cards, minRank = null }) {
  const run = activeRun(profile, runId, ownerId);
  const resultCards = normalizeRerollCards(cards);
  if (minRank !== null && !["rare", "epic"].includes(minRank)) {
    throw new EconomyError("INVALID_REROLL_RANK", "새로고침의 최소 등급 값이 올바르지 않습니다.");
  }
  const timestamp = requireInteger(now, "INVALID_TIME", "새로고침 시간이 올바르지 않습니다.");
  let source = null;
  if (run.freeRerollsRemaining > 0) {
    run.freeRerollsRemaining -= 1;
    source = "free";
  } else if (run.purchasedTicketsRemaining > 0) {
    run.purchasedTicketsRemaining -= 1;
    run.purchasedTicketsSpent += 1;
    source = "purchased";
  } else {
    throw new EconomyError("NO_REROLL_AVAILABLE", "사용할 수 있는 새로고침이 없습니다.");
  }
  run.rerollSequence += 1;
  run.lastReroll = { sequence: run.rerollSequence, cards: resultCards, minRank, at: timestamp };
  run.updatedAt = Math.max(run.updatedAt, timestamp);
  return {
    source,
    sequence: run.rerollSequence,
    freeRemaining: run.freeRerollsRemaining,
    purchasedRemaining: run.purchasedTicketsRemaining,
    cards: [...resultCards],
    minRank,
    run: clone(run),
  };
}

export function applyFreeRerollRefill(profile, economyConfig, { runId, ownerId, now, amount = null }) {
  const config = normalizeEconomyConfig(economyConfig);
  const run = activeRun(profile, runId, ownerId);
  const gain = amount === null ? config.reroll.bossRefillAmount : requireInteger(
    amount,
    "INVALID_REFILL",
    "무료 새로고침 보충량이 올바르지 않습니다.",
  );
  const before = run.freeRerollsRemaining;
  run.freeRerollsRemaining = Math.min(config.reroll.freeRerollCap, safeAdd(before, gain));
  run.updatedAt = Math.max(run.updatedAt, requireInteger(now, "INVALID_TIME", "새로고침 보충 시간이 올바르지 않습니다."));
  return { added: run.freeRerollsRemaining - before, freeRemaining: run.freeRerollsRemaining, run: clone(run) };
}

function commitStatistics(profile, run, unlockedIds = []) {
  const summary = run.summary;
  profile.runs = safeAdd(profile.runs, 1);
  profile.totalScore = safeAdd(profile.totalScore, summary.score);
  profile.totalStages = safeAdd(profile.totalStages, summary.stage);
  profile.totalFloors = safeAdd(profile.totalFloors, summary.floorsCollapsed);
  profile.bestScore = Math.max(profile.bestScore, summary.score);
  profile.bestStage = Math.max(profile.bestStage, summary.stage);
  const previous = profile.perWeapon[run.weaponId] || { runs: 0, bestScore: 0, bestStage: 0 };
  profile.perWeapon[run.weaponId] = {
    runs: safeAdd(previous.runs, 1),
    bestScore: Math.max(previous.bestScore, summary.score),
    bestStage: Math.max(previous.bestStage, summary.stage),
  };
  profile.unlocked = [...new Set([
    ...profile.unlocked,
    ...unlockedIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 128),
  ])];
}

export function settlementUnlockIds(profile, summary, weapons) {
  if (!profile || !summary || !Array.isArray(weapons)) {
    throw new EconomyError("INVALID_UNLOCK_CONTEXT", "정산 해금 계산 정보가 올바르지 않습니다.");
  }
  const projected = {
    runs: safeAdd(profile.runs, 1),
    totalScore: safeAdd(profile.totalScore, requireInteger(summary.score, "INVALID_RUN_STATS", "score 값이 올바르지 않습니다.")),
    totalStages: safeAdd(profile.totalStages, requireInteger(summary.stage, "INVALID_RUN_STATS", "stage 값이 올바르지 않습니다.", { min: 1 })),
    totalFloors: safeAdd(profile.totalFloors, requireInteger(summary.floorsCollapsed, "INVALID_RUN_STATS", "floorsCollapsed 값이 올바르지 않습니다.")),
    bestScore: Math.max(profile.bestScore, summary.score),
    bestStage: Math.max(profile.bestStage, summary.stage),
  };
  const alreadyUnlocked = new Set(profile.unlocked || []);
  const eligible = [];
  for (const weapon of weapons) {
    const id = typeof weapon?.id === "string" ? weapon.id : "";
    if (!id || alreadyUnlocked.has(id)) continue;
    if (!weapon.unlock) {
      eligible.push(id);
      continue;
    }
    const threshold = Number(weapon.unlock.threshold);
    const value = projected[weapon.unlock.stat];
    if (Number.isFinite(threshold) && threshold >= 0 && Number.isFinite(value) && value >= threshold) {
      eligible.push(id);
    }
  }
  return eligible;
}

export function applyRunSettlement(profile, {
  runId,
  ownerId = null,
  now,
  reason,
  stats = {},
  unlockedIds = [],
  allowForeign = false,
}) {
  const id = requireId(runId, "INVALID_RUN_ID", "모험 ID가 올바르지 않습니다.");
  if (!profile.activeRun) {
    if (profile.lastSettlement?.runId === id) {
      const before = new Set(profile.unlocked);
      profile.unlocked = [...new Set([
        ...profile.unlocked,
        ...unlockedIds.filter((unlockId) => typeof unlockId === "string" && unlockId.length > 0 && unlockId.length <= 128),
      ])];
      const unlocksAdded = profile.unlocked.filter((unlockId) => !before.has(unlockId));
      return { alreadySettled: true, receipt: clone(profile.lastSettlement), unlocksAdded };
    }
    throw new EconomyError("NO_ACTIVE_RUN", "정산할 모험이 없습니다.");
  }
  const run = activeRun(profile, id, ownerId, allowForeign);
  const finishReason = requireId(reason, "INVALID_SETTLEMENT_REASON", "종료 사유가 올바르지 않습니다.");
  if (!SETTLEMENT_REASONS.includes(finishReason)) {
    throw new EconomyError("INVALID_SETTLEMENT_REASON", "지원하지 않는 종료 사유입니다.");
  }
  const timestamp = requireInteger(now, "INVALID_TIME", "정산 시간이 올바르지 않습니다.");
  applySummary(run, stats);
  const personalBest = run.summary.score > profile.bestScore;
  const personalBestStage = run.summary.stage > profile.bestStage ? run.summary.stage : null;
  profile.wallet.shards = safeAdd(profile.wallet.shards, run.shardsEarned);
  profile.wallet.rerollTickets = safeAdd(profile.wallet.rerollTickets, run.purchasedTicketsRemaining);
  commitStatistics(profile, run, unlockedIds);
  profile.preparation.carryTickets = Math.min(
    profile.preparation.carryTickets,
    profile.wallet.rerollTickets,
  );
  const receipt = {
    runId: run.id,
    reason: finishReason,
    weaponId: run.weaponId,
    rulesVersion: run.rulesVersion,
    growthLevels: clone(run.growthLevels),
    settledAt: timestamp,
    shardsEarned: run.shardsEarned,
    shardBalance: profile.wallet.shards,
    returnedTickets: run.purchasedTicketsRemaining,
    spentTickets: run.purchasedTicketsSpent,
    ticketBalance: profile.wallet.rerollTickets,
    summary: clone(run.summary),
  };
  profile.activeRun = null;
  profile.lastSettlement = receipt;
  return { alreadySettled: false, receipt: clone(receipt), personalBest, personalBestStage };
}

export function runRecoveryStatus(profile, { ownerId, now, staleAfterMs }) {
  if (!profile?.activeRun) return { kind: "none", run: null, ageMs: 0 };
  const timestamp = requireInteger(now, "INVALID_TIME", "복구 확인 시간이 올바르지 않습니다.");
  const staleMs = requireInteger(staleAfterMs, "INVALID_STALE_WINDOW", "복구 대기 시간이 올바르지 않습니다.", { min: 1000 });
  const run = profile.activeRun;
  const ageMs = Math.max(0, timestamp - run.updatedAt);
  if (run.ownerId === ownerId) return { kind: "owned", run: clone(run), ageMs };
  if (ageMs >= staleMs) return { kind: "stale", run: clone(run), ageMs };
  return { kind: "foreign-active", run: clone(run), ageMs, retryAfterMs: staleMs - ageMs };
}

export function validateProfileGrowthBounds(profile, growthConfig) {
  const config = normalizeGrowthConfig(growthConfig);
  for (const item of config.items) {
    const level = requireInteger(
      profile?.growth?.[item.id],
      "INVALID_GROWTH_LEVEL",
      `${item.label} 단계가 올바르지 않습니다.`,
    );
    if (level > item.maxLevel) {
      throw new EconomyError("GROWTH_LEVEL_EXCEEDS_MAX", `${item.label} 단계가 최대 단계를 넘었습니다.`);
    }
    if (profile?.activeRun) {
      const runLevel = requireInteger(
        profile.activeRun.growthLevels?.[item.id],
        "INVALID_GROWTH_LEVEL",
        `진행 중인 모험의 ${item.label} 단계가 올바르지 않습니다.`,
      );
      if (runLevel > item.maxLevel) {
        throw new EconomyError("GROWTH_LEVEL_EXCEEDS_MAX", `진행 중인 모험의 ${item.label} 단계가 최대 단계를 넘었습니다.`);
      }
    }
    if (profile?.lastSettlement) {
      const settledLevel = requireInteger(
        profile.lastSettlement.growthLevels?.[item.id],
        "INVALID_GROWTH_LEVEL",
        `마지막 정산의 ${item.label} 단계가 올바르지 않습니다.`,
      );
      if (settledLevel > item.maxLevel) {
        throw new EconomyError("GROWTH_LEVEL_EXCEEDS_MAX", `마지막 정산의 ${item.label} 단계가 최대 단계를 넘었습니다.`);
      }
    }
  }
  return true;
}

export function validateProfileEconomyBounds(profile, economyConfig) {
  const config = normalizeEconomyConfig(economyConfig);
  const carry = requireInteger(
    profile?.preparation?.carryTickets,
    "INVALID_CARRY",
    "저장된 구매 새로고침 횟수가 올바르지 않습니다.",
  );
  if (carry > config.reroll.carryLimit) {
    throw new EconomyError("CARRY_EXCEEDS_LIMIT", "저장된 구매 새로고침 횟수가 한도를 넘었습니다.");
  }
  if (!profile.activeRun && carry > profile.wallet.rerollTickets) {
    throw new EconomyError("CARRY_EXCEEDS_STOCK", "저장된 구매 새로고침 횟수가 보유 수량을 넘었습니다.");
  }
  if (profile.activeRun) {
    const run = profile.activeRun;
    if (profile.lastSettlement?.runId === run.id) {
      throw new EconomyError("ACTIVE_RUN_ALREADY_SETTLED", "이미 정산된 모험이 진행 중으로 저장되어 있습니다.");
    }
    if (run.freeRerollsRemaining > config.reroll.freeRerollCap) {
      throw new EconomyError("FREE_REROLLS_EXCEED_CAP", "진행 중인 모험의 무료 새로고침 수가 상한을 넘었습니다.");
    }
    if (run.purchasedTicketsReserved > config.reroll.carryLimit) {
      throw new EconomyError("RESERVED_TICKETS_EXCEED_LIMIT", "진행 중인 모험의 구매 새로고침 횟수가 한도를 넘었습니다.");
    }
  }
  if (profile.lastSettlement && !SETTLEMENT_REASONS.includes(profile.lastSettlement.reason)) {
    throw new EconomyError("INVALID_SETTLEMENT_REASON", "마지막 정산의 종료 사유가 올바르지 않습니다.");
  }
  return true;
}

function fallbackId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sessionOwner(sessionStorage, idFactory, navigationType) {
  try {
    const existing = sessionStorage?.getItem(PROFILE_SESSION_KEY);
    // A normal reload keeps its owner so it can recover immediately. Duplicated
    // tabs inherit sessionStorage but start a new navigation, so they receive a
    // new owner instead of settling the source tab's live run.
    if (existing && navigationType === "reload") return existing;
    const created = idFactory();
    sessionStorage?.setItem(PROFILE_SESSION_KEY, created);
    return created;
  } catch {
    return idFactory();
  }
}

function browserStorage(name) {
  try { return globalThis[name] || null; } catch { return null; }
}

export function createProfileService(options = {}) {
  const {
    storage = browserStorage("localStorage"),
    sessionStorage = browserStorage("sessionStorage"),
    economy,
    growth,
    now = () => Date.now(),
    idFactory = fallbackId,
    navigationType = globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type || "navigate",
    validWeaponIds = null,
    defaultWeaponId = "chokento",
  } = options;
  // Shared browser storage is read-only unless the caller explicitly proves it
  // owns the app-level writer lease. This keeps the public synchronous API from
  // silently creating an uncoordinated second writer.
  const writable = Object.hasOwn(options, "writable")
    ? options.writable === true
    : storage !== browserStorage("localStorage");
  const economyConfig = normalizeEconomyConfig(economy);
  const growthConfig = normalizeGrowthConfig(growth);
  const ownerId = sessionOwner(sessionStorage, idFactory, navigationType);
  const repository = createProfileRepository({ storage, validWeaponIds, defaultWeaponId, writable });

  const invalidProfileResult = (profile, error) => ({
    ok: false,
    profile,
    error: { code: error.code || "INVALID_PROFILE", message: error.message },
  });
  const checkProfile = (result) => {
    if (!result.ok) return result;
    try {
      validateProfileGrowthBounds(result.profile, growthConfig);
      validateProfileEconomyBounds(result.profile, economyConfig);
      return result;
    } catch (error) {
      return invalidProfileResult(result.profile, error);
    }
  };
  const refresh = () => checkProfile(repository.refresh());
  const finish = (result) => {
    if (!result.ok) return result;
    return {
      ok: true,
      profile: result.profile,
      ...(result.value || {}),
      backupSaved: result.backupSaved,
      readbackVerified: result.readbackVerified,
      unchanged: result.unchanged === true,
    };
  };
  const mutate = (fn) => finish(repository.transact((profile) => {
    validateProfileGrowthBounds(profile, growthConfig);
    validateProfileEconomyBounds(profile, economyConfig);
    return fn(profile);
  }));
  const currentRunId = () => {
    const profile = repository.get();
    return profile?.activeRun?.id || profile?.lastSettlement?.runId || null;
  };

  function recoveryStatus() {
    const refreshed = refresh();
    if (!refreshed.ok) return refreshed;
    try {
      return {
        ok: true,
        profile: refreshed.profile,
        ...runRecoveryStatus(refreshed.profile, {
          ownerId,
          now: now(),
          staleAfterMs: economyConfig.recovery.staleAfterMs,
        }),
      };
    } catch (error) {
      return { ok: false, profile: refreshed.profile, error: { code: error.code, message: error.message } };
    }
  }

  function settle({ reason, stats = {}, unlockedIds = [], runId = currentRunId(), allowForeign = false } = {}) {
    return mutate((profile) => applyRunSettlement(profile, {
      runId,
      ownerId,
      now: now(),
      reason,
      stats,
      unlockedIds,
      allowForeign,
    }));
  }

  refresh(); // Validate migrated or loaded growth before exposing the service.

  return {
    ownerId,
    economy: clone(economyConfig),
    growth: clone(growthConfig),
    get: () => refresh(),
    snapshot: () => {
      const result = refresh();
      return result.ok ? result.profile : null;
    },
    status: () => {
      const current = refresh();
      if (!current.ok) return current;
      const base = repository.status();
      if (!base.ok) return base;
      return { ok: true, source: base.source, writable: base.writable };
    },
    refresh,
    recoveryStatus,
    setWeapon: (weaponId) => mutate((profile) => applyWeaponSelection(profile, weaponId, validWeaponIds)),
    setCarry: (count) => mutate((profile) => applyCarrySelection(profile, economyConfig, count)),
    buyTicket: (quantity = 1) => mutate((profile) => applyTicketPurchase(profile, economyConfig, quantity)),
    buyGrowth: (id) => mutate((profile) => applyGrowthPurchase(profile, growthConfig, id)),
    growthQuote: (id) => {
      const result = refresh();
      if (!result.ok) return result;
      try {
        return { ok: true, profile: result.profile, quote: growthQuote(result.profile, growthConfig, id) };
      } catch (error) {
        return invalidProfileResult(result.profile, error);
      }
    },
    startRun: ({ weaponId, runId = idFactory() }) => mutate((profile) => applyRunStart(profile, economyConfig, {
      runId,
      ownerId,
      weaponId,
      now: now(),
    })),
    syncRun: ({ runId = currentRunId(), ...state } = {}) => mutate((profile) => applyRunSync(profile, {
      runId,
      ownerId,
      now: now(),
      ...state,
    })),
    touchRun: ({ runId = currentRunId() } = {}) => mutate((profile) => applyRunSync(profile, {
      runId,
      ownerId,
      now: now(),
    })),
    awardShards: (amount, { runId = currentRunId(), stats = {} } = {}) => mutate((profile) => applyShardAward(profile, {
      runId,
      ownerId,
      now: now(),
      amount,
      stats,
    })),
    useReroll: ({ runId = currentRunId(), cards, minRank = null } = {}) => mutate((profile) => applyRerollUse(profile, {
      runId,
      ownerId,
      now: now(),
      cards,
      minRank,
    })),
    refillFreeReroll: ({ runId = currentRunId(), amount = null } = {}) => mutate((profile) => applyFreeRerollRefill(profile, economyConfig, {
      runId,
      ownerId,
      now: now(),
      amount,
    })),
    settleRun: settle,
    abandonRun: ({ reason = "quit", stats = {}, unlockedIds = [], runId = currentRunId() } = {}) => settle({
      reason,
      stats,
      unlockedIds,
      runId,
    }),
    recoverOwnedOrStaleRun: ({ unlockedIds = [] } = {}) => {
      const status = recoveryStatus();
      if (!status.ok) return status;
      if (status.kind === "none") return { ok: true, profile: status.profile, recovered: false, kind: "none" };
      if (status.kind === "foreign-active") {
        return {
          ok: false,
          profile: status.profile,
          kind: status.kind,
          retryAfterMs: status.retryAfterMs,
          error: { code: "RUN_ACTIVE_ELSEWHERE", message: "다른 탭에서 모험이 진행 중입니다." },
        };
      }
      const expectedRunId = status.run.id;
      const result = mutate((profile) => {
        if (!profile.activeRun) {
          const settled = applyRunSettlement(profile, {
            runId: expectedRunId,
            ownerId,
            now: now(),
            reason: "recovery",
            unlockedIds,
          });
          return { ...settled, recovered: false, kind: "none" };
        }
        if (profile.activeRun.id !== expectedRunId) {
          throw new EconomyError("RUN_ID_MISMATCH", "복구를 확인한 뒤 다른 모험이 시작되었습니다.");
        }
        const freshStatus = runRecoveryStatus(profile, {
          ownerId,
          now: now(),
          staleAfterMs: economyConfig.recovery.staleAfterMs,
        });
        if (freshStatus.kind === "foreign-active") {
          throw new EconomyError("RUN_ACTIVE_ELSEWHERE", "다른 탭에서 모험이 다시 활성화되었습니다.");
        }
        const settled = applyRunSettlement(profile, {
          runId: expectedRunId,
          ownerId,
          now: now(),
          reason: "recovery",
          unlockedIds,
          allowForeign: freshStatus.kind === "stale",
        });
        return { ...settled, recovered: true, kind: freshStatus.kind };
      });
      return result;
    },
  };
}
