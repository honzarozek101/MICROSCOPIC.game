// Sdílený stav světa — importují spawn.js, collisions.js i world.js
export const world = {
  particles:   [],
  spatialGrid: {},
  vectorField: {},
  camera:      null,
  background:  null,
  debug: {
    enabled: false,
    levelOverlay: false
  },
  player:      null,
  enemies:     [],
  macrophages: [],
  stentors:    [],
  obstacles:   [],
  particleZones: [],
  stones:      [],
  composedStones: [],
  algae:       [],
  composedEntities: [],
  oldbodies:   [],
  eggs:        []
};
