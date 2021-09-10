import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { sortByRange } from 'utils/sort';
import { BodySettings, CreepBase } from './CreepBase';

interface HaulerTask extends CreepTask {
  type: 'withdraw' | 'transfer' | 'pickup';
  target: Id<Resource | StructureContainer | StructureStorage>;
}

export class HaulerCreep extends CreepBase {
  role: CreepRole = 'hauler';
  bodyOpts: BodySettings = {
    pattern: [CARRY, MOVE],
    ordered: true,
  };

  private MIN_RESOURCE_AMOUNT = 200;

  targetNum(room: Room): number {
    if (!room.storage) return 0;

    const rcl = room.controller?.level ?? 0;

    const numMiners = _.filter(
      Game.creeps,
      creep =>
        !creep.spawning &&
        creep.memory.homeRoom === room.name &&
        creep.memory.role === 'miner'
    ).length;

    if (rcl < 6) return Math.min(4, numMiners + 1);
    if (rcl === 6) return Math.min(3, numMiners);

    return Math.max(1, Math.ceil(numMiners / 2));
  }

  isValidTask(creep: Creep, task: HaulerTask): boolean {
    if (creep.room.name !== task.room) return true;

    if (Memory.rooms[task.room]?.hostiles) return false;

    switch (task.type) {
      case 'pickup':
        return (
          (Game.getObjectById(task.target as Id<Resource>)?.amount ?? 0) >
          this.MIN_RESOURCE_AMOUNT
        );
      case 'withdraw':
        return (
          (Game.getObjectById(
            task.target as Id<StructureContainer>
          )?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) >
          this.MIN_RESOURCE_AMOUNT
        );
      case 'transfer':
        return (
          (Game.getObjectById(
            task.target as Id<StructureStorage>
          )?.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) >
          this.MIN_RESOURCE_AMOUNT
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
      // Don't grab any energy if likely to die with it
      if (!creep.spawning && (creep.ticksToLive ?? 0) < 100) {
        return null;
      }

      // Find dropped resources in adjacent rooms first,
      // then find fullest adjacent room container that's not taken by other hauler
      const { adjacentRoomNames } =
        global.empire.colonies[creep.memory.homeRoom];
      let containers: StructureContainer[] = [];
      let dropped: Resource[] = [];

      for (const roomName of adjacentRoomNames) {
        if (!Memory.rooms[roomName]?.colonize) continue;
        if (Memory.rooms[roomName]?.hostiles) continue;

        const room = Game.rooms[roomName];
        if (!room) {
          console.log('no visibility of', roomName);
          continue;
        }

        containers = containers.concat(
          room.find<StructureContainer>(FIND_STRUCTURES, {
            filter: struct =>
              struct.structureType === STRUCTURE_CONTAINER &&
              struct.store.getUsedCapacity(RESOURCE_ENERGY) >
                this.MIN_RESOURCE_AMOUNT,
          })
        );

        dropped = dropped.concat(
          room.find(FIND_DROPPED_RESOURCES, {
            filter: res => res.amount > this.MIN_RESOURCE_AMOUNT,
          }) as Resource[]
        );
      }

      if (dropped.length) {
        dropped = dropped.sort(sortByRange(creep));
        return taskManager.createTask<HaulerTask>(
          dropped[0].pos.roomName,
          dropped[0].id,
          'pickup',
          dropped[0].amount -
            creep.store.getFreeCapacity(dropped[0].resourceType) >
            this.MIN_RESOURCE_AMOUNT
            ? 2
            : 1
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
              container.store.getUsedCapacity(RESOURCE_ENERGY) -
                creep.store.getFreeCapacity(RESOURCE_ENERGY) >
                this.MIN_RESOURCE_AMOUNT
                ? 2
                : 1
            );
          }
        }
      }

      console.log('no tasks for', creep);

      return null;
    }
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    if (!creep.memory.task) {
      recycle(creep, 300);
      return;
    }

    const task = creep.memory.task as HaulerTask;

    // Toggle `working` boolean if working and out of energy
    // or not working and full of energy
    // Also mark task as complete so TaskManager assigns a new one
    if (creep.memory.working && creep.isEmpty()) {
      creep.memory.working = false;
      task.complete = true;
    } else if (
      // Switch to working if full,
      // or almost full and task is in different room - probably going past storage anyway
      !creep.memory.working &&
      (creep.isFull() ||
        (task.room !== creep.room.name &&
          creep.store.getUsedCapacity() > 0.8 * creep.store.getCapacity()))
    ) {
      creep.memory.working = true;
      task.complete = true;
    }

    if (task.complete) return;

    // Retreat if hostiles
    if (Memory.rooms[task.room].hostiles) {
      creep.travelToRoom(creep.memory.homeRoom, { ignoreRoads: true });
      return;
    }

    const target = Game.getObjectById(
      task.target as Id<StructureContainer | StructureStorage | Resource>
    );

    if (!target) {
      // Assume room just has no visibility
      creep.travelTo(new RoomPosition(25, 25, task.room), {
        range: 10,
        ignoreRoads: true,
      });
      return;
    }

    if (creep.pos.getRangeTo(target) > 1) {
      // Ignore roads for now since move/carry is 1:1
      creep.travelTo(target, { ignoreRoads: true });
    } else {
      switch (task.type) {
        case 'transfer':
          creep.transfer(
            target as StructureStorage,
            creep.getCarryingResources()[0]
          );
          break;
        case 'withdraw':
          creep.withdraw(target as StructureContainer, RESOURCE_ENERGY);
          break;
        case 'pickup':
          creep.pickup(target as Resource);
          break;
      }
      task.complete = true;
    }
  }
}
