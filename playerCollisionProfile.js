export const PLAYER_COLLISION_PROFILE_VERSION = 1;

export const PLAYER_COLLISION_TARGETS = [
  {
    key: "Particle",
    label: "Particles",
    fields: [
      { key: "enabled", label: "Interactions", kind: "boolean" },
      { key: "absorptionEnabled", label: "Absorb smaller", kind: "boolean" },
      { key: "captureEnabled", label: "Can capture player", kind: "boolean" }
    ]
  },
  {
    key: "Projectile",
    label: "Projectiles",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "playerTransferScale", label: "Player transfer", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Enemy",
    label: "Enemies",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Macrophage",
    label: "Macrophages",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Obstacle",
    label: "Obstacles",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Stone",
    label: "Stones",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "bodyImpulseScale", label: "Body impulse", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "ComposedStone",
    label: "Composed stones",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "bodyImpulseScale", label: "Body impulse", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Algae",
    label: "Algae",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "bodyImpulseScale", label: "Body impulse", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Oldbody",
    label: "Oldbodies",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "bodyImpulseScale", label: "Body impulse", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Stentor",
    label: "Stentors",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  },
  {
    key: "Egg",
    label: "Eggs",
    fields: [
      { key: "enabled", label: "Collision", kind: "boolean" },
      { key: "bounceScale", label: "Bounce scale", kind: "number", min: 0, max: 5, step: 0.05 },
      { key: "bodyImpulseScale", label: "Body impulse", kind: "number", min: 0, max: 5, step: 0.05 }
    ]
  }
];

const DEFAULT_PLAYER_COLLISION_BY_TYPE = {
  Particle: { enabled: true, absorptionEnabled: true, captureEnabled: true },
  Projectile: { enabled: true, bounceScale: 1, playerTransferScale: 1 },
  Enemy: { enabled: true, bounceScale: 1 },
  Macrophage: { enabled: true, bounceScale: 1 },
  Obstacle: { enabled: true, bounceScale: 1 },
  Stone: { enabled: true, bounceScale: 1, bodyImpulseScale: 1 },
  ComposedStone: { enabled: true, bounceScale: 1, bodyImpulseScale: 1 },
  Algae: { enabled: true, bounceScale: 1, bodyImpulseScale: 1 },
  Oldbody: { enabled: true, bounceScale: 1, bodyImpulseScale: 1 },
  Stentor: { enabled: true, bounceScale: 1 },
  Egg: { enabled: true, bounceScale: 1, bodyImpulseScale: 1 }
};

export const DEFAULT_PLAYER_COLLISION_PROFILE = {
  version: PLAYER_COLLISION_PROFILE_VERSION,
  defaults: {
    enabled: true,
    bounceScale: 1,
    bodyImpulseScale: 1,
    playerTransferScale: 1
  },
  byType: DEFAULT_PLAYER_COLLISION_BY_TYPE
};

const TARGET_KEYS = new Set(PLAYER_COLLISION_TARGETS.map(target => target.key));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, fallback, min = -Infinity, max = Infinity) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return !!fallback;
}

function normalizeNumberField(value, fallback, field) {
  const min = Number.isFinite(field?.min) ? field.min : 0;
  const max = Number.isFinite(field?.max) ? field.max : Infinity;
  return clampNumber(value, fallback, min, max);
}

function normalizeRule(rawRule, defaultRule, target) {
  const source = rawRule && typeof rawRule === "object" ? rawRule : {};
  const rule = { ...defaultRule };

  for (const field of target.fields) {
    const fallback = defaultRule[field.key];
    if (field.kind === "boolean") {
      rule[field.key] = normalizeBoolean(source[field.key], fallback);
    } else {
      rule[field.key] = normalizeNumberField(source[field.key], fallback, field);
    }
  }

  return rule;
}

export function getDefaultPlayerCollisionProfile() {
  return clone(DEFAULT_PLAYER_COLLISION_PROFILE);
}

export function normalizePlayerCollisionProfile(rawProfile) {
  const raw = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  const profile = getDefaultPlayerCollisionProfile();
  const rawDefaults = raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {};

  profile.defaults = {
    enabled: normalizeBoolean(rawDefaults.enabled, profile.defaults.enabled),
    bounceScale: clampNumber(rawDefaults.bounceScale, profile.defaults.bounceScale, 0, 5),
    bodyImpulseScale: clampNumber(rawDefaults.bodyImpulseScale, profile.defaults.bodyImpulseScale, 0, 5),
    playerTransferScale: clampNumber(rawDefaults.playerTransferScale, profile.defaults.playerTransferScale, 0, 5)
  };

  const rawByType = raw.byType && typeof raw.byType === "object" ? raw.byType : {};
  for (const target of PLAYER_COLLISION_TARGETS) {
    const defaultRule = profile.byType[target.key] ?? {};
    const rawRule = rawByType[target.key] ?? raw[target.key] ?? {};
    profile.byType[target.key] = normalizeRule(rawRule, defaultRule, target);
  }

  return profile;
}

export function getPlayerCollisionRule(profile, targetKey) {
  const normalizedProfile = profile && profile.version === PLAYER_COLLISION_PROFILE_VERSION && profile.byType
    ? profile
    : normalizePlayerCollisionProfile(profile);
  const key = TARGET_KEYS.has(targetKey) ? targetKey : "Stone";
  return {
    ...normalizedProfile.defaults,
    ...(normalizedProfile.byType?.[key] ?? {})
  };
}

export function getPlayerCollisionTargetKey(entity) {
  if (!entity) return "Stone";
  if (entity.isProjectile) return "Projectile";
  if (entity.type && TARGET_KEYS.has(entity.type)) return entity.type;
  if (entity.oldbodyId != null || Array.isArray(entity.cargoParticles)) return "Oldbody";

  const className = entity.constructor?.name;
  if (className && TARGET_KEYS.has(className)) return className;
  if (typeof entity._getCircles === "function") return "ComposedStone";

  return "Stone";
}
