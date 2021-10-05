// Worry about boosts later
export function getMaxHeal(creeps: Creep[]): number {
  return (
    creeps.reduce((heal, creep) => heal + creep.getActiveBodyparts(HEAL), 0) *
    HEAL_POWER
  );
}

// https://github.com/Arcath/screeps-fns/blob/master/src/tower-effectiveness-at-range/index.ts
/**
 * Calculate the effectiveness of a tower at the given range
 *
 * @param range The range to calculate effectiveness at e.g. `tower.pos.getRangeTo(target)`
 * @param max The power of the tower, e.g. `TOWER_POWER_ATTACK`
 */
function towerEffectivenessAtRange(range: number, max: number): number {
  if (range <= TOWER_OPTIMAL_RANGE) {
    return max;
  }
  if (range >= TOWER_FALLOFF_RANGE) {
    return max * (1 - TOWER_FALLOFF);
  }

  const towerFalloffPerTile =
    TOWER_FALLOFF / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);

  return max * (1 - (range - TOWER_OPTIMAL_RANGE) * towerFalloffPerTile);
}

export function getMaxTowerDamage(towers: StructureTower[], pos: RoomPosition) {
  return towers
    .filter(tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) > 10)
    .reduce(
      (dmg, tower) =>
        (dmg += towerEffectivenessAtRange(
          pos.getRangeTo(tower),
          TOWER_POWER_ATTACK
        )),
      0
    );
}
