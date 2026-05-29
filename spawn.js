import { config } from "./config.js";
import { Particle } from "./Particle.js";
import { Player,     DEFAULTS as PlayerDef  } from "./Player.js";
import { Enemy,      DEFAULTS as EnemyDef   } from "./Enemy.js";
import { Macrophage, DEFAULTS as MacroDef   } from "./Macrophage.js";
import { Stentor,    DEFAULTS as StentorDef } from "./Stentor.js";
import { Obstacle,   DEFAULTS as ObsDef     } from "./Obstacle.js";
import { Stone,      DEFAULTS as StoneDef   } from "./Stone.js";
import { world } from "./worldState.js";

// ── Vector field & spatial grid ────────────────────────────────────────────

export function initVectorField(bounds) {
  world.vectorField = {};
  const cols = Math.ceil(bounds.width  / config.gridSize) + 1;
  const rows = Math.ceil(bounds.height / config.gridSize) + 1;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const angle    = Math.random() * Math.PI * 2 * config.vectorFieldVariance;
      const strength = config.vectorFieldStrength;
      world.vectorField[`${cx},${cy}`] = {
        fx: Math.cos(angle) * strength,
        fy: Math.sin(angle) * strength
      };
    }
  }
}

export function buildSpatialGrid() {
  world.spatialGrid = {};
  for (const p of world.particles) {
    if (!p || p.absorbed) continue;
    const cellX = Math.floor(p.x / config.gridSize);
    const cellY = Math.floor(p.y / config.gridSize);
    const key   = `${cellX},${cellY}`;
    (world.spatialGrid[key] ??= []).push(p);
  }
}

// ── Entity spawners ────────────────────────────────────────────────────────

export function createPlayer(bounds) {
  const player = new Player(
    bounds.width / 2, bounds.height / 2
  );
  world.player = player;
  world.particles.push(player);
}

export function createEnemy(bounds) {
  let x, y, dist;
  do {
    x    = Math.random() * (bounds.width  - EnemyDef.radius * 2) + EnemyDef.radius;
    y    = Math.random() * (bounds.height - EnemyDef.radius * 2) + EnemyDef.radius;
    dist = Math.hypot(x - world.player.x, y - world.player.y);
  } while (dist < EnemyDef.minSpawnDistance);
  world.enemies = [new Enemy(x, y)];
}

export function createMacrophages(bounds) {
  world.macrophages = [];
  for (let i = 0; i < MacroDef.count; i++) {
    let x, y, ok;
    do {
      ok = true;
      x  = Math.random() * (bounds.width  - MacroDef.radius * 2) + MacroDef.radius;
      y  = Math.random() * (bounds.height - MacroDef.radius * 2) + MacroDef.radius;
      if (Math.hypot(x - world.player.x,    y - world.player.y)    < MacroDef.minSpawnDistanceFromPlayer) ok = false;
      if (Math.hypot(x - world.enemies[0].x, y - world.enemies[0].y) < MacroDef.minSpawnDistanceFromEnemy)  ok = false;
      for (const m of world.macrophages) {
        if (Math.hypot(x - m.x, y - m.y) < MacroDef.minSpawnDistanceFromOthers) { ok = false; break; }
      }
    } while (!ok);
    world.macrophages.push(new Macrophage(x, y));
  }
}

export function createStentors(bounds) {
  world.stentors = [];
  for (let i = 0; i < StentorDef.count; i++) {
    let x, y, ok;
    do {
      ok = true;
      x  = Math.random() * (bounds.width  - StentorDef.radius * 2) + StentorDef.radius;
      y  = Math.random() * (bounds.height - StentorDef.radius * 2) + StentorDef.radius;
      if (Math.hypot(x - world.player.x, y - world.player.y) < StentorDef.minSpawnDistanceFromPlayer) ok = false;
      if (ok && world.enemies[0] && Math.hypot(x - world.enemies[0].x, y - world.enemies[0].y) < StentorDef.minSpawnDistanceFromEnemy) ok = false;
      for (const m of world.macrophages) {
        if (Math.hypot(x - m.x, y - m.y) < m.radius + StentorDef.radius + 60) { ok = false; break; }
      }
      for (const s of world.stentors) {
        if (Math.hypot(x - s.x, y - s.y) < StentorDef.minSpawnDistanceFromOthers) { ok = false; break; }
      }
    } while (!ok);
    world.stentors.push(new Stentor(x, y));
  }
}

export function createObstacles(bounds) {
  world.obstacles = [];
  for (let i = 0; i < ObsDef.count; i++) {
    let x, y, radius, ok, attempts = 0;
    do {
      ok = true; attempts++;
      radius = ObsDef.minRadius + Math.random() * (ObsDef.maxRadius - ObsDef.minRadius);
      x      = radius + Math.random() * (bounds.width  - radius * 2);
      y      = radius + Math.random() * (bounds.height - radius * 2);
      if (Math.hypot(x - world.player.x,     y - world.player.y)     < ObsDef.minSpawnDistanceFromPlayer + radius) ok = false;
      if (ok && Math.hypot(x - world.enemies[0].x, y - world.enemies[0].y) < ObsDef.minSpawnDistanceFromEnemy  + radius) ok = false;
      for (const m of world.macrophages) {
        if (Math.hypot(x - m.x, y - m.y) < m.radius + radius + 40) { ok = false; break; }
      }
      for (const o of world.obstacles) {
        if (Math.hypot(x - o.x, y - o.y) < o.radius + radius + ObsDef.minSpawnDistanceFromOthers) { ok = false; break; }
      }
    } while (!ok && attempts < 200);
    if (ok) world.obstacles.push(new Obstacle(x, y, radius));
  }
}

export function createStones(bounds) {
  world.stones = [];
  for (let i = 0; i < StoneDef.count; i++) {
    let x, y, radius, ok, attempts = 0;
    do {
      ok = true; attempts++;
      radius = StoneDef.minRadius + Math.random() * (StoneDef.maxRadius - StoneDef.minRadius);
      x      = radius + Math.random() * (bounds.width  - radius * 2);
      y      = radius + Math.random() * (bounds.height - radius * 2);
      if (Math.hypot(x - world.player.x,     y - world.player.y)     < StoneDef.minSpawnDistanceFromPlayer + radius) ok = false;
      if (ok && Math.hypot(x - world.enemies[0].x, y - world.enemies[0].y) < StoneDef.minSpawnDistanceFromEnemy  + radius) ok = false;
      for (const m of world.macrophages) {
        if (Math.hypot(x - m.x, y - m.y) < m.radius + radius + 40) { ok = false; break; }
      }
      for (const s of world.stones) {
        if (Math.hypot(x - s.x, y - s.y) < s.radius + radius + StoneDef.minSpawnDistanceFromOthers) { ok = false; break; }
      }
      for (const o of world.obstacles) {
        if (Math.hypot(x - o.x, y - o.y) < o.radius + radius + ObsDef.minSpawnDistanceFromOthers) { ok = false; break; }
      }
    } while (!ok && attempts < 200);
    if (ok) world.stones.push(new Stone(x, y, radius));
  }
}

export function createAmbientParticles(bounds) {
  for (let i = 0; i < config.particleCount; i++) {
    let x, y, radius, overlapping;
    do {
      overlapping = false;
      radius = Math.random() * 15 + 10;
      x      = Math.random() * (bounds.width  - radius * 2) + radius;
      y      = Math.random() * (bounds.height - radius * 2) + radius;
      if (Math.hypot(x - world.player.x,     y - world.player.y)     < world.player.radius + 200)              overlapping = true;
      if (Math.hypot(x - world.enemies[0].x, y - world.enemies[0].y) < world.enemies[0].radius + radius + 50) overlapping = true;
      for (const m of world.macrophages) {
        if (Math.hypot(x - m.x, y - m.y) < m.radius + radius + 50) { overlapping = true; break; }
      }
      for (const p of world.particles) {
        if (Math.hypot(x - p.x, y - p.y) < radius + p.radius) { overlapping = true; break; }
      }
      if (x - radius < 15 || x + radius > bounds.width  - 15) overlapping = true;
      if (y - radius < 15 || y + radius > bounds.height - 15) overlapping = true;
    } while (overlapping);

    const p = new Particle(x, y, radius, null, null, "rgba(0,0,0,0)", false, false);
    p.tintGroup = p.radius > world.player.radius ? "red" : "green";
    p.color     = p.tintGroup === "red" ? p.tintRed : p.tintGreen;
    p.spriteVariant = p.tintGroup;
    world.particles.push(p);
  }
}
