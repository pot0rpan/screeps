export function isDamaged(struct: Structure): boolean {
  if (struct.hits === undefined) return false;
  return (
    struct.hits < struct.hitsMax && struct.structureType !== STRUCTURE_WALL
  );
}

let activeStructureCache: { [key: string]: boolean } = {};
let activeStructureTick = 0;

// isActive() generally costs about 0.1 CPU, so cache for a while
export function isActive(struct: Structure): boolean {
  if (Game.time - activeStructureTick > 60) {
    activeStructureTick = Game.time;
    activeStructureCache = {};
  }

  if (activeStructureCache[struct.id] === undefined) {
    activeStructureCache[struct.id] = struct.isActive();
  }

  return activeStructureCache[struct.id];
}
