export const EnemyEntity = {
  id: 'Enemy',
  label: 'Enemy',
  color: 'rgba(255, 140, 0, 0.80)',
  strokeColor: 'rgba(255,200,80,0.9)',
  defaultRadius: 25,

  props: [
    // identity
    {
      key: 'instanceIndex',
      label: 'Instance index',
      type: 'number',
      min: 1,
      max: 999,
      step: 1,
      default: 1
    },
    {
      key: 'spriteIndex',
      label: 'Sprite index',
      type: 'number',
      min: 1,
      max: 99,
      step: 1,
      default: 1
    },
    {
      key: 'spriteSubfolder',
      label: 'Sprite subfolder',
      type: 'text',
      default: ''
    },

    // body / movement
    {
      key: 'radius',
      label: 'Radius',
      type: 'number',
      min: 5,
      max: 200,
      step: 1,
      default: 25
    },
    {
      key: 'color',
      label: 'Color',
      type: 'text',
      default: 'rgba(255, 140, 0, 0.7)'
    },
    {
      key: 'speed',
      label: 'Speed override',
      type: 'number',
      min: 0,
      max: 5,
      step: 0.05,
      default: 0.6
    },
    {
      key: 'velocityDamping',
      label: 'Velocity damping',
      type: 'number',
      min: 0.8,
      max: 0.999,
      step: 0.0005,
      default: 0.952
    },
    {
      key: 'maxGlideSpeed',
      label: 'Max glide speed',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.01,
      default: 1.35
    },
    {
      key: 'kickImpulse',
      label: 'Tracking kick impulse',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.01,
      default: 1.1
    },
    {
      key: 'kickCooldownMs',
      label: 'Tracking kick cooldown ms',
      type: 'number',
      min: 0,
      max: 10000,
      step: 10,
      default: 760
    },
    {
      key: 'searchKickImpulse',
      label: 'Search kick impulse',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.01,
      default: 0.5
    },
    {
      key: 'searchKickCooldownMs',
      label: 'Search kick cooldown ms',
      type: 'number',
      min: 0,
      max: 10000,
      step: 10,
      default: 1650
    },
    {
      key: 'trackingFOVDeg',
      label: 'Tracking FOV °',
      type: 'number',
      min: 1,
      max: 360,
      step: 1,
      default: 42
    },
    {
      key: 'trackingKickJitterDeg',
      label: 'Tracking kick jitter °',
      type: 'number',
      min: 0,
      max: 180,
      step: 1,
      default: 14
    },
    {
      key: 'scanTurnRate',
      label: 'Scan turn rate',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      default: 0.014
    },
    {
      key: 'scanRetargetMs',
      label: 'Scan retarget ms',
      type: 'number',
      min: 0,
      max: 10000,
      step: 10,
      default: 850
    },
    {
      key: 'scanSweepAngleDeg',
      label: 'Scan sweep °',
      type: 'number',
      min: 0,
      max: 360,
      step: 1,
      default: 115
    },
    {
      key: 'bounceForce',
      label: 'Bounce force',
      type: 'number',
      min: 0,
      max: 20,
      step: 0.1,
      default: 3
    },
    {
      key: 'projectileBounceStrength',
      label: 'Projectile bounce strength',
      type: 'number',
      min: 0,
      max: 5,
      step: 0.01,
      default: 0.5
    },
    {
      key: 'chaseRadius',
      label: 'Chase radius',
      type: 'number',
      min: 0,
      max: 5000,
      step: 1,
      default: 800
    },
    {
      key: 'chaseBias',
      label: 'Chase bias',
      type: 'number',
      min: 0,
      max: 5,
      step: 0.01,
      default: 1.0
    },
    {
      key: 'wanderJitter',
      label: 'Wander jitter',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      default: 0.02
    },

    // mouth
    {
      key: 'mouthTurnRate',
      label: 'Mouth turn rate',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      default: 0.03
    },
    {
      key: 'mouthReturnRate',
      label: 'Mouth return rate',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      default: 0.04
    },
    {
      key: 'mouthMinTargetDistance',
      label: 'Mouth min target distance',
      type: 'number',
      min: 0,
      max: 500,
      step: 0.1,
      default: 18
    },
    {
      key: 'mouthAbsorbRadius',
      label: 'Mouth absorb radius',
      type: 'number',
      min: 0,
      max: 100,
      step: 0.1,
      default: 2
    },
    {
      key: 'mouthIdleSpin',
      label: 'Mouth idle spin',
      type: 'number',
      min: -1,
      max: 1,
      step: 0.001,
      default: 0.0
    },
    {
      key: 'mouthRestAngle',
      label: 'Mouth rest angle',
      type: 'number',
      min: -6.283,
      max: 6.283,
      step: 0.01,
      default: 0.0
    },
    {
      key: 'mouthPointRadius',
      label: 'Mouth point radius',
      type: 'number',
      min: 0,
      max: 50,
      step: 0.1,
      default: 5.5
    },
    {
      key: 'mouthLineWidth',
      label: 'Mouth line width',
      type: 'number',
      min: 0,
      max: 20,
      step: 0.1,
      default: 3
    },
    {
      key: 'mouthLineColor',
      label: 'Mouth line color',
      type: 'text',
      default: 'rgba(255, 220, 130, 0.95)'
    },
    {
      key: 'mouthInletColor',
      label: 'Mouth inlet color',
      type: 'text',
      default: 'rgba(255, 255, 255, 0.9)'
    },

    // egg / reproduction
    {
      key: 'preLaySlowdownMs',
      label: 'Pre-lay slowdown ms',
      type: 'number',
      min: 0,
      max: 60000,
      step: 10,
      default: 1800
    },
    {
      key: 'preLayFriction',
      label: 'Pre-lay friction',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.0005,
      default: 0.94
    },
    {
      key: 'eggGrowthRate',
      label: 'Egg growth rate',
      type: 'number',
      min: 0,
      max: 5,
      step: 0.001,
      default: 0.08
    },
    {
      key: 'eggTargetRadius',
      label: 'Egg target radius',
      type: 'number',
      min: 1,
      max: 200,
      step: 0.1,
      default: 14
    },
    {
      key: 'eggDetachSpeed',
      label: 'Egg detach speed',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.01,
      default: 0.5
    },
    {
      key: 'eggHatchEnemyRadius',
      label: 'Egg hatch enemy radius',
      type: 'number',
      min: 1,
      max: 200,
      step: 0.1,
      default: 12
    },

    // GIT
    {
      key: 'gitMaxParticles',
      label: 'GIT max particles',
      type: 'number',
      min: 1,
      max: 999,
      step: 1,
      default: 5
    },
    {
      key: 'gitShowCount',
      label: 'GIT show count',
      type: 'boolean',
      default: true
    },
    {
      key: 'gitCountFontSize',
      label: 'GIT count font size',
      type: 'number',
      min: 1,
      max: 64,
      step: 1,
      default: 10
    },
    {
      key: 'gitCountColor',
      label: 'GIT count color',
      type: 'text',
      default: 'rgba(255, 255, 255, 0.70)'
    },
    {
      key: 'gitCircleFillColor',
      label: 'GIT fill color',
      type: 'text',
      default: 'rgba(200, 80, 0, 0.30)'
    },
    {
      key: 'gitCircleBorderColor',
      label: 'GIT border color',
      type: 'text',
      default: 'rgba(255, 190, 80, 0.55)'
    },
    {
      key: 'gitCircleBorderWidth',
      label: 'GIT border width',
      type: 'number',
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.5
    },

    // GIT anatomy
    {
      key: 'gitCircleOffsetAngleDeg',
      label: 'GIT offset angle deg',
      type: 'number',
      min: -360,
      max: 360,
      step: 1,
      default: 180
    },
    {
      key: 'gitCircleOffsetDistanceMul',
      label: 'GIT offset distance mul',
      type: 'number',
      min: -3,
      max: 3,
      step: 0.01,
      default: 0.5944
    },
    {
      key: 'gitCircleRadiusMul',
      label: 'GIT radius mul',
      type: 'number',
      min: 0.01,
      max: 3,
      step: 0.01,
      default: 0.52
    },

    // GIT particles
    {
      key: 'gitParticleRadius',
      label: 'GIT particle radius',
      type: 'number',
      min: 0.1,
      max: 50,
      step: 0.1,
      default: 2.6
    },
    {
      key: 'gitParticleSpeed',
      label: 'GIT particle speed',
      type: 'number',
      min: 0,
      max: 20,
      step: 0.01,
      default: 1.6
    },
    {
      key: 'gitParticleMinSpeed',
      label: 'GIT particle min speed',
      type: 'number',
      min: 0,
      max: 20,
      step: 0.01,
      default: 0.3
    },
    {
      key: 'gitParticleFriction',
      label: 'GIT particle friction',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.0005,
      default: 0.975
    },
    {
      key: 'gitParticleWallRestitution',
      label: 'GIT wall restitution',
      type: 'number',
      min: 0,
      max: 2,
      step: 0.01,
      default: 0.9
    },

    // sprite / visual
    {
      key: 'spriteScale',
      label: 'Sprite scale override',
      type: 'number',
      min: 0.01,
      max: 10,
      step: 0.01,
      default: 1.41
    },
    {
      key: 'spriteRotationOffset',
      label: 'Sprite rotation offset',
      type: 'number',
      min: -6.283,
      max: 6.283,
      step: 0.01,
      default: 0.25
    },
    {
      key: 'spriteBodyU',
      label: 'Sprite body U',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      default: 0.410
    },
    {
      key: 'spriteBodyV',
      label: 'Sprite body V',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      default: 0.423
    },
    {
      key: 'spriteMouthU',
      label: 'Sprite mouth U',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      default: 0.751
    },
    {
      key: 'spriteMouthV',
      label: 'Sprite mouth V',
      type: 'number',
      min: -2,
      max: 2,
      step: 0.001,
      default: 0.327
    },
    {
      key: 'spriteAnimationEnabled',
      label: 'Animation enabled',
      type: 'boolean',
      default: true
    },
    {
      key: 'spriteAnimationSubfolder',
      label: 'Animation subfolder',
      type: 'text',
      default: ''
    },
    {
      key: 'spriteAnimationFrames',
      label: 'Animation frame count',
      type: 'number',
      min: 1,
      max: 9999,
      step: 1,
      default: 5
    },
    {
      key: 'spriteAnimationStart',
      label: 'Animation start frame',
      type: 'number',
      min: 1,
      max: 9999,
      step: 1,
      default: 1
    },
    {
      key: 'spriteAnimationFps',
      label: 'Animation FPS',
      type: 'number',
      min: 1,
      max: 120,
      step: 0.1,
      default: 12
    },
    {
      key: 'spriteAnimationPadding',
      label: 'Animation frame padding',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      default: 5
    },
    {
      key: 'spriteDebug',
      label: 'Sprite debug',
      type: 'boolean',
      default: false
    }
  ]
};
