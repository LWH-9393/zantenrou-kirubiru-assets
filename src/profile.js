export const PROFILE_V1_KEY = "monsterday.profile.v1";
export const PROFILE_V2_KEY = "monsterday.profile.v2";
export const PROFILE_V2_BACKUP_KEY = "monsterday.profile.v2.backup";
export const PROFILE_V2_MIGRATION_KEY = "monsterday.profile.v2.migrated";
export const PROFILE_V2_LOCK_NAME = "monsterday.profile.v2.writer";

const PROFILE_VERSION = 2;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

export class ProfileError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "ProfileError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function strictInteger(value, { min = 0, max = MAX_COUNTER } = {}) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function legacyCounter(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(MAX_COUNTER, Math.round(number));
}

function validId(value, fallback = null) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : fallback;
}

function allowedId(value, validIds, fallback = null) {
  const id = validId(value);
  if (!id) return fallback;
  return validIds && !validIds.has(id) ? fallback : id;
}

function normalizeWeaponStats(value) {
  if (!isRecord(value)) return null;
  const runs = strictInteger(value.runs);
  const bestScore = strictInteger(value.bestScore);
  const bestStage = strictInteger(value.bestStage);
  if ([runs, bestScore, bestStage].includes(null)) return null;
  return { runs, bestScore, bestStage };
}

function normalizeSummary(value) {
  if (!isRecord(value)) return null;
  const summary = {
    stage: strictInteger(value.stage, { min: 1 }),
    score: strictInteger(value.score),
    floorsCollapsed: strictInteger(value.floorsCollapsed),
    bestCombo: strictInteger(value.bestCombo),
    attackCount: strictInteger(value.attackCount),
    skillCount: strictInteger(value.skillCount),
  };
  return Object.values(summary).includes(null) ? null : summary;
}

function normalizeGrowthLevels(value) {
  if (!isRecord(value)) return null;
  const maxHp = strictInteger(value.maxHp);
  const maxGuard = strictInteger(value.maxGuard);
  return maxHp === null || maxGuard === null ? null : { maxHp, maxGuard };
}

function normalizeRerollReceipt(value) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  const sequence = strictInteger(value.sequence, { min: 1 });
  const at = strictInteger(value.at);
  const minRank = value.minRank === null || value.minRank === undefined
    ? null
    : ["rare", "epic"].includes(value.minRank) ? value.minRank : undefined;
  const cards = Array.isArray(value.cards) ? value.cards.map((id) => validId(id)) : null;
  if (
    sequence === null || at === null || minRank === undefined || !cards
    || cards.length !== 3 || cards.some((id) => !id) || new Set(cards).size !== cards.length
  ) return undefined;
  return { sequence, cards, minRank, at };
}

function normalizeActiveRun(value, validWeaponIds) {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const id = validId(value.id);
  const ownerId = validId(value.ownerId);
  const weaponId = allowedId(value.weaponId, validWeaponIds);
  const startedAt = strictInteger(value.startedAt);
  const updatedAt = strictInteger(value.updatedAt);
  const rulesVersion = strictInteger(value.rulesVersion, { min: 1 });
  const shardsEarned = strictInteger(value.shardsEarned);
  const freeRerollsRemaining = strictInteger(value.freeRerollsRemaining);
  const purchasedTicketsReserved = strictInteger(value.purchasedTicketsReserved);
  const purchasedTicketsRemaining = strictInteger(value.purchasedTicketsRemaining);
  const purchasedTicketsSpent = strictInteger(value.purchasedTicketsSpent);
  const rerollSequence = strictInteger(value.rerollSequence);
  const summary = normalizeSummary(value.summary);
  const growthLevels = normalizeGrowthLevels(value.growthLevels);
  const lastReroll = normalizeRerollReceipt(value.lastReroll);
  if (
    !id || !ownerId || !weaponId || startedAt === null || updatedAt === null
    || rulesVersion === null || shardsEarned === null || freeRerollsRemaining === null
    || purchasedTicketsReserved === null || purchasedTicketsRemaining === null
    || purchasedTicketsSpent === null || rerollSequence === null || !summary || !growthLevels
    || lastReroll === undefined || (lastReroll && lastReroll.sequence !== rerollSequence)
    || purchasedTicketsRemaining + purchasedTicketsSpent !== purchasedTicketsReserved
  ) return undefined;
  return {
    id,
    ownerId,
    status: "active",
    startedAt,
    updatedAt,
    rulesVersion,
    weaponId,
    shardsEarned,
    freeRerollsRemaining,
    purchasedTicketsReserved,
    purchasedTicketsRemaining,
    purchasedTicketsSpent,
    rerollSequence,
    lastReroll,
    growthLevels,
    summary,
  };
}

function normalizeSettlement(value, validWeaponIds) {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const runId = validId(value.runId);
  const reason = validId(value.reason);
  const weaponId = allowedId(value.weaponId, validWeaponIds);
  const rulesVersion = strictInteger(value.rulesVersion ?? 1, { min: 1 });
  const growthLevels = normalizeGrowthLevels(value.growthLevels ?? { maxHp: 0, maxGuard: 0 });
  const settledAt = strictInteger(value.settledAt);
  const shardsEarned = strictInteger(value.shardsEarned);
  const shardBalance = strictInteger(value.shardBalance);
  const returnedTickets = strictInteger(value.returnedTickets);
  const spentTickets = strictInteger(value.spentTickets);
  const ticketBalance = strictInteger(value.ticketBalance);
  const summary = normalizeSummary(value.summary);
  if (
    !runId || !reason || !weaponId || rulesVersion === null || !growthLevels
    || settledAt === null || shardsEarned === null
    || shardBalance === null || returnedTickets === null || spentTickets === null
    || ticketBalance === null || !summary
  ) return undefined;
  return {
    runId,
    reason,
    weaponId,
    rulesVersion,
    growthLevels,
    settledAt,
    shardsEarned,
    shardBalance,
    returnedTickets,
    spentTickets,
    ticketBalance,
    summary,
  };
}

export function createEmptyProfileV2({ defaultWeaponId = "chokento" } = {}) {
  return {
    version: PROFILE_VERSION,
    revision: 0,
    runs: 0,
    totalScore: 0,
    totalStages: 0,
    totalFloors: 0,
    bestScore: 0,
    bestStage: 0,
    unlocked: [defaultWeaponId],
    perWeapon: {},
    wallet: { shards: 0, rerollTickets: 0 },
    growth: { maxHp: 0, maxGuard: 0 },
    preparation: { weaponId: defaultWeaponId, carryTickets: 0 },
    activeRun: null,
    lastSettlement: null,
  };
}

export function migrateProfileV1(value, { validWeaponIds = null, defaultWeaponId = "chokento" } = {}) {
  const validIds = validWeaponIds ? new Set(validWeaponIds) : null;
  const source = isRecord(value) ? value : {};
  const profile = createEmptyProfileV2({ defaultWeaponId });
  profile.runs = legacyCounter(source.runs);
  profile.totalScore = legacyCounter(source.totalScore);
  profile.totalStages = legacyCounter(source.totalStages);
  profile.totalFloors = legacyCounter(source.totalFloors);
  profile.bestScore = legacyCounter(source.bestScore);
  profile.bestStage = legacyCounter(source.bestStage);
  const unlocked = Array.isArray(source.unlocked) ? source.unlocked : [];
  profile.unlocked = [...new Set([
    defaultWeaponId,
    ...unlocked.filter((id) => allowedId(id, validIds)),
  ])];
  if (isRecord(source.perWeapon)) {
    for (const [id, stats] of Object.entries(source.perWeapon)) {
      if (!allowedId(id, validIds) || !isRecord(stats)) continue;
      profile.perWeapon[id] = {
        runs: legacyCounter(stats.runs),
        bestScore: legacyCounter(stats.bestScore),
        bestStage: legacyCounter(stats.bestStage),
      };
    }
  }
  return profile;
}

export function normalizeProfileV2(value, { validWeaponIds = null, defaultWeaponId = "chokento" } = {}) {
  if (!isRecord(value) || value.version !== PROFILE_VERSION) return null;
  const validIds = validWeaponIds ? new Set(validWeaponIds) : null;
  const revision = strictInteger(value.revision);
  const counters = ["runs", "totalScore", "totalStages", "totalFloors", "bestScore", "bestStage"];
  const normalizedCounters = Object.fromEntries(counters.map((key) => [key, strictInteger(value[key])]));
  if (revision === null || Object.values(normalizedCounters).includes(null)) return null;
  if (!Array.isArray(value.unlocked) || !isRecord(value.perWeapon)) return null;
  const unlocked = [...new Set([
    defaultWeaponId,
    ...value.unlocked.map((id) => allowedId(id, validIds)).filter(Boolean),
  ])];
  const perWeapon = {};
  for (const [id, stats] of Object.entries(value.perWeapon)) {
    const weaponId = allowedId(id, validIds);
    const normalized = normalizeWeaponStats(stats);
    if (!weaponId || !normalized) return null;
    perWeapon[weaponId] = normalized;
  }
  if (!isRecord(value.wallet) || !isRecord(value.preparation)) return null;
  const shards = strictInteger(value.wallet.shards);
  const rerollTickets = strictInteger(value.wallet.rerollTickets);
  const growth = normalizeGrowthLevels(value.growth);
  const preparationWeapon = allowedId(value.preparation.weaponId, validIds, defaultWeaponId);
  const carryTickets = strictInteger(value.preparation.carryTickets);
  const activeRun = normalizeActiveRun(value.activeRun, validIds);
  const lastSettlement = normalizeSettlement(value.lastSettlement, validIds);
  if (
    shards === null || rerollTickets === null || !growth || !preparationWeapon
    || carryTickets === null || activeRun === undefined || lastSettlement === undefined
  ) return null;
  return {
    version: PROFILE_VERSION,
    revision,
    ...normalizedCounters,
    unlocked,
    perWeapon,
    wallet: { shards, rerollTickets },
    growth,
    preparation: { weaponId: preparationWeapon, carryTickets },
    activeRun,
    lastSettlement,
  };
}

function parseJson(raw) {
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function storageGet(storage, key) {
  try { return storage.getItem(key); } catch (error) {
    throw new ProfileError("STORAGE_READ_FAILED", `저장 데이터 ${key}를 읽지 못했습니다.`, error);
  }
}

function storageSet(storage, key, value) {
  try { storage.setItem(key, value); } catch (error) {
    throw new ProfileError("STORAGE_WRITE_FAILED", `저장 데이터 ${key}를 기록하지 못했습니다.`, error);
  }
}

export function loadProfileRecord({ storage, validWeaponIds = null, defaultWeaponId = "chokento" }) {
  if (!storage) throw new ProfileError("STORAGE_UNAVAILABLE", "프로필 저장소를 사용할 수 없습니다.");
  const options = { validWeaponIds, defaultWeaponId };
  const primaryRaw = storageGet(storage, PROFILE_V2_KEY);
  const backupRaw = storageGet(storage, PROFILE_V2_BACKUP_KEY);
  const primary = normalizeProfileV2(parseJson(primaryRaw), options);
  if (primary) return { profile: primary, source: "v2", needsPersist: false };
  const backup = normalizeProfileV2(parseJson(backupRaw), options);
  if (backup) return { profile: backup, source: "backup", needsPersist: true };
  if (primaryRaw !== null || backupRaw !== null) {
    throw new ProfileError("PROFILE_V2_CORRUPT", "프로필 v2와 백업이 모두 손상되었습니다.");
  }
  if (storageGet(storage, PROFILE_V2_MIGRATION_KEY) !== null) {
    throw new ProfileError("PROFILE_V2_MISSING", "이전된 프로필 v2가 사라져 자동 초기화를 중단했습니다.");
  }
  const legacyRaw = storageGet(storage, PROFILE_V1_KEY);
  const legacy = parseJson(legacyRaw);
  if (legacyRaw !== null && !isRecord(legacy)) {
    throw new ProfileError("PROFILE_V1_CORRUPT", "기존 프로필 v1이 손상되어 자동 이전을 중단했습니다.");
  }
  const profile = migrateProfileV1(legacy, options);
  return { profile, source: legacy ? "v1" : "empty", needsPersist: true };
}

export function writeProfileRecord({ storage, profile, validWeaponIds = null, defaultWeaponId = "chokento" }) {
  if (!storage) throw new ProfileError("STORAGE_UNAVAILABLE", "프로필 저장소를 사용할 수 없습니다.");
  const options = { validWeaponIds, defaultWeaponId };
  const normalized = normalizeProfileV2(profile, options);
  if (!normalized) throw new ProfileError("PROFILE_V2_INVALID", "유효하지 않은 프로필 v2는 저장할 수 없습니다.");
  const serialized = JSON.stringify(normalized);
  const currentRaw = storageGet(storage, PROFILE_V2_KEY);
  const current = normalizeProfileV2(parseJson(currentRaw), options);
  if (current) storageSet(storage, PROFILE_V2_BACKUP_KEY, JSON.stringify(current));
  storageSet(storage, PROFILE_V2_KEY, serialized);
  let verified = normalized;
  let readbackVerified = false;
  try {
    const readback = normalizeProfileV2(parseJson(storageGet(storage, PROFILE_V2_KEY)), options);
    if (!readback || JSON.stringify(readback) !== serialized) {
      throw new ProfileError("STORAGE_VERIFY_FAILED", "저장한 프로필을 다시 확인하지 못했습니다.");
    }
    verified = readback;
    readbackVerified = true;
  } catch (error) {
    // localStorage.setItem is synchronous. Once it returns, retrying the same
    // purchase after a transient read failure can charge twice. Keep the
    // write-confirmed value and let the next operation fail closed on refresh.
    if (!(error instanceof ProfileError) || error.code !== "STORAGE_READ_FAILED") throw error;
  }
  let backupSaved = true;
  try { storageSet(storage, PROFILE_V2_BACKUP_KEY, serialized); } catch { backupSaved = false; }
  try { storageSet(storage, PROFILE_V2_MIGRATION_KEY, "1"); } catch { /* primary remains canonical */ }
  return { profile: verified, backupSaved, readbackVerified };
}

function sharedBrowserStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function createProfileRepository(options = {}) {
  const {
    storage = sharedBrowserStorage(),
    validWeaponIds = null,
    defaultWeaponId = "chokento",
    lockManager = globalThis.navigator?.locks,
  } = options;
  // The browser's shared localStorage is unsafe for an implicit synchronous
  // writer: two tabs can both pass an optimistic revision check before either
  // setItem is visible to the other. The app opts in only after main.js holds
  // its lifetime Web Lock. Custom stores (unit tests, isolated tools) keep the
  // former single-owner default.
  const writable = Object.hasOwn(options, "writable")
    ? options.writable === true
    : storage !== sharedBrowserStorage();
  const recordOptions = { storage, validWeaponIds, defaultWeaponId };
  let profile = null;
  let loadError = null;
  let loadSource = null;
  try {
    const loaded = loadProfileRecord(recordOptions);
    profile = loaded.profile;
    loadSource = loaded.source;
    if (loaded.needsPersist && writable) profile = writeProfileRecord({ ...recordOptions, profile }).profile;
  } catch (error) {
    loadError = error instanceof ProfileError ? error : new ProfileError("PROFILE_LOAD_FAILED", error.message, error);
  }

  const failure = (error) => ({
    ok: false,
    profile: profile ? clone(profile) : null,
    error: { code: error.code || "PROFILE_ERROR", message: error.message },
  });

  function refresh() {
    try {
      const loaded = loadProfileRecord(recordOptions);
      profile = loaded.profile;
      loadError = null;
      loadSource = loaded.source;
      if (loaded.needsPersist && writable) profile = writeProfileRecord({ ...recordOptions, profile }).profile;
      return { ok: true, profile: clone(profile), source: loaded.source };
    } catch (error) {
      loadError = error;
      return failure(error);
    }
  }

  function transact(mutator) {
    if (!writable) {
      return failure(new ProfileError("PROFILE_READ_ONLY", "다른 탭이 프로필을 사용 중이어서 변경할 수 없습니다."));
    }
    const current = refresh();
    if (!current.ok) return current;
    const base = current.profile;
    const draft = clone(base);
    try {
      const value = mutator(draft);
      if (JSON.stringify(draft) === JSON.stringify(base)) {
        return {
          ok: true,
          profile: clone(base),
          value,
          backupSaved: true,
          readbackVerified: true,
          unchanged: true,
        };
      }
      const latestRaw = storageGet(storage, PROFILE_V2_KEY);
      const latest = normalizeProfileV2(parseJson(latestRaw), { validWeaponIds, defaultWeaponId });
      if (!latest || JSON.stringify(latest) !== JSON.stringify(base)) {
        return failure(new ProfileError("PROFILE_CONFLICT", "다른 탭에서 프로필이 변경되어 다시 시도해야 합니다."));
      }
      draft.version = PROFILE_VERSION;
      draft.revision = base.revision + 1;
      const saved = writeProfileRecord({ ...recordOptions, profile: draft });
      profile = saved.profile;
      return {
        ok: true,
        profile: clone(profile),
        value,
        backupSaved: saved.backupSaved,
        readbackVerified: saved.readbackVerified,
      };
    } catch (error) {
      return failure(error instanceof ProfileError ? error : new ProfileError(error.code || "PROFILE_TRANSACTION_FAILED", error.message, error));
    }
  }

  async function transactExclusive(mutator) {
    if (!lockManager?.request) return transact(mutator);
    return lockManager.request(PROFILE_V2_LOCK_NAME, { mode: "exclusive" }, () => transact(mutator));
  }

  return {
    get: () => profile ? clone(profile) : null,
    status: () => loadError
      ? { ok: false, source: loadSource, error: { code: loadError.code, message: loadError.message } }
      : { ok: true, source: loadSource, writable },
    refresh,
    transact,
    transactExclusive,
  };
}
