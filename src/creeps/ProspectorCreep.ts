import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface ProspectorTask extends CreepTask {
  type: 'harvest';
  target: Id<Mineral>;
  data: { type: MineralConstant; container?: Id<StructureContainer> };
}

// https://docs.screeps.com/resources.html
export class ProspectorCreep extends CreepBase {
  role: CreepRole = 'prospector';
  bodyOpts: BodySettings = {
    pattern: [WORK, WORK, WORK, CARRY, MOVE, MOVE],
  };

  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) < 6) return 0;
    if (!room.storage) return 0;
    if (room.memory.defcon) return 0;

    return room.find<StructureExtractor>(FIND_STRUCTURES, {
      filter: struct => {
        if (struct.structureType !== STRUCTURE_EXTRACTOR) return false;
        const mineral = struct.pos.lookFor(LOOK_MINERALS)[0];
        if (!mineral || !mineral.mineralAmount) return false;
        return true;
      },
    }).length;
  }

  isValidTask(creep: Creep, task: ProspectorTask): boolean {
    const mineral = Game.getObjectById(task.target as Id<Mineral>);
    return !!mineral && !!mineral.mineralAmount;
  }

  findTask(creep: Creep, taskManager: TaskManager): ProspectorTask | null {
    const homeRoom = Game.rooms[creep.memory.homeRoom];

    if (!homeRoom.storage) return null;

    // Home room
    const extractor = homeRoom
      .find<StructureExtractor>(FIND_STRUCTURES)
      .find(struct => struct.structureType === STRUCTURE_EXTRACTOR);

    if (extractor) {
      const mineral = extractor.pos.lookFor(LOOK_MINERALS)[0];

      if (
        mineral.mineralAmount &&
        !taskManager.isTaskTaken(homeRoom.name, mineral.id, 'harvest')
      ) {
        const container = mineral.pos
          .findInRange<StructureContainer>(FIND_STRUCTURES, 1)
          .find(struct => struct.structureType === STRUCTURE_CONTAINER);

        return taskManager.createTask<ProspectorTask>(
          homeRoom.name,
          mineral.id,
          'harvest',
          1,
          { type: mineral.mineralType, container: container?.id }
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

    if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
      creep.memory.working = false;
    } else if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
    }

    if (creep.memory.working) {
      // Take to storage
      const storage = creep.room.storage;

      if (!storage) {
        creep.say('...');
        task.complete = true;
        return;
      }
      if (creep.pos.getRangeTo(storage) > 1) {
        creep.travelTo(storage, { range: 1 });
      } else {
        creep.transfer(storage, task.data.type);
      }
    } else {
      // Mine
      const mineral = Game.getObjectById(task.target);

      if (!mineral) {
        creep.say('...');
        task.complete = true;
        return;
      }

      const range = creep.pos.getRangeTo(mineral);

      if (range > 1) {
        creep.travelTo(mineral, { range: 1 });

        // TODO: Have Movers withdraw from container, then more WORK less MOVE/CARRY for Prospector
        if (task.data.container && range === 2) {
          const container = Game.getObjectById(task.data.container);
          if (container?.store.getUsedCapacity(mineral.mineralType)) {
            creep.withdraw(container, mineral.mineralType);
          }
        }
      } else {
        creep.harvest(mineral);
      }
    }
  }
}
