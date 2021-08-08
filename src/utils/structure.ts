import config from 'config';

// If hits < hitsMax, and if wall or rampart hits < MAX_REPAIR_HITS
export function isDamaged(struct: Structure) {
  return (
    struct.hits < struct.hitsMax &&
    (struct.structureType === STRUCTURE_WALL ||
    struct.structureType === STRUCTURE_RAMPART
      ? struct.hits < config.MAX_REPAIR_HITS
      : true)
  );
}
