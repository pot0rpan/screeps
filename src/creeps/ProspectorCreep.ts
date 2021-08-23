import config from 'config';
import { isNthTick } from 'utils';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

// Target is the mineral id
interface ProspectorTask extends CreepTask {
  type: 'harvest';
  data: { type: MineralConstant };
}

// https://docs.screeps.com/resources.html
export class ProspectorCreep extends CreepBase {
  role: CreepRole = 'prospector';
  bodyOpts: BodySettings = {
    pattern: [WORK, CARRY, MOVE],
  };

  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) < 6) return 0;
    if (!room.storage) return 0;

    let num = 0;

    const { adjacentRoomNames } = global.empire.colonies[room.name];

    // Home room
    if (
      room.find<StructureExtractor>(FIND_STRUCTURES, {
        filter: struct => {
          if (struct.structureType !== STRUCTURE_EXTRACTOR) return false;
          const mineral = struct.pos.lookFor(LOOK_MINERALS)[0];
          if (!mineral || !mineral.mineralAmount) return false;
          return true;
        },
      }).length
    ) {
      num++;
    }

    // Adjacent rooms
    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (
        mem &&
        mem.colonize &&
        !mem.hostiles &&
        mem.mineral &&
        mem.mineral.extractor &&
        mem.mineral.amount
      ) {
        num++;
      }
    }

    return num;
  }

  isValidTask(creep: Creep, task: ProspectorTask): boolean {
    if (task.room === creep.memory.homeRoom) {
      const mineral = Game.getObjectById(task.target as Id<Mineral>);

      if (mineral && mineral.mineralAmount) {
        return true;
      }
    } else {
      const roomMem = Memory.rooms[task.room];

      if (roomMem.mineral && roomMem.mineral.amount) return true;
    }

    return false;
  }

  findTask(creep: Creep, taskManager: TaskManager): ProspectorTask | null {
    const homeRoom = Game.rooms[creep.memory.homeRoom];

    if (!homeRoom.storage) return null;

    // Home room
    const extractor = homeRoom.find<StructureExtractor>(FIND_STRUCTURES, {
      filter: struct => struct.structureType === STRUCTURE_EXTRACTOR,
    })[0];

    if (extractor) {
      const mineral = extractor.pos.lookFor(LOOK_MINERALS)[0];

      if (
        mineral.mineralAmount &&
        !taskManager.isTaskTaken(homeRoom.name, mineral.id, 'harvest')
      ) {
        return taskManager.createTask<ProspectorTask>(
          homeRoom.name,
          mineral.id,
          'harvest',
          1,
          { type: mineral.mineralType }
        );
      }
    }

    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    // Adjacent rooms
    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (
        mem &&
        mem.colonize &&
        !mem.hostiles &&
        mem.mineral &&
        mem.mineral.extractor &&
        mem.mineral.amount &&
        !taskManager.isTaskTaken(roomName, mem.mineral.extractor, 'harvest')
      ) {
        return taskManager.createTask<ProspectorTask>(
          homeRoom.name,
          mem.mineral.id,
          'harvest',
          1,
          { type: mem.mineral.type }
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as ProspectorTask;

    if (!task) {
      creep.say('...');
      // Probably waiting for mineral to regenerate which takes a long time
      // Recycle with short delay
      recycle(creep, 5);
      return;
    }

    // Retreat if hostiles
    if (
      task.room !== creep.memory.homeRoom &&
      Memory.rooms[task.room].hostiles
    ) {
      creep.travelToRoom(creep.memory.homeRoom);
      return;
    }

    if (creep.memory.working) {
      // Take to storage
      if (creep.room.name !== creep.memory.homeRoom) {
        creep.travelToRoom(creep.memory.homeRoom);
      } else {
        const storage = creep.room.storage;
        if (!storage) {
          creep.say('...');
          task.complete = true;
          return;
        }
        if (creep.pos.getRangeTo(storage) > 1) {
          creep.travelTo(storage);
        } else {
          creep.transfer(storage, task.data.type);
        }
      }
    } else {
      // Mine
      if (creep.room.name !== task.room) {
        creep.travelToRoom(task.room);
      } else {
        const mineral = Game.getObjectById(task.target as Id<Mineral>);
        if (!mineral) {
          creep.say('...');
          task.complete = true;
          return;
        }

        if (creep.pos.getRangeTo(mineral) > 1) {
          creep.travelTo(mineral);

          // Check for dropped resources when empty
          if (!creep.store.getUsedCapacity(mineral.mineralType)) {
            const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
              filter: drop =>
                drop.amount && drop.resourceType === mineral.mineralType,
            })[0];
            if (dropped) {
              creep.pickup(dropped);
            }
          }
        } else {
          creep.harvest(mineral);
        }
      }
    }

    if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
      creep.memory.working = false;
    } else if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
    }
  }
}
