import { recycle } from 'actions/recycle';
import config from 'config';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

// Target is withdraw target id
interface SalesmanTask extends CreepTask {
  type: 'withdraw';
  data: { to: string; resourceType: ResourceConstant };
}

// Currently this creep only moves excess resources from storage to terminal
// TODO: Implement a non-creep class for handling market stuff
export class SalesmanCreep extends CreepBase {
  role: CreepRole = 'salesman';
  bodyOpts: BodySettings = {
    pattern: [MOVE, CARRY],
    sizeLimit: 4,
  };

  private maxToStoreOfResource(
    room: Room,
    resourceType: ResourceConstant
  ): number {
    return resourceType === 'energy'
      ? config.MAX_ENERGY_STORAGE(room.controller?.level ?? 0)
      : config.MAX_MINERAL_STORAGE;
  }

  private findExcessResources(
    room: Room,
    target: StructureStorage | StructureTerminal
  ): ResourceConstant[] {
    const excessResources: { type: ResourceConstant; amount: number }[] = [];

    if (target) {
      for (const resType in target.store) {
        const amount =
          target.store.getUsedCapacity(resType as ResourceConstant) ?? 0;

        const amountExcess =
          amount - this.maxToStoreOfResource(room, resType as ResourceConstant);
        if (amountExcess > 0) {
          excessResources.push({
            type: resType as ResourceConstant,
            amount: amountExcess,
          });
        }
      }
    }

    return excessResources
      .sort((a, b) => b.amount - a.amount)
      .map(({ type }) => type);
  }

  private findResourceToMove(room: Room): {
    from: StructureStorage | StructureTerminal;
    to: StructureStorage | StructureTerminal;
    type: ResourceConstant;
  } | null {
    if (!room.storage || !room.terminal) return null;

    const excessResourcesInStorage = this.findExcessResources(
      room,
      room.storage
    );
    const excessResourcesInTerminal = this.findExcessResources(
      room,
      room.terminal
    );

    for (const excessInTerminal of excessResourcesInTerminal) {
      // Only move if target has less of the resource
      if (
        excessInTerminal &&
        room.terminal.store.getUsedCapacity(excessInTerminal) >
          room.storage.store.getUsedCapacity(excessInTerminal)
      ) {
        return {
          from: room.terminal,
          to: room.storage,
          type: excessInTerminal,
        };
      }
    }

    for (const excessInStorage of excessResourcesInStorage) {
      if (
        excessInStorage &&
        room.storage.store.getUsedCapacity(excessInStorage) >
          room.terminal.store.getUsedCapacity(excessInStorage)
      ) {
        return {
          from: room.storage,
          to: room.terminal,
          type: excessInStorage,
        };
      }
    }

    return null;
  }

  // 1 if any resources in storage are above max (with a small buffer)
  targetNum(room: Room): number {
    const potentialTask = this.findResourceToMove(room);
    if (!potentialTask) return 0;

    if (
      potentialTask.from.store.getUsedCapacity(potentialTask.type) >
      this.maxToStoreOfResource(room, potentialTask.type) + 2000
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

    if (
      resourceToMove.from.store.getUsedCapacity(resourceToMove.type) -
        this.maxToStoreOfResource(
          Game.rooms[creep.memory.homeRoom],
          resourceToMove.type
        ) <
      creep.store.getCapacity()
    ) {
      return null;
    }

    return taskManager.createTask<SalesmanTask>(
      creep.memory.homeRoom,
      resourceToMove.from.id,
      'withdraw',
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
  }
}
