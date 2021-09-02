import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

// Type is harvest just like when other creeps go to sources
// So the container is stored as the target instead of the source
// This helps avoid task id conflicts with different roles
// Should only really matter at early rcl when Pioneers still exist
interface HarvesterTask extends CreepTask {
  type: 'harvest';
  data: {
    source: string;
    positions: { x: number; y: number }[];
  };
}

declare global {
  interface CreepMemory {
    inPosition: boolean;
  }
}

// Pioneers are unspecialized, used only for level 1
// They mine from source and transfer to spawn or upgrade controller
export class HarvesterCreep extends CreepBase {
  role: CreepRole = 'harvester';
  bodyOpts: BodySettings = {
    pattern: [WORK],
    sizeLimit: 8,
    suffix: [CARRY, MOVE, MOVE],
  };

  // Same number as source containers built
  targetNum(room: Room): number {
    if (room.controller && room.controller.level < 2) return 0;
    if (room.memory.defcon) return 0;

    return room.findSourceContainers().length;
  }

  findTask(creep: Creep, taskManager: TaskManager): HarvesterTask | null {
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
          source => source.pos.getRangeTo(container.pos.x, container.pos.y) <= 2
        )[0];

      if (source) {
        // Positions where both source and container are accessible
        // Move to one of these then set inPosition=true in memory to save CPU
        const positions = source.pos
          .getAdjacentPositions(1)
          .filter(pos => pos.getRangeTo(container) === 1)
          .map(pos => ({ x: pos.x, y: pos.y }));

        return taskManager.createTask<HarvesterTask>(
          container.pos.roomName,
          container.id,
          'harvest',
          1,
          { source: source.id, positions }
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

    // Stop mining if container full
    // Harvester doesn't sit on it so dropped resources are wasted
    if (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      creep.say('...');
      return;
    }

    if (!creep.memory.inPosition) {
      const targetPos = new RoomPosition(
        task.data.positions[0].x,
        task.data.positions[0].y,
        task.room
      );

      if (creep.pos.isEqualTo(targetPos)) {
        creep.memory.inPosition = true;
      } else {
        // Move to first position
        creep.travelTo(targetPos);
        return;
      }
    }

    // If too full and will drop energy next harvest, put in container
    if (
      creep.store.getFreeCapacity(RESOURCE_ENERGY) <=
      creep.getActiveBodyparts(WORK) * 2
    ) {
      creep.transfer(container, RESOURCE_ENERGY);
    }

    // If creep is at source, harvest data.source
    if (source.energy) {
      creep.harvest(source);
    } else {
      creep.say('...');
    }
  }
}
