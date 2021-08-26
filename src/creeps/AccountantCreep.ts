import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { maxToStoreOfResource } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

// task.target is withdraw target id, to target id is in data.to
interface AccountantTask extends CreepTask {
  type: 'balance';
  data: { to: string; resourceType: ResourceConstant };
}

type ResourceToMove = {
  from: StructureStorage | StructureTerminal;
  to: StructureStorage | StructureTerminal;
  type: ResourceConstant;
} | null;

// Accountant balances resources between terminal and storage
export class AccountantCreep extends CreepBase {
  role: CreepRole = 'accountant';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, MOVE],
    sizeLimit: 2,
  };

  // Reset every tick
  // this method is used for checking targetNum as well so needs caching
  private _resourceToMoveCache: { tick: number; result: ResourceToMove } = {
    tick: Game.time,
    result: null,
  };

  // Creep carry capacity gets added to this to stop bouncing
  private threshold = 5000;

  private findExcessResources(
    _room: Room,
    target: StructureStorage | StructureTerminal
  ): { [resourceType: string]: number } {
    const excessResources: { [resourceType: string]: number } = {};

    if (target) {
      for (const resType in target.store) {
        const amount =
          target.store.getUsedCapacity(resType as ResourceConstant) ?? 0;

        if (amount > 0) {
          excessResources[resType] = amount;
        }
      }
    }

    return excessResources;
  }

  private findResourceToMove(room: Room): ResourceToMove {
    if (!room.storage || !room.terminal) return null;

    if (this._resourceToMoveCache?.tick !== Game.time) {
      this._resourceToMoveCache = { tick: Game.time, result: null };

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
              50 *
              2
        ) {
          if (
            excessTerminal > excessStorage &&
            room.storage.store.getUsedCapacity(resType as ResourceConstant) +
              excessTerminal <
              room.storage.store.getFreeCapacity(resType as ResourceConstant)
          ) {
            this._resourceToMoveCache.result = {
              from: room.terminal,
              to: room.storage,
              type: resType as ResourceConstant,
            };
            break;
          } else if (
            excessStorage > excessTerminal &&
            room.terminal.store.getUsedCapacity(resType as ResourceConstant) +
              excessStorage <
              room.terminal.store.getFreeCapacity(resType as ResourceConstant)
          ) {
            // Keep energy lower in terminal
            if (
              resType !== RESOURCE_ENERGY ||
              excessTerminal < maxToStoreOfResource(room, RESOURCE_ENERGY, true)
            ) {
              this._resourceToMoveCache.result = {
                from: room.storage,
                to: room.terminal,
                type: resType as ResourceConstant,
              };
              break;
            }
          }
        }
      }
    }

    return this._resourceToMoveCache.result;
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

  isValidTask(creep: Creep, task: AccountantTask): boolean {
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): AccountantTask | null {
    const resourceToMove = this.findResourceToMove(
      Game.rooms[creep.memory.homeRoom]
    );
    if (!resourceToMove) return null;

    return taskManager.createTask<AccountantTask>(
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

    const task = creep.memory.task as AccountantTask | undefined;
    if (!task || !storage || !terminal) {
      if (storage && creep.getCarryingResources().length) {
        if (creep.pos.getRangeTo(storage) === 1) {
          creep.transfer(storage, creep.getCarryingResources()[0]);
        } else {
          creep.travelTo(storage);
        }
      } else {
        recycle(creep, 200);
      }
      return;
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
