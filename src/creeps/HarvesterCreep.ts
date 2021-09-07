import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface HarvesterTask extends CreepTask {
  type: 'harvest_static';
  target: Id<Source>;
  data: {
    container?: Id<StructureContainer>;
    link?: Id<StructureLink>;
    // Positions where source and link (preferred) or container is accessible
    positions: { x: number; y: number }[];
  };
}

declare global {
  interface CreepMemory {
    inPosition?: boolean;
  }
}

export class HarvesterCreep extends CreepBase {
  role: CreepRole = 'harvester';
  bodyOpts: BodySettings = {
    pattern: [WORK],
    sizeLimit: 8,
    suffix: [CARRY, MOVE, MOVE],
  };

  // Same number as sources with either container or link (or both)
  targetNum(room: Room): number {
    if (room.controller && room.controller.level < 2) return 0;
    if (room.memory.defcon) return 0;

    return room
      .findSources()
      .filter(source => source.findContainer() || source.findLink()).length;
  }

  findTask(creep: Creep, taskManager: TaskManager): HarvesterTask | null {
    for (const source of creep.room.findSources()) {
      if (
        !taskManager.isTaskTaken(creep.room.name, source.id, 'harvest_static')
      ) {
        const container = source.findContainer();
        const link = source.findLink();

        if (container || link) {
          const positions = source.pos
            .getAdjacentPositions(1)
            .filter(pos => pos.getRangeTo(link || container!) === 1)
            .map(pos => ({ x: pos.x, y: pos.y }));

          return taskManager.createTask<HarvesterTask>(
            creep.room.name,
            source.id,
            'harvest_static',
            1,
            {
              container: container?.id,
              link: link?.id,
              positions,
            }
          );
        }
      }
    }

    return null;
  }

  isValidTask(creep: Creep, task: HarvesterTask): boolean {
    if (task.data.link) {
      return !!Game.getObjectById(task.data.link);
    } else if (task.data.container) {
      return !!Game.getObjectById(task.data.container);
    }
    return false;
  }

  run(creep: Creep): void {
    if (!creep.memory.task || creep.memory.task.complete) return;

    const task = creep.memory.task as HarvesterTask;
    const source = Game.getObjectById(task.target);
    const transferTarget = task.data.link
      ? Game.getObjectById(task.data.link)
      : task.data.container
      ? Game.getObjectById(task.data.container)
      : null;

    if (!transferTarget || !source) {
      creep.memory.task.complete = true;
      return;
    }

    // Stop mining if container/link full
    // If using a link, queue transfer request to center if center not full
    // @ts-ignore Not sure why needed
    if (transferTarget.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      creep.say('...');
      if (transferTarget instanceof StructureLink) {
        const centerLink = creep.room
          .findCenterLinks()
          .find(link => link.store.getFreeCapacity(RESOURCE_ENERGY));
        if (centerLink) {
          global.empire.colonies[creep.memory.homeRoom].queueLinkTransfer(
            transferTarget.id,
            centerLink.id
          );
        }
      }
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

    // If too full and will drop energy next harvest, put in container/link
    if (
      creep.store.getFreeCapacity(RESOURCE_ENERGY) <=
      creep.getActiveBodyparts(WORK) * 2
    ) {
      creep.transfer(transferTarget, RESOURCE_ENERGY);
    }

    // If creep is at source, harvest data.source
    if (source.energy) {
      creep.harvest(source);
    } else {
      creep.say('...');
    }
  }
}
