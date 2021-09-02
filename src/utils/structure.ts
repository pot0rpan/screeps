import config from 'config';

// If hits < hitsMax, and if wall or rampart hits < MAX_REPAIR_HITS
export function isDamaged(struct: Structure, ignoreConfigMax = false) {
  if (struct.hits >= struct.hitsMax) return false;
  if (ignoreConfigMax) return true;

  // Only apply config max to walls/ramparts
  if (
    struct.structureType !== STRUCTURE_WALL &&
    struct.structureType !== STRUCTURE_RAMPART
  ) {
    return true;
  }

  return (
    struct.hits < config.MAX_REPAIR_HITS(struct.room.controller?.level ?? 0)
  );
}
