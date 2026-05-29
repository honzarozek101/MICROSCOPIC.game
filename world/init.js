import {
  initVectorField,
  buildSpatialGrid,
  createPlayer,
  createEnemy,
  createMacrophages,
  createStentors,
  createObstacles,
  createStones,
  createAmbientParticles
} from "../spawn.js";
import { world } from "../worldState.js";
import { resetWorldState } from "./reset.js";

export function initWorld(bounds) {
  resetWorldState();

  initVectorField(bounds);
  createPlayer(bounds);
  createEnemy(bounds);
  createMacrophages(bounds);
  createStentors(bounds);
  createObstacles(bounds);
  createStones(bounds);
  createAmbientParticles(bounds);
  buildSpatialGrid();

  return world;
}
