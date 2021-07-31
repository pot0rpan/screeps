import { TaskManager } from 'TaskManager';
import { CreepBase } from './CreepBase';

interface HarvesterTask extends CreepTask {
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

  findTask(creep: Creep, taskManager: TaskManager): HarvesterTask | null {
    const container = creep.room
      .findSourceContainers()
      .filter(
        container =>
          !taskManager.tasks[
            taskManager.createTask(creep.pos.roomName, container.id, 'harvest')
              .id
          ]
      )[0];

    if (container) {
      const source = creep.room
        .findSources()
        .filter(
          source =>
            source.pos.getRangeTo(container.pos.x, container.pos.y) === 1
        )[0];

      if (source) {
        return taskManager.createTask<HarvesterTask>(
          container.pos.roomName,
          container.id,
          'harvest',
          { source: source.id }
        );
      }
    }

    return null;
  }

  isValidTask(creep: Creep, task: HarvesterTask): boolean {
    return (
      !!Game.getObjectById(task.target as Id<StructureContainer>) &&
      !!Game.getObjectById(task.data.source as Id<Source>)
    );
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task as HarvesterTask;
    const container = Game.getObjectById(task.target as Id<StructureContainer>);
    const source = Game.getObjectById(task.data.source as Id<Source>);

    if (!container || !source) {
      creep.memory.task.complete = true;
      return;
    }

    // If creep is on container, harvest data.source
    if (creep.pos.getRangeTo(container.pos.x, container.pos.y) === 0) {
      creep.harvest(source);
    } else {
      creep.moveTo(container);
    }
  }
}
