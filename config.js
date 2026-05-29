/**
 * config.js — world-level & particle engine settings.
 *
 * Entity-specific defaults (radius, color, speed, bounce forces, …) now live
 * as DEFAULTS exports inside each entity module:
 *   Player.DEFAULTS, Enemy.DEFAULTS, Macrophage.DEFAULTS, Stentor.DEFAULTS,
 *   Obstacle.DEFAULTS, Stone.DEFAULTS, Egg.DEFAULTS,
 *   Projectile.DEFAULTS, GITParticle.DEFAULTS
 */
export const config = {
  // --- particle count & max size ---
  particleCount: 100,
  maxParticleCount: 300,
  maxProjectileCount: 80,
  maxRadius:     40,

  // --- cell division ---
  divisionRadius:       40,
  divisionPauseMs:      4000,
  divisionChildScale:   0.8,
  divisionSpeedBoost:   1.2,
  divisionCooldownMs:   1800,

  // --- division randomisation ---
  divisionAngleJitter:    0.35,
  divisionAngleAsym:      0.28,
  divisionSpeedMinMul:    0.75,
  divisionSpeedMaxMul:    1.45,
  divisionSpawnJitterMul: 0.18,

  // --- particle physics ---
  playerFriction:   0.95,
  playerMinFriction: 0.84,
  playerSlowdownStartRadius: 20,
  playerMinRadius: 5,
  particleFriction: 0.985,
  absorptionFactor: 0.99,   // how much the player shrinks per shot
  playerAbsorptionGain: 1.2,
  particleAbsorptionGain: 0.05,
  boundaryBounce:   true,

  // --- player split / old body ---
  playerSplitRadius: 25,
  playerSplitChildRadius: 14,
  playerSplitMinParentRadius: 18,
  playerSplitLaunchSpeed: 3.2,
  playerSplitParentKick: 1.4,
  playerEdgeInset: 18,
  playerEdgeAvoidDistanceFactor: 1.35,
  playerEdgeAvoidForce: 0.055,
  playerEdgePositionPushFactor: 0.018,
  cystRadiusScale: 1.5,
  oldbodyEggAbsorbRate: 0.08,
  oldbodyCargoInset: 4,
  oldbodyCargoFriction: 0.96,
  oldbodyCargoDriftStrength: 0.03,
  oldbodyFeedingParticleMaxRadius: 10,
  oldbodyFeedingDetachRadius: 10,
  oldbodyFeedingMinRadius: 6,
  oldbodyFeedingRangePadding: 8,
  oldbodyFeedingRate: 0.035,
  oldbodyFeedingGrowthGain: 0.25,
  oldbodyFeedingOldbodyShrink: 0.35,
  oldbodyFeedingDrag: 0.93,
  oldbodyFeedingDetachImpulse: 0.65,
  oldbodyFeedingDetachCooldownMs: 900,
  oldbodyDefenseRange: 240,
  oldbodyDefenseCooldownMs: 420,
  oldbodyAntibodySpeed: 0.6,
  oldbodyAntibodyRadius: 5,
  oldbodyAntibodyShrink: 0.55,
  oldbodyAntibodyCost: 0.22,
  oldbodyAntibodyFriction: 0.965,
  oldbodyAntibodyMaxSpeed: 1.15,
  oldbodyAntibodyHomingForce: 0.055,
  oldbodyAntibodyDrift: 0.012,
  oldbodyAntibodyTTLms: 9000,
  quansistorSeedCenterForce: 0.025,
  quansistorSeedFriction: 0.92,
  quansistorSeedDriftStrength: 0.006,
  quansistorSeedMaxSpeed: 0.85,
  quansistorFormationDistance: 2.2,
  quansistorRadiusScale: 1,
  quansistorMinRadius: 4,
  quansistorMaxRadiusRatio: 1,
  quansistorFollowStrength: 0.18,
  quansistorRadiusEase: 0.08,
  quansistorParticleRangePadding: 8,
  quansistorParticleMaxRadius: 12,
  quansistorParticlePull: 0.08,
  quansistorParticleDrag: 0.86,
  quansistorParticleAbsorbRate: 0.1,
  quansistorParticleGrowthGain: 0.75,
  quansistorParticleMinRadius: 0.45,
  quansistorOldbodyRangePadding: 10,
  quansistorOldbodyPull: 0.055,
  quansistorOldbodyDrag: 0.9,
  quansistorOldbodyAbsorbRate: 0.055,
  quansistorOldbodyGrowthGain: 0.85,
  quansistorOldbodyMinRadius: 6,
  quansistorNoozleMinDistanceScale: 2,
  quansistorNoozleMaxDistanceScale: 4,
  quansistorNoozleInitialDistanceScale: 4,
  quansistorNoozleRadiusScale: 0.55,
  quansistorNoozleMinRadius: 3,
  quansistorNoozleFriction: 0.965,
  quansistorNoozleMaxSpeed: 1.2,
  quansistorNoozleWallBounce: 0.55,
  quansistorNoozleBounceForce: 1,
  quansistorNoozleImpulseFactor: 2,
  quansistorNoozleMiningRangePadding: 10,
  quansistorNoozleMiningMagnetRangePadding: 34,
  quansistorNoozleMiningMagnetStrength: 0.16,
  quansistorNoozleMiningMagnetStickiness: 0.18,
  quansistorNoozleMiningMagnetDrag: 0.9,
  quansistorNoozleMiningMagnetVelocityCoupling: 0.16,
  quansistorNoozleMiningMagnetMaxSpeed: 1.45,
  quansistorNoozleMiningMagnetSurfaceGap: 1.2,
  quansistorNoozleMiningRate: 0.08,
  quansistorNoozleMiningMinRadius: 6,
  quansistorNoozleMiningPacketRadius: 5,
  quansistorNoozleMiningPacketSpeed: 1.8,
  quansistorNoozleMiningPacketCooldownMs: 110,
  quansistorNoozleMiningPacketMaxCount: 64,
  quansistorNoozleMiningPacketTTLms: 9000,
  quansistorNoozleMiningGrowthGain: 0.35,

  // --- spatial grid ---
  gridSize: 100,

  // --- threat / escape ---
  threatInterval: 10,
  threatDistance: 10,
  escapeForce:    0.5,

  // --- organism motion base ---
  minSpeed:          0.05,
  kickStrength:      1.2,
  kickCooldownMs:    700,
  senseRadius:       180,
  senseSamples:      8,
  senseAvoidStrength: 1.0,
  kickJitter:        0.6,
  brownianStrength:  0.03,

  // --- edge avoidance ---
  edgeAvoidDistanceFactor: 4.0,
  edgeAvoidForce:          0.08,
  edgeAvoidDamping:        0.98,
  eggEdgeAvoidDistanceFactor: 4.0,
  eggEdgeAvoidForce:          0.08,
  eggEdgeAvoidDamping:        0.98,

  // --- projectile-projectile bounce ---
  yellowBounceImpulse:      0.35,
  yellowSeparationStrength: 0.90,

  // --- anti-stagnation micro-impulses ---
  microImpulseBaseIntervalMs:   3500,
  microImpulseStrength:         0.16,
  microImpulseUsesLeastDenseDir: true,

  // --- vector field ---
  vectorFieldStrength: 0.003,
  vectorFieldVariance: 1.0,

  // --- projectile / CO2 algae field ---
  projectileAlgaeFieldEnabled: true,
  projectileAlgaeFieldRange: 350,
  projectileAlgaeFieldStrength: 0.014,
  projectileAlgaeFieldCurl: 0.58,
  projectileAlgaeFieldInnerCurlFade: 90,
  projectileAlgaeFieldMaxForce: 0.05,

  // --- colour hysteresis ---
  colorHysteresisPx: 0.1,

  // --- projectile lifetime ---
  // Infinity = never expire; set to e.g. 8000 for 8-second TTL
  projectileTTLms: Infinity,
};
