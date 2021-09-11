import config from 'config';
import { isNthTick } from 'utils';
import { getMaxHeal, getMaxTowerDamage } from 'utils/combat';
import { Colony } from 'Colony';

declare global {
  interface RoomMemory {
    defcon?: number;
  }
}

export class ColonyDefense {
  private colony: Colony;
  private roomName: string;
  private safeModeTimer: number | null = null;

  private REMOVE_DEFCON_DELAY = 10;

  constructor(colony: Colony) {
    this.colony = colony;
    this.roomName = colony.roomName;
  }

  public run(): void {
    const mainRoom = Game.rooms[this.roomName];

    // Always run if hostiles were around last tick,
    // Otherwise only check for hostiles every few ticks
    if (!mainRoom.memory.defcon && !isNthTick(10)) {
      return;
    }

    console.log(this.colony.roomName, 'ColonyDefense run()');
    const start = Game.cpu.getUsed();

    if ((mainRoom.controller?.level ?? 0) < 3) {
      // No towers, not enough energy to spawn defenders ¯\_(ツ)_/¯
      return;
    }

    if (mainRoom.findHostiles().length && this.roomName !== 'sim') {
      mainRoom.memory.defcon = Game.time;
    } else if (
      mainRoom.memory.defcon &&
      Game.time - mainRoom.memory.defcon > this.REMOVE_DEFCON_DELAY
    ) {
      delete mainRoom.memory.defcon;
    }

    if (mainRoom.memory.defcon) {
      this.defendMainRoom();
    }

    global.stats.profileLog(this.colony.roomName + ' ColonyDefense', start, [
      this.roomName,
    ]);
  }

  private defendMainRoom(): void {
    this.runTowers();
    this.handleSafeMode();
  }

  private handleSafeMode(): void {
    const mainRoom = Game.rooms[this.roomName];
    const controller = mainRoom.controller;
    if (!controller || controller.safeMode || !controller.safeModeAvailable) {
      this.safeModeTimer = null;
      return;
    }

    // Activate safemode immediately if spawns are injured
    // This is mostly for low rcl
    if (mainRoom.findSpawns().find(spawn => spawn.hits < spawn.hitsMax)) {
      this.safeModeTimer = null;
      controller.activateSafeMode();
      Game.notify(`${mainRoom} Activated safe mode on tick ${Game.time}`);
      return;
    }

    // Activate safe mode if creeps are getting through bunker
    // Or if they're adjacent to the controller
    // Set timer to not activate too eagerly, towers/defenders may finish them off
    if (
      this.colony.roomPlanner.baseCenter
        ?.findInRange(FIND_HOSTILE_CREEPS, 4)
        .find(crp => crp.isHostile()) ||
      controller.pos
        .findInRange(FIND_HOSTILE_CREEPS, 1)
        .find(crp => crp.isHostile())
    ) {
      if (this.safeModeTimer === null) {
        this.safeModeTimer = config.ticks.SAFE_MODE_DELAY;
      } else if (this.safeModeTimer <= 0) {
        this.safeModeTimer = null;
        controller.activateSafeMode();
        Game.notify(`${mainRoom} Activated safe mode on tick ${Game.time}`);
      } else {
        this.safeModeTimer--;
      }
    } else {
      this.safeModeTimer = null;
    }
  }

  private runTowers() {
    const mainRoom = Game.rooms[this.roomName];

    const towers = mainRoom
      .findTowers()
      .filter(tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) >= 10);

    if (!towers.length) return;

    const hostiles = mainRoom.findHostiles();

    if (!hostiles.length) return;

    const baseCenter =
      this.colony.roomPlanner.baseCenter ||
      new RoomPosition(25, 25, this.roomName);

    // Only attack if hostile if they're close enough
    // baseCenter is used as a rough average for all tower locations
    const mostInjuredHostile = hostiles
      .filter(creep => creep.pos.getRangeTo(baseCenter) <= 20)
      .sort((a, b) => a.hits - b.hits)[0];

    if (
      mostInjuredHostile &&
      getMaxHeal(hostiles) < getMaxTowerDamage(towers, mostInjuredHostile.pos)
    ) {
      for (const tower of towers) {
        tower.attack(mostInjuredHostile);
      }
    } else {
      // Heal friendlies
      const injuredFriendly = mainRoom
        .find(FIND_MY_CREEPS, {
          filter: crp =>
            crp.memory.recycle === undefined && crp.hits < crp.hitsMax,
        })
        .sort((a, b) => a.hits - b.hits)[0];
      if (injuredFriendly) {
        for (const tower of towers) {
          tower.heal(injuredFriendly);
        }
      }
    }
  }
}
