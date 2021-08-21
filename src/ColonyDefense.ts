import { Colony } from 'Colony';
import config from 'config';
import { isNthTick } from 'utils';

declare global {
  interface RoomMemory {
    defcon?: boolean;
  }
}

export class ColonyDefense {
  private colony: Colony;
  private roomName: string;
  private safeModeTimer: number | null = null;

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

    if (mainRoom.findHostiles().length) {
      mainRoom.memory.defcon = true;
    } else {
      mainRoom.memory.defcon = false;
    }

    if (mainRoom.memory.defcon) {
      this.defendMainRoom();
    }

    console.log(
      this.colony.roomName,
      'ColonyDefense CPU:',
      Game.cpu.getUsed() - start
    );
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

    // Activate safe mode if creeps made it to base center
    // and no defenders to help
    // Set timer to not activate too eagerly, towers may finish them off
    if (
      this.colony.roomPlanner.baseCenter?.findInRange(FIND_HOSTILE_CREEPS, 3, {
        filter: crp => crp.isHostile(),
      }).length &&
      !mainRoom.find(FIND_MY_CREEPS, {
        // This will also count any defenders that are spawning
        filter: creep => creep.memory.role === 'defender',
      }).length
    ) {
      if (this.safeModeTimer === null) {
        this.safeModeTimer = config.ticks.SAFE_MODE_DELAY;
      } else if (this.safeModeTimer <= 0) {
        this.safeModeTimer = null;
        controller.activateSafeMode();
        Game.notify(
          `${mainRoom} Activated safe mode on tick ${Game.time}, hostiles too close to base center`
        );
      } else {
        this.safeModeTimer--;
      }
    } else {
      this.safeModeTimer = null;
    }
  }

  private runTowers() {
    const mainRoom = Game.rooms[this.roomName];

    // Only attack if hostiles are <20 away from center
    const towers = mainRoom
      .findTowers()
      .filter(tower => tower.store.getUsedCapacity(RESOURCE_ENERGY) >= 10);
    const baseCenter =
      this.colony.roomPlanner.baseCenter ||
      new RoomPosition(25, 25, this.roomName);

    const mostInjuredHostile = mainRoom
      .findHostiles()
      .filter(creep => creep.pos.getRangeTo(baseCenter) < 20)
      .sort((a, b) => a.hits - b.hits)[0];

    for (const tower of towers) {
      tower.attack(mostInjuredHostile);
    }
  }
}
