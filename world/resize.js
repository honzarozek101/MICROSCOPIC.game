import { initVectorField, buildSpatialGrid } from "../spawn.js";
import { config } from "../config.js";
import { world } from "../worldState.js";
import { clampEntityInsideBounds } from "./shared.js";

export function resizeWorld(bounds, { rebuildField = true } = {}) {
  if (rebuildField) initVectorField(bounds);

  const groups = [
    [world.player],
    world.enemies,
    world.macrophages,
    world.stentors,
    world.obstacles,
    world.stones,
    world.composedStones,
    world.algae,
    world.oldbodies,
    world.eggs,
    world.particleZones,
    world.particles
  ];

  for (const group of groups) {
    for (const entity of group ?? []) {
      if (!entity || entity.absorbed || entity.removed) continue;
      clampEntityInsideBounds(entity, bounds, { inset: entity === world.player ? config.playerEdgeInset : 0 });
      if ("_spawnX" in entity) entity._spawnX = entity.x;
      if ("_spawnY" in entity) entity._spawnY = entity.y;
    }
  }

  buildSpatialGrid();
}
