// One definition owns a monster's identity, approved illustration and combat
// defaults. Encounter modifiers belong to stages.json, never to the sprite name.
function freezeTree(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

export const BODY_TIERS = freezeTree([
  { name: "soft", label: "연한 몸통", originalType: 1, hp: 100, attack: 15, score: 80, shard: 3, color: "#91deb0" },
  { name: "normal", label: "보통 몸통", originalType: 2, hp: 200, attack: 25, score: 130, shard: 5, color: "#ffd36a" },
  { name: "hard", label: "단단한 몸통", originalType: 3, hp: 300, attack: 40, score: 210, shard: 8, color: "#ff8a8f" },
]);

// Ordinary species deliberately share the established balance. The storm boss
// has explicit HP and row-skill resistance so its debris encounter can play out.
// Apply in order: these defaults -> stage growth -> encounter overrides/caps.
export const SHARED_BODY_PROFILE = freezeTree({
  tiers: BODY_TIERS,
  rows: { base: 5, growthEveryStages: 3, maximumGrowth: 12, randomRange: 3 },
  fall: { basePixelsPerFrame: 0.85, growthPerStage: 0.045, maximumPixelsPerFrame: 2.2 },
  hp: { growthAfterStageIndex: 9, growthPerStage: 10 },
  contact: { growthPerStage: 0.02, maximumMultiplier: 2.5, multiplier: 1 },
  rewards: { scoreMultiplier: 1, shardMultiplier: 1 },
});

const commonEncounters = ["normal", "rush", "armored", "elite", "treasure"];
const commonBehavior = { descent: "constant", entrance: "once", hazardPattern: null };

export const MONSTER_DEFINITIONS = freezeTree({
  slime: {
    id: "slime", name: "슬라임", spriteKey: "monster_slime_v2", artKind: "slime",
    sourceBounds: { x: 33, y: 32, w: 782, h: 898 },
    bodyProfile: SHARED_BODY_PROFILE, encounterTypes: commonEncounters, behavior: commonBehavior,
    palette: { body: "#58b987", debris: ["#b8df6b", "#79b84a", "#e7f6a8"] },
  },
  mushroom: {
    id: "mushroom", name: "버섯", spriteKey: "monster_mushroom_v2", artKind: "mushroom",
    sourceBounds: { x: 127, y: 173, w: 403, h: 382 },
    bodyProfile: SHARED_BODY_PROFILE, encounterTypes: commonEncounters, behavior: commonBehavior,
    palette: { body: "#d97868", debris: ["#e9785c", "#f3d8ad", "#8cad55"] },
  },
  ghost: {
    id: "ghost", name: "유령", spriteKey: "monster_ghost_v2", artKind: "ghost",
    sourceBounds: { x: 59, y: 175, w: 417, h: 381 },
    bodyProfile: SHARED_BODY_PROFILE, encounterTypes: commonEncounters, behavior: commonBehavior,
    palette: { body: "#77b8d8", debris: ["#dff5ff", "#9fdcff", "#779fc6"] },
  },
  golem: {
    id: "golem", name: "돌정령", spriteKey: "monster_golem_v2", artKind: "golem",
    // Excludes the unrelated partial blue character at source-right.
    sourceBounds: { x: 79, y: 94, w: 431, h: 343 },
    bodyProfile: SHARED_BODY_PROFILE, encounterTypes: commonEncounters, behavior: commonBehavior,
    palette: { body: "#7e8798", debris: ["#a9a28f", "#6f7568", "#7ea05d"] },
  },
  storm_cloud: {
    id: "storm_cloud", name: "구름 보스", spriteKey: "monster_boss_storm_v2", artKind: "boss",
    sourceBounds: { x: 83, y: 83, w: 661, h: 449 },
    bodyProfile: { ...SHARED_BODY_PROFILE, hp: { ...SHARED_BODY_PROFILE.hp, multiplier: 4 } }, encounterTypes: ["boss"],
    behavior: {
      descent: "constant", entrance: "once", hazardPattern: "falling_debris",
      rowSkillDamageRatios: { chokento: 0.45, axe: 0.6, spear: 0.6 },
    },
    palette: { body: "#64739f", debris: ["#64739f", "#354369", "#e8b34b"] },
  },
});

export const NORMAL_MONSTER_IDS = Object.freeze(["slime", "mushroom", "ghost", "golem"]);

export function getMonsterDefinition(idOrDefinition) {
  const id = typeof idOrDefinition === "string" ? idOrDefinition : idOrDefinition?.id;
  const definition = Object.hasOwn(MONSTER_DEFINITIONS, id) ? MONSTER_DEFINITIONS[id] : null;
  if (!definition) throw new Error(`몬스터 정의가 없습니다: ${id ?? "ID 누락"}`);
  return definition;
}

// Art-kind lookup remains explicit for asset preflight and existing QA tools.
// It is not a gameplay identity fallback (the boss identity is storm_cloud).
export function getMonsterDefinitionForArtKind(artKind) {
  const definition = Object.values(MONSTER_DEFINITIONS).find((item) => item.artKind === artKind);
  if (!definition) throw new Error(`몬스터 원화 정의가 없습니다: ${artKind}`);
  return definition;
}

export function assertMonsterEncounter(definitionOrId, encounterType) {
  const definition = getMonsterDefinition(definitionOrId);
  if (!definition.encounterTypes.includes(encounterType)) {
    throw new Error(`허용되지 않은 몬스터 전투 조합: ${definition.id}/${encounterType}`);
  }
  return definition;
}

export function selectMonsterDefinition(stageIndex, waveIndex = 0, encounterType = "normal") {
  const index = ((stageIndex + waveIndex) % NORMAL_MONSTER_IDS.length + NORMAL_MONSTER_IDS.length)
    % NORMAL_MONSTER_IDS.length;
  const id = encounterType === "boss" ? "storm_cloud" : NORMAL_MONSTER_IDS[index];
  return assertMonsterEncounter(id, encounterType);
}
