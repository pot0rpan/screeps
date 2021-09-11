import { TaskManager } from 'TaskManager';
import { maxToStoreOfResource } from 'utils/room';
import { BodySettings, CreepBase } from './CreepBase';

type TransferTarget = Id<
  | StructureStorage
  | StructureTerminal
  | StructureSpawn
  | StructureTower
  | StructureLink
>;

// task.target is where to withdraw FROM
// task.data.to is where to transfer TO
// If transfer to center link, linkTarget will be defined
// and used for requesting link transfer once task complete
interface OperatorTask extends CreepTask {
  type: 'transfer' | 'balance';
  target: TransferTarget;
  data: {
    to: TransferTarget;
    resourceType: ResourceConstant;
    linkTarget?: Id<StructureLink>;
  };
}

type ResourceToMove = {
  from: StructureStorage | StructureTerminal;
  to: StructureStorage | StructureTerminal;
  type: ResourceConstant;
} | null;

// Keep resources balanced between storage/terminal
// also keep 2 closest towers full
// also handle center link emptying to storage/filling to send to controller
// also fill center spawn
// TODO: also fill nuker
export class OperatorCreep extends CreepBase {
  role: CreepRole = 'operator';
  bodyOpts: BodySettings = {
    pattern: [CARRY],
    sizeLimit: 16,
  };
  taskPriority = 5;

  // Reset every tick
  // this method is used for checking targetNum as well so needs caching
  private _resourceToMoveCache: {
    [roomName: string]: { tick: number; result: ResourceToMove };
  } = {};

  // Creep carry capacity gets added to this to stop bouncing
  private threshold = 2000;

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
    if (!this._resourceToMoveCache[room.name]) {
      this._resourceToMoveCache[room.name] = { tick: Game.time, result: null };
    }

    if (this._resourceToMoveCache[room.name].tick !== Game.time) {
      this._resourceToMoveCache[room.name] = { tick: Game.time, result: null };

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
            this._resourceToMoveCache[room.name].result = {
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
              this._resourceToMoveCache[room.name].result = {
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

    return this._resourceToMoveCache[room.name].result;
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
    if (room.storage?.isActive()) {
      return 1;
    }
    return 0;
  }

  isValidTask(creep: Creep, task: OperatorTask): boolean {
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): OperatorTask | null {
    const storage = creep.room.storage;
    const baseCenter = global.empire.colonies[creep.memory.homeRoom].roomPlanner
      .baseCenter as RoomPosition;

    if (!storage || !baseCenter) return null;

    // Fill center spawn
    const spawn = baseCenter
      .findInRange(FIND_MY_SPAWNS, 1)
      .find(spawn => spawn.store.getFreeCapacity(RESOURCE_ENERGY));

    if (spawn) {
      return taskManager.createTask<OperatorTask>(
        creep.room.name,
        storage.id,
        'transfer',
        1,
        { to: spawn.id, resourceType: RESOURCE_ENERGY }
      );
    }

    // Fill the 2 towers in range
    const tower = creep.room
      .findTowers()
      .find(
        t =>
          t.store.getFreeCapacity(RESOURCE_ENERGY) > 200 &&
          baseCenter.getRangeTo(t) === 1
      );

    if (tower) {
      return taskManager.createTask<OperatorTask>(
        creep.room.name,
        storage.id,
        'transfer',
        1,
        { to: tower.id, resourceType: RESOURCE_ENERGY }
      );
    }

    // Handle center link
    const centerLink = creep.room.findCenterLinks()[0];
    if (centerLink) {
      // If link is full, send to controller or storage
      if (centerLink.store.getFreeCapacity(RESOURCE_ENERGY) < 100) {
        const emptyUpgradeLink = creep.room
          .findUpgradeLinks()
          .find(link => link.store.getUsedCapacity(RESOURCE_ENERGY) < 200);
        if (emptyUpgradeLink) {
          // If empty upgrade link, queue transfer
          global.empire.colonies[creep.memory.homeRoom].queueLinkTransfer(
            centerLink.id,
            emptyUpgradeLink.id
          );
        } else {
          // Otherwise move center link energy to storage
          return taskManager.createTask<OperatorTask>(
            creep.room.name,
            centerLink.id,
            'transfer',
            1,
            { to: storage.id, resourceType: RESOURCE_ENERGY }
          );
        }
      } else {
        // Center link is empty
        const emptyUpgradeLink = creep.room
          .findUpgradeLinks()
          .find(link => link.store.getUsedCapacity(RESOURCE_ENERGY) < 200);
        if (emptyUpgradeLink) {
          // Fill center link then queue transfer to upgrade link
          return taskManager.createTask<OperatorTask>(
            creep.room.name,
            storage.id,
            'transfer',
            1,
            {
              to: centerLink.id,
              resourceType: RESOURCE_ENERGY,
              linkTarget: emptyUpgradeLink.id,
            }
          );
        }
      }
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
      if (creep.isEmpty()) {
        creep.withdraw(
          Game.getObjectById(task.target) as Structure,
          task.data.resourceType
        );
      } else {
        const toTarget = Game.getObjectById(task.data.to) as Structure;
        creep.transfer(toTarget, task.data.resourceType);
        task.complete = true;

        // Make a link transfer request
        if (toTarget instanceof StructureLink && task.data.linkTarget) {
          global.empire.colonies[creep.memory.homeRoom].queueLinkTransfer(
            toTarget.id,
            task.data.linkTarget
          );
        }
      }
      return;
    }

    if (!task.data) {
      task.complete = true;
      return;
    }

    // Balance task
    const from = Game.getObjectById(
      task.target as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;
    const to = Game.getObjectById(
      task.data.to as Id<StructureStorage | StructureTerminal>
    ) as StructureStorage | StructureTerminal;

    if (creep.store.getFreeCapacity(task.data.resourceType)) {
      console.log('WITHDRAW');
      console.log(creep.withdraw(from, task.data.resourceType));
    } else {
      console.log('TRANSFER');
      creep.transfer(to, task.data.resourceType);
      task.complete = true;
    }

    creep.say(`${task.data.resourceType} → ${to.structureType.substr(0, 4)}`);
  }
}
