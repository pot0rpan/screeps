import config from 'config';
import { isNthTick } from 'utils';
import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface ProspectorTask extends CreepTask {
  type: 'harvest';
  data: { type: MineralConstant };
}

// https://docs.screeps.com/resources.html
export class ProspectorCreep extends CreepBase {
  role: CreepRole = 'prospector';
  bodyOpts: BodySettings = {
    pattern: [WORK, CARRY, MOVE],
    sizeLimit: 4,
  };

  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) < 6) return 0;

    let num = 0;

    const { adjacentRoomNames } = global.empire.colonies[room.name];

    // Home room
    if (
      room.find<StructureExtractor>(FIND_STRUCTURES, {
        filter: struct => {
          if (struct.structureType !== STRUCTURE_EXTRACTOR) return false;
          const mineral = struct.pos.lookFor(LOOK_MINERALS)[0];
          if (!mineral) return false;
          return (
            room.storage &&
            room.storage.store.getUsedCapacity(mineral.mineralType) <
              config.MAX_MINERAL_STORAGE
          );
        },
      }).length
    ) {
      num++;
    }

    // Adjacent rooms
    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (mem && mem.colonize && !mem.hostiles && mem.minerals?.length) {
        num += mem.minerals.filter(
          min =>
            min.extractor &&
            room.storage &&
            room.storage.store.getUsedCapacity(min.type) <
              config.MAX_MINERAL_STORAGE
        ).length;
      }
    }

    return num;
  }

  isValidTask(creep: Creep, task: ProspectorTask): boolean {
    if (Game.getObjectById(task.target as Id<Mineral>)) return true;

    return false;
  }

  findTask(creep: Creep, taskManager: TaskManager): ProspectorTask | null {
    const homeRoom = Game.rooms[creep.memory.homeRoom];
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    // Home room
    for (const ext of homeRoom.find<StructureExtractor>(FIND_STRUCTURES, {
      filter: struct => struct.structureType === STRUCTURE_EXTRACTOR,
    })) {
      if (!taskManager.isTaskTaken(homeRoom.name, ext.id, 'harvest')) {
        const mineral = ext.pos.lookFor(LOOK_MINERALS)[0];

        return taskManager.createTask<ProspectorTask>(
          homeRoom.name,
          mineral.id,
          'harvest',
          1,
          { type: mineral.mineralType }
        );
      }
    }

    // Adjacent rooms
    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (mem && mem.colonize && !mem.hostiles && mem.minerals?.length) {
        for (const minMem of mem.minerals) {
          if (!minMem.extractor) continue;
          if (!taskManager.isTaskTaken(roomName, minMem.extractor, 'harvest')) {
            return taskManager.createTask<ProspectorTask>(
              homeRoom.name,
              minMem.id,
              'harvest',
              1,
              { type: minMem.type }
            );
          }
        }
      }
    }

    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as ProspectorTask;

    if (!task) {
      creep.say('...');
      recycle(creep);
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

          // Check for dropped resources along the way
          if (isNthTick(2)) {
            const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
              filter: res => res.resourceType === task.data.type,
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
