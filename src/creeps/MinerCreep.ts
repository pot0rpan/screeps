import config from 'config';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface MinerTask extends CreepTask {
  type: 'harvest';
  data?: { container: string };
}

// Miner creeps are for remote harvesting
export class MinerCreep extends CreepBase {
  role: CreepRole = 'miner';
  bodyOpts: BodySettings = {
    pattern: [WORK],
    sizeLimit: 6,
    suffix: [MOVE, MOVE],
  };

  // Number of sources in colonized adjacent rooms
  targetNum(room: Room): number {
    // Don't expand too early
    if ((room.controller?.level ?? 0) < 4) return 0;

    const { adjacentRoomNames } = global.empire.colonies[room.name];
    let num = 0;

    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (
        mem &&
        mem.colonize &&
        mem.sources &&
        mem.reserver === config.USERNAME &&
        !mem.hostiles
      )
        num += mem.sources.length;
    }

    return num;
  }

  isValidTask(creep: Creep, task: MinerTask): boolean {
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): MinerTask | null {
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (!mem) continue;
      if (!mem.colonize) continue;
      if (!mem.sources?.length) continue;

      for (const { id } of mem.sources) {
        if (!taskManager.isTaskTaken(roomName, id, 'harvest')) {
          return taskManager.createTask<MinerTask>(roomName, id, 'harvest', 1);
        }
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as MinerTask | undefined;
    if (!task) {
      creep.say('...');
      return;
    }

    // Move to room if not there
    if (creep.room.name !== task.room) {
      creep.travelTo(new RoomPosition(25, 25, task.room), { range: 10 });
      creep.say(task.room);
      return;
    }

    const source = Game.getObjectById(task.target as Id<Source>);
    if (!source) {
      task.complete = true;
      creep.say('wtf');
      return;
    }

    // Look for containers by task source
    // Save it to creep's task memory if available
    if (!task.data?.container) {
      const container = source.pos.findInRange<StructureContainer>(
        FIND_STRUCTURES,
        1,
        { filter: struct => struct.structureType === STRUCTURE_CONTAINER }
      )[0];

      if (container) {
        task.data = { container: container.id };
      }
    }

    const container = task.data?.container
      ? Game.getObjectById(task.data.container as Id<StructureContainer>)
      : null;

    if (container && creep.pos.getRangeTo(container) > 0) {
      creep.travelTo(container);
    } else if (creep.pos.getRangeTo(source) > 1) {
      creep.travelTo(source);
    } else {
      if (creep.harvest(source) === ERR_NOT_OWNER) {
        creep.say('cmon');
      }
    }
  }
}
