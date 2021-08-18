import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface HaulerTask extends CreepTask {
  type: 'withdraw' | 'transfer' | 'pickup';
}

export class HaulerCreep extends CreepBase {
  role: CreepRole = 'hauler';
  bodyOpts: BodySettings = {
    pattern: [CARRY, CARRY, WORK, MOVE, MOVE, MOVE],
    sizeLimit: 6,
    ordered: true,
  };

  targetNum(room: Room): number {
    if (!room.storage) return 0;

    return _.filter(
      Game.creeps,
      creep =>
        creep.memory.homeRoom === room.name && creep.memory.role === 'miner'
    ).length;
  }

  isValidTask(creep: Creep, task: HaulerTask): boolean {
    if (creep.room.name !== task.room) return true;

    switch (task.type) {
      case 'pickup':
        return !!Game.getObjectById(task.target as Id<Resource>);
      case 'withdraw':
        return (
          (Game.getObjectById(
            task.target as Id<StructureContainer>
          )?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0
        );
      case 'transfer':
        return (
          (Game.getObjectById(
            task.target as Id<StructureStorage>
          )?.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) > 0
        );
      default:
        return false;
    }
  }

  findTask(creep: Creep, taskManager: TaskManager): HaulerTask | null {
    if (creep.memory.working) {
      // Deposit in center storage
      const storage = Game.rooms[creep.memory.homeRoom].storage;
      if (!storage) return null;

      return taskManager.createTask<HaulerTask>(
        creep.memory.homeRoom,
        storage.id,
        'transfer'
      );
    } else {
      // Find fullest adjacent room contaier that's not taken by other hauler
      const { adjacentRoomNames } =
        global.empire.colonies[creep.memory.homeRoom];
      let containers: StructureContainer[] = [];
      let dropped: Resource<RESOURCE_ENERGY>[] = [];

      for (const roomName of adjacentRoomNames) {
        if (!Memory.rooms[roomName]?.colonize) continue;

        const room = Game.rooms[roomName];
        if (!room) {
          console.log('no visibility of', roomName);
          continue;
        }

        containers = containers.concat(
          ...room.find<StructureContainer>(FIND_STRUCTURES, {
            filter: struct => struct.structureType === STRUCTURE_CONTAINER,
          })
        );

        dropped = dropped.concat(
          ...(room.find(FIND_DROPPED_RESOURCES, {
            filter: res => res.resourceType === RESOURCE_ENERGY,
          }) as Resource<RESOURCE_ENERGY>[])
        );
      }

      if (containers.length) {
        containers = containers.sort(
          (a, b) =>
            a.store.getFreeCapacity(RESOURCE_ENERGY) -
            b.store.getFreeCapacity(RESOURCE_ENERGY)
        );

        for (const container of containers) {
          if (
            !taskManager.isTaskTaken(
              container.room.name,
              container.id,
              'withdraw'
            )
          ) {
            return taskManager.createTask<HaulerTask>(
              container.room.name,
              container.id,
              'withdraw',
              2 //1
            );
          }
        }
      }

      if (dropped.length) {
        dropped = dropped.sort((a, b) => b.amount - a.amount);
        return taskManager.createTask<HaulerTask>(
          dropped[0].pos.roomName,
          dropped[0].id,
          'pickup',
          dropped[0].amount > creep.store.getFreeCapacity(RESOURCE_ENERGY)
            ? 2
            : 1
        );
      }

      console.log('no tasks for', creep);

      return null;
    }
  }

  run(creep: Creep): void {
    if (!creep.memory.task) {
      creep.say('...');
      return;
    }

    const task = creep.memory.task as HaulerTask;

    const target = Game.getObjectById(
      task.target as Id<StructureContainer | StructureStorage | Resource>
    );

    if (!target) {
      // Assume room just has no visibility
      creep.travelTo(new RoomPosition(25, 25, task.room), { range: 10 });

      // Fix damaged structures in remote rooms
      if (
        creep.memory.working &&
        creep.room.name !== creep.memory.homeRoom &&
        creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        const struct = creep.pos.findInRange(FIND_STRUCTURES, 3, {
          filter: struct => struct.hits < struct.hitsMax,
        })[0];
        if (struct) {
          creep.repair(struct);
        }
      }
      return;
    }

    let res: ScreepsReturnCode = ERR_NOT_FOUND;

    switch (task.type) {
      case 'transfer':
        res = creep.transfer(target as StructureStorage, RESOURCE_ENERGY);
        break;
      case 'withdraw':
        res = creep.withdraw(target as StructureContainer, RESOURCE_ENERGY);
        break;
      case 'pickup':
        res = creep.pickup(target as Resource);
        break;
      default:
        creep.memory.task.complete = true;
    }

    if (res === OK) {
      creep.memory.task.complete = true;
    } else if (res === ERR_NOT_IN_RANGE) {
      // Find dropped resources in range
      const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1)[0];
      if (dropped) creep.pickup(dropped);

      creep.travelTo(target);
    }

    // Toggle `working` boolean if working and out of energy
    // or not working and full of energy
    // Also mark task as complete so TaskManager assigns a new one
    if (creep.memory.working && creep.isEmpty()) {
      creep.memory.working = false;
      creep.memory.task.complete = true;
    } else if (!creep.memory.working && creep.isFull()) {
      creep.memory.working = true;
      creep.memory.task.complete = true;
    }
  }
}
