// Worry about boosts later
export function getMaxHeal(creeps: Creep[]): number {
  return (
    creeps.reduce((heal, creep) => heal + creep.getActiveBodyparts(HEAL), 0) *
    HEAL_POWER
  );
}

export function getMaxTowerDamage(towers: StructureTower[], pos: RoomPosition) {
  return towers
    .filter(tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) > 10)
    .reduce((dmg, tower) => {
      const range = pos.getRangeTo(tower);
      if (range <= 5) return dmg + 600;
      if (range >= 20) return dmg + 150;
      // TODO: Calculate actual damage
      return dmg + 300;
    }, 0);
}
