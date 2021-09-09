import config from 'config';
import { recycle } from 'actions/recycle';
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
    prefix: [CARRY],
    pattern: [MOVE, WORK, WORK],
    suffix: [MOVE],
    sizeLimit: 4,
    ordered: true,
  };

  // Number of sources in colonized adjacent rooms
  targetNum(room: Room): number {
    if (!room.storage) return 0;
    if (room.memory.defcon) return 0;

    const rcl = room.controller?.level ?? 0;

    // Don't expand too early
    if (rcl < 4) return 0;

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
    const mem = Memory.rooms[task.room];
    if (
      !mem ||
      (mem.reserver && mem.reserver !== config.USERNAME) ||
      mem.hostiles
    ) {
      return false;
    }
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): MinerTask | null {
    const { adjacentRoomNames } = global.empire.colonies[creep.memory.homeRoom];

    for (const roomName of adjacentRoomNames) {
      const mem = Memory.rooms[roomName];
      if (!mem) continue;
      if (!mem.colonize) continue;
      if (!mem.sources?.length) continue;
      if (mem.reserver !== config.USERNAME) continue;
      if (mem.hostiles) continue;

      for (const { id } of mem.sources) {
        if (!taskManager.isTaskTaken(roomName, id, 'harvest')) {
          return taskManager.createTask<MinerTask>(roomName, id, 'harvest', 1);
        }
      }
    }

    return null;
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    const task = creep.memory.task as MinerTask | undefined;
    if (!task) {
      recycle(creep, config.ticks.PLAN_EXPANSION);
      return;
    }

    // Retreat if hostiles
    if (Memory.rooms[task.room].hostiles) {
      creep.travelToRoom(creep.memory.homeRoom);
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
      const container = source.pos
        .findInRange<StructureContainer>(FIND_STRUCTURES, 1)
        .find(struct => struct.structureType === STRUCTURE_CONTAINER);

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
      creep.travelTo(source, { range: 1 });
    } else {
      // If creep is full,
      // do some work if needed, otherwise drop energy on ground/container
      if (
        creep.getActiveBodyparts(CARRY) &&
        !creep.store.getFreeCapacity(RESOURCE_ENERGY)
      ) {
        let worked = false;

        // Fix damaged container
        if (container && container.hits < container.hitsMax) {
          creep.repair(container);
          worked = true;
        } else {
          // Build construction sites in remote rooms (container)
          const site = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)[0];

          if (site) {
            creep.build(site);
            worked = true;
          } else if (!container) {
            // No container or construction site, place one
            creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
          }
        }

        // Drop on ground/container if no work to be done
        if (!worked) {
          creep.drop(RESOURCE_ENERGY);
        }
      } else if (creep.harvest(source) === ERR_NOT_OWNER) {
        creep.say('cmon');
      }
    }
  }
}
