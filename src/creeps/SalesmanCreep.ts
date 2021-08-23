import { maxToStoreOfResource } from 'utils/room';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

// task.target is withdraw target id, to target id is in data.to
interface SalesmanTask extends CreepTask {
  type: 'balance';
  data: { to: string; resourceType: ResourceConstant };
}

// Salesman balances resources between terminal and storage
export class SalesmanCreep extends CreepBase {
  role: CreepRole = 'salesman';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 2,
  };

  // Creep carry capacity gets added to this to stop bouncing
  private threshold = 5000;

  private findExcessResources(
    room: Room,
    target: StructureStorage | StructureTerminal
  ): { [resourceType: string]: number } {
    const excessResources: { [resourceType: string]: number } = {};

    if (target) {
      for (const resType in target.store) {
        const amount =
          target.store.getUsedCapacity(resType as ResourceConstant) ?? 0;

        const amountExcess =
          amount - maxToStoreOfResource(room, resType as ResourceConstant);
        if (amountExcess > 0) {
          excessResources[resType] = amountExcess;
        }
      }
    }

    return excessResources;
  }

  private findResourceToMove(room: Room): {
    from: StructureStorage | StructureTerminal;
    to: StructureStorage | StructureTerminal;
    type: ResourceConstant;
  } | null {
    if (!room.storage || !room.terminal) return null;

    // Balance out storage between storage/terminal
    // use threshold so there are no more tasks when they're close enough
    const excessInTerminal = this.findExcessResources(room, room.terminal);
    const excessInStorage = this.findExcessResources(room, room.storage);

    // Gather excess amounts of each resource in both storage/terminal
    const excessResources: {
      [resourceType: string]: { terminal?: number; storage?: number };
    } = {};

    for (const resType in excessInTerminal) {
      if (!excessResources[resType]) excessResources[resType] = {};
      excessResources[resType].terminal = excessInTerminal[resType];
    }

    for (const resType in excessInStorage) {
      if (!excessResources[resType]) excessResources[resType] = {};
      excessResources[resType].storage = excessInStorage[resType];
    }

    // Check if should move
    for (const resType in excessResources) {
      const excessTerminal = excessResources[resType].terminal ?? 0;
      const excessStorage = excessResources[resType].storage ?? 0;

      // If not close enough, transfer from fullest
      if (
        Math.abs(excessTerminal - excessStorage) >
        this.threshold +
          this.generateBody(room.energyCapacityAvailable).filter(
            part => part === CARRY
          ).length *
            50
      ) {
        if (excessTerminal > excessStorage) {
          return {
            from: room.terminal,
            to: room.storage,
            type: resType as ResourceConstant,
          };
        } else {
          return {
            from: room.storage,
            to: room.terminal,
            type: resType as ResourceConstant,
          };
        }
      }
    }

    return null;
  }

  // 1 if any resources are above max (with a small buffer)
  targetNum(room: Room): number {
    if (
      room.terminal &&
      room.terminal.isActive() &&
      room.storage &&
      room.storage.isActive() &&
      this.findResourceToMove(room)
    ) {
      return 1;
    }

    return 0;
  }

  isValidTask(creep: Creep, task: SalesmanTask): boolean {
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): SalesmanTask | null {
    const resourceToMove = this.findResourceToMove(
      Game.rooms[creep.memory.homeRoom]
    );
    if (!resourceToMove) return null;

    return taskManager.createTask<SalesmanTask>(
      creep.memory.homeRoom,
      resourceToMove.from.id,
      'balance',
      -1,
      { to: resourceToMove.to.id, resourceType: resourceToMove.type }
    );
  }

  run(creep: Creep): void {
    const storage = creep.room.storage;
    const terminal = creep.room.terminal;

    const task = creep.memory.task as SalesmanTask | undefined;
    if (!task || !storage || !terminal) {
      if (storage && creep.getCarryingResources().length) {
        if (creep.pos.getRangeTo(storage) === 1) {
          creep.transfer(storage, creep.getCarryingResources()[0]);
        } else {
          creep.travelTo(storage);
        }
      } else {
        // Recycle quickly, probably in the way of other creeps
        recycle(creep, 3);
      }
      return;
    } else {
      delete creep.memory.recycle;
    }

    const from = Game.getObjectById(
      task.target as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;
    const to = Game.getObjectById(
      task.data.to as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;

    if (creep.store.getFreeCapacity(task.data.resourceType)) {
      if (creep.pos.getRangeTo(from) === 1) {
        creep.withdraw(from, task.data.resourceType);
        task.complete = true;
      } else {
        creep.travelTo(from);
      }
    } else {
      if (creep.pos.getRangeTo(to) === 1) {
        creep.transfer(to, task.data.resourceType);
        task.complete = true;
      } else {
        creep.travelTo(to);
      }
    }

    creep.say(`${task.data.resourceType} → ${to.structureType.substr(0, 4)}`);
  }
}
