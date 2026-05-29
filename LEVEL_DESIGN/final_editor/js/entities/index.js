import { PlayerEntity } from './PlayerEntity.js';
import { EnemyEntity } from './EnemyEntity.js';
import { MacrophageEntity } from './MacrophageEntity.js';
import { CystEntity } from './CystEntity.js';
import { StentorEntity } from './StentorEntity.js';
import { ObstacleEntity } from './ObstacleEntity.js';
import { StoneEntity } from './StoneEntity.js';
import { ComposedStoneEntity } from './ComposedStoneEntity.js';
import { ComposedEntity } from './ComposedEntity.js';
import { AlgaeEntity } from './AlgaeEntity.js';
import { ParticleZoneEntity } from './ParticleZoneEntity.js';
import { ParticleEntity } from './ParticleEntity.js';

export const ENTITY_TYPES = [
  PlayerEntity,
  EnemyEntity,
  MacrophageEntity,
  CystEntity,
  StentorEntity,
  ObstacleEntity,
  StoneEntity,
  ComposedStoneEntity,
  ComposedEntity,
  AlgaeEntity,
  ParticleZoneEntity,
  ParticleEntity,
];

export const INDEXED_TYPES = ['Stentor', 'Stone', 'ComposedStone', 'Obstacle', 'Enemy', 'Macrophage', 'Algae'];
