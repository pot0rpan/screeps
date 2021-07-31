import config from 'config';

export function isDamaged(struct: Structure) {
  return struct.hits < struct.hitsMax && struct.hits < config.MAX_REPAIR_HITS;
}
