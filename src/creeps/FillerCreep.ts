import { isNthTick } from 'utils';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';
import { recycle } from 'actions/recycle';
import { toggleWorking } from 'actions/toggleWorking';

declare global {
  interface CreepMemory {
    _extensionIx?: number;
  }
}

interface FillerTask extends CreepTask {
  type: 'withdraw' | 'transfer';
}

function shouldIgnore(target: _HasRoomPosition): boolean {
  const baseCenter =
    global.empire.colonies[target.pos.roomName].roomPlanner.baseCenter;

  if (!baseCenter) return false;

  if (
    !Game.rooms[target.pos.roomName].find(FIND_MY_CREEPS, {
      filter: creep => creep.memory.role === 'operator',
    }).length
  ) {
    return false;
  }

  return target.pos.getRangeTo(baseCenter) <= 1;
}

// Filler takes from storage and fills extensions, outer towers, and outer spawns
export class FillerCreep extends CreepBase {
  role: CreepRole = 'filler';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 10,
  };
  taskPriority = 3;

  private getExtensionToFill(creep: Creep): StructureExtension | null {
    let ix = creep.memory._extensionIx ?? Infinity;

    const extensions = creep.room.findExtensions();

    if (ix >= extensions.length) ix = 0;

    while (ix < extensions.length) {
      const extension = extensions[ix];
      if (
        extension &&
        extension.isActive() &&
        extension.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        creep.memory._extensionIx = ix;
        return extension;
      }
      ix++;
    }

    creep.memory._extensionIx = 0;
    return null;
  }

  // Only if we have center storage (RCL4+)
  targetNum(room: Room): number {
    return room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ? 1 : 0;
  }

  findTask(creep: Creep, taskManager: TaskManager): FillerTask | null {
    if (creep.memory.working) {
      // Fill extensions, spawn, towers - must not be adjacent to base center
      let target:
        | StructureExtension
        | StructureSpawn
        | StructureTower
        | null
        | undefined = undefined;
      const type: FillerTask['type'] = 'transfer';

      if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
        // Extensions
        target = this.getExtensionToFill(creep);

        // Spawns
        if (!target) {
          target = creep.room
            .findSpawns()
            .find(
              spawn =>
                spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                !shouldIgnore(spawn)
            );
        }
      }

      // Towers
      if (!target) {
        target = creep.room
          .findTowers()
          .filter(
            tower =>
              tower.store.getFreeCapacity(RESOURCE_ENERGY) > 100 &&
              !shouldIgnore(tower)
          )
          .sort(
            (a, b) =>
              a.store.getUsedCapacity(RESOURCE_ENERGY) -
              b.store.getUsedCapacity(RESOURCE_ENERGY)
          )[0];
      }

      if (!target) return null;

      return taskManager.createTask<FillerTask>(
        target.pos.roomName,
        target.id,
        type,
        1 // Only ever spawn 1 Filler
      );
    } else {
      let target: StructureStorage | null = null;

      // Gather from center storage
      target =
        creep.room.storage &&
        creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) >=
          creep.store.getFreeCapacity(RESOURCE_ENERGY)
          ? creep.room.storage
          : null;

      if (!target) return null;

      return taskManager.createTask<FillerTask>(
        target.pos.roomName,
        target.id,
        'withdraw',
        1
      );
    }
  }

  isValidTask(creep: Creep, task: FillerTask): boolean {
    const target = Game.getObjectById(
      task.target as Id<
        StructureSpawn | StructureExtension | StructureTower | StructureStorage
      >
    );

    if (!target || !target.isActive()) return false;

    if (task.type === 'withdraw') {
      if (
        (target as StructureStorage).store.getUsedCapacity(RESOURCE_ENERGY) <
        creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        return false;
      }
    } else if (task.type === 'transfer') {
      // @ts-ignore-next-line idk why this is needed
      if (target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        return false;
      }
    }

    return true;
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      recycle(creep, 1000);
      return;
    }

    const task = creep.memory.task as FillerTask;

    const target = Game.getObjectById(
      task.target as Id<
        StructureSpawn | StructureExtension | StructureTower | StructureStorage
      >
    );

    if (!target) {
      creep.memory.task.complete = true;
      return;
    }

    if (creep.pos.getRangeTo(target) > 1) {
      creep.travelTo(target, { range: 1 });

      // Also withdraw from storage/terminal if adjacent
      if (!creep.isFull()) {
        if (
          creep.room.storage &&
          creep.pos.getRangeTo(creep.room.storage) <= 1
        ) {
          creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
        } else if (
          creep.room.terminal &&
          creep.pos.getRangeTo(creep.room.terminal) <= 1
        ) {
          creep.withdraw(creep.room.terminal, RESOURCE_ENERGY);
        }
      }

      return;
    }

    switch (task.type) {
      case 'transfer':
        creep.transfer(
          target as StructureSpawn | StructureTower | StructureExtension,
          RESOURCE_ENERGY
        );

        break;
      case 'withdraw':
        creep.withdraw(target as StructureStorage, RESOURCE_ENERGY);
        break;
    }

    // Transfer/withdraw gets completed in 1 tick
    creep.memory.task.complete = true;

    // Find dropped energy in range if creep has room
    if (isNthTick(3) && creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
      const dropped = creep.pos
        .findInRange(FIND_DROPPED_RESOURCES, 1)
        .find(res => res.resourceType === RESOURCE_ENERGY);

      if (dropped) {
        creep.pickup(dropped);
      } else {
        // Find tombstones with energy
        const tombstone = creep.pos
          .findInRange(FIND_TOMBSTONES, 1)
          .find(ts => ts.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        if (tombstone) {
          creep.withdraw(tombstone, RESOURCE_ENERGY);
        }
      }
    }

    toggleWorking(creep);
  }
}
