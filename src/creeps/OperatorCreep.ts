import { TaskManager } from 'TaskManager';
import { isNthTick } from 'utils';
import { maxToStoreOfResource } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

interface OperatorTask extends CreepTask {
  type: 'transfer' | 'balance';
  data?: { to: string; resourceType: ResourceConstant };
}

type ResourceToMove = {
  from: StructureStorage | StructureTerminal;
  to: StructureStorage | StructureTerminal;
  type: ResourceConstant;
} | null;

// Keep resources balanced between storage/terminal
// also keep 2 closest towers full
// also fill center link to send to controller
// also fill center spawn
// TODO: also fill nuker
export class OperatorCreep extends CreepBase {
  role: CreepRole = 'operator';
  bodyOpts: BodySettings = {
    pattern: [CARRY],
    sizeLimit: 20,
  };
  taskPriority = 5;

  // Reset every tick
  // this method is used for checking targetNum as well so needs caching
  private _resourceToMoveCache: { tick: number; result: ResourceToMove } = {
    tick: Game.time,
    result: null,
  };

  // Creep carry capacity gets added to this to stop bouncing
  private threshold = 5000;

  private getResourceCount(
    _room: Room,
    target: StructureStorage | StructureTerminal
  ): { [resourceType: string]: number } {
    const resources: { [resourceType: string]: number } = {};

    if (target) {
      for (const resType in target.store) {
        const amount =
          target.store.getUsedCapacity(resType as ResourceConstant) ?? 0;

        if (amount > 0) {
          resources[resType] = amount;
        }
      }
    }

    return resources;
  }

  private findResourceToBalance(room: Room): ResourceToMove {
    if (
      !room.storage ||
      !room.storage.isActive() ||
      !room.terminal ||
      !room.terminal.isActive()
    ) {
      return null;
    }

    if (this._resourceToMoveCache?.tick !== Game.time) {
      this._resourceToMoveCache = { tick: Game.time, result: null };

      // Balance out storage between storage/terminal
      // use threshold so there are no more tasks when they're close enough
      const excessInTerminal = this.getResourceCount(room, room.terminal);
      const excessInStorage = this.getResourceCount(room, room.storage);

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

      const creepCarryCapacity =
        this.generateBody(room.energyCapacityAvailable).filter(
          part => part === CARRY
        ).length * 50;

      // Check if should move
      for (const resType in excessResources) {
        const excessTerminal = excessResources[resType].terminal ?? 0;
        const excessStorage = excessResources[resType].storage ?? 0;

        // If not close enough, transfer from fullest
        if (
          Math.abs(excessTerminal - excessStorage) >
          this.threshold + creepCarryCapacity * 2
        ) {
          if (
            excessTerminal > excessStorage &&
            room.storage.store.getUsedCapacity(resType as ResourceConstant) +
              creepCarryCapacity <
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
              creepCarryCapacity <
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

  // Only spawn from center spawn, otherwise can't access baseCenter
  // Direction is handled by HR
  shouldUseSpawn(spawn: StructureSpawn): boolean {
    return (
      spawn.pos.getRangeTo(
        new RoomPosition(
          spawn.room.memory.baseCenter?.x ?? 25,
          spawn.room.memory.baseCenter?.y ?? 25,
          spawn.room.name
        )
      ) === 1
    );
  }

  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) > 4 && room.storage?.isActive()) {
      return 1;
    }
    return 0;
  }

  isValidTask(creep: Creep, task: OperatorTask): boolean {
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): OperatorTask | null {
    // Doesn't need to be quick since it never has to move
    if (!isNthTick(3)) return null;

    const baseCenter = global.empire.colonies[creep.memory.homeRoom].roomPlanner
      .baseCenter as RoomPosition;

    // Fill center spawn
    const spawn = baseCenter.findInRange(FIND_MY_SPAWNS, 1, {
      filter: spawn => spawn.store.getFreeCapacity(RESOURCE_ENERGY),
    })[0];

    if (spawn) {
      return taskManager.createTask<OperatorTask>(
        creep.room.name,
        spawn.id,
        'transfer',
        1
      );
    }

    // Fill the 2 towers in range
    const tower = baseCenter.findInRange(FIND_MY_STRUCTURES, 1, {
      filter: struct =>
        struct.structureType === STRUCTURE_TOWER &&
        struct.store.getFreeCapacity(RESOURCE_ENERGY) > 200,
    })[0];

    if (tower) {
      return taskManager.createTask<OperatorTask>(
        creep.room.name,
        tower.id,
        'transfer',
        1
      );
    }

    // Fill center link
    const link = baseCenter.findInRange(FIND_MY_STRUCTURES, 1, {
      filter: struct =>
        struct.structureType === STRUCTURE_LINK &&
        struct.store.getFreeCapacity(RESOURCE_ENERGY),
    })[0];

    if (link) {
      return taskManager.createTask<OperatorTask>(
        creep.room.name,
        link.id,
        'transfer',
        1
      );
    }

    const resourceToMove = this.findResourceToBalance(
      Game.rooms[creep.memory.homeRoom]
    );

    if (!resourceToMove) return null;

    return taskManager.createTask<OperatorTask>(
      creep.memory.homeRoom,
      resourceToMove.from.id,
      'balance',
      1,
      { to: resourceToMove.to.id, resourceType: resourceToMove.type }
    );
  }

  run(creep: Creep): void {
    if ((creep.ticksToLive ?? Infinity) <= 3) {
      if (!creep.isEmpty()) {
        creep.transfer(
          creep.room.storage as StructureStorage,
          creep.getCarryingResources()[0]
        );
      }
      creep.say('peace');
      return;
    }

    const task = creep.memory.task as OperatorTask | undefined;
    if (!task) {
      creep.say('...');
      return;
    }

    if (task.type === 'transfer') {
      // Transfer to towers
      if (creep.isEmpty()) {
        creep.withdraw(creep.room.storage as StructureStorage, RESOURCE_ENERGY);
      } else {
        creep.transfer(
          Game.getObjectById(
            task.target as Id<StructureTower>
          ) as StructureTower,
          RESOURCE_ENERGY
        );
        task.complete = true;
      }
      creep.say('tower');
      return;
    }

    if (!task.data) {
      task.complete = true;
      return;
    }

    const from = Game.getObjectById(
      task.target as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;
    const to = Game.getObjectById(
      task.data.to as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;

    if (creep.store.getFreeCapacity(task.data.resourceType)) {
      creep.withdraw(from, task.data.resourceType);
    } else {
      creep.transfer(to, task.data.resourceType);
      task.complete = true;
    }

    creep.say(`${task.data.resourceType} → ${to.structureType.substr(0, 4)}`);
  }
}
