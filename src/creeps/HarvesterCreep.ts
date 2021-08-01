import { TaskManager } from 'TaskManager';
import { CreepBase } from './CreepBase';

// Type is harvest just like when other creeps go to sources
// So the container is stored as the target instead of the source
// This helps avoid task id conflicts with different roles
// Should only really matter at early rcl when Pioneers still exist
interface MinerTask extends CreepTask {
  type: 'harvest';
  data: {
    source: string;
  };
}

// Pioneers are unspecialized, used only for level 1
// They mine from source and transfer to spawn or upgrade controller
export class HarvesterCreep extends CreepBase {
  role: CreepRole = 'harvester';
  bodyPattern = [WORK, MOVE];
  maxBodyLength = 6;

  // Same number as source containers built
  targetNum(room: Room): number {
    if (room.controller && room.controller.level < 2) return 0;

    const numContainers = room.find(FIND_STRUCTURES, {
      filter: struct =>
        struct.structureType === STRUCTURE_CONTAINER &&
        room.lookForAtArea(
          LOOK_SOURCES,
          struct.pos.y - 1,
          struct.pos.x - 1,
          struct.pos.y + 1,
          struct.pos.x + 1,
          true
        ).length
    }).length;

    return numContainers;
  }

  findTask(creep: Creep, taskManager: TaskManager): MinerTask | null {
    const container = creep.room
      .findSourceContainers()
      .filter(
        container =>
          !taskManager.isTaskTaken(creep.pos.roomName, container.id, 'harvest')
      )[0];

    if (container) {
      const source = creep.room
        .findSources()
        .filter(
          source =>
            source.pos.getRangeTo(container.pos.x, container.pos.y) === 1
        )[0];

      if (container) {
        return taskManager.createTask<MinerTask>(
          container.pos.roomName,
          container.id,
          'harvest',
          1,
          { source: source.id }
        );
      }
    }

    return null;
  }

  isValidTask(creep: Creep, task: MinerTask): boolean {
    return (
      !!Game.getObjectById(task.target as Id<StructureContainer>) &&
      !!Game.getObjectById(task.data.source as Id<Source>)
    );
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task as MinerTask;
    const container = Game.getObjectById(task.target as Id<StructureContainer>);
    const source = Game.getObjectById(task.data.source as Id<Source>);

    if (!container || !source) {
      creep.memory.task.complete = true;
      return;
    }

    // If creep is on container, harvest data.source
    if (creep.pos.x === container.pos.x && creep.pos.y === container.pos.y) {
      creep.harvest(source);
    } else {
      creep.moveTo(container);
    }
  }
}
