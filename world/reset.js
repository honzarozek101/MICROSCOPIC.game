import { world } from "../worldState.js";

export function resetWorldState() {
  world.particles = [];
  world.spatialGrid = {};
  world.vectorField = {};
  world.camera = null;
  world.background = null;
  world.debug = {
    enabled: world.debug?.enabled ?? false,
    levelOverlay: world.debug?.levelOverlay ?? false
  };
  world.player = null;
  world.enemies = [];
  world.macrophages = [];
  world.stentors = [];
  world.obstacles = [];
  world.particleZones = [];
  world.stones = [];
  world.composedStones = [];
  world.algae = [];
  world.composedEntities = [];
  world.oldbodies = [];
  world.eggs = [];
}
