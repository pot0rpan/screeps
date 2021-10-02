import { recycle } from 'actions/recycle';
import { TaskManager } from 'TaskManager';
import { isFlagOfType } from 'utils/flag';
import { isInColonyHelpRange } from 'utils/room';
import { getAllResourceAmounts } from 'utils/store';
import { BodySettings, CreepBase } from './CreepBase';

interface LooterTask extends CreepTask {
  target: Id<Flag>;
  data?: {
    currentTarget: Id<
      StructureStorage | StructureTerminal | StructureLab // | Ruin | Resource
    >;
  };
}

export class LooterCreep extends CreepBase {
  role: CreepRole = 'looter';
  bodyOpts: BodySettings = {
    pattern: [CARRY, MOVE],
  };

  private findFlags(roomName: string): Flag[] {
    return _.filter(
      Game.flags,
      flag =>
        isFlagOfType(flag, 'LOOT') &&
        isInColonyHelpRange(roomName, flag.pos.roomName)
    );
  }

  targetNum(room: Room): number {
    if (!room.storage) return 0;
    return this.findFlags(room.name).length;
  }

  isValidTask(creep: Creep, task: LooterTask): boolean {
    const flag = Game.flags[task.target];
    if (!flag) return false;
    if (flag.pos.roomName !== task.room) return false;
    if (!Game.rooms[creep.memory.homeRoom].storage) return false;
    return true;
  }

  findTask(creep: Creep, taskManager: TaskManager): LooterTask | null {
    for (const flag of this.findFlags(creep.memory.homeRoom)) {
      if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'loot')) {
        return taskManager.createTask<LooterTask>(
          flag.pos.roomName,
          flag.name,
          'loot',
          1
        );
      }
    }

    return null;
  }

  run(creep: Creep): void {
    const task = creep.memory.task as LooterTask | undefined;

    if (!task) {
      recycle(creep, 50);
      return;
    }

    if (creep.memory.working && creep.isEmpty()) {
      // Suicide if won't live long enough to make it there and back
      if (
        (creep.ticksToLive ?? Infinity) <
        Game.map.getRoomLinearDistance(creep.room.name, task.room) * 60 * 2
      ) {
        creep.suicide();
        creep.say('peace');
        return;
      }
      creep.memory.working = false;
      delete task.data;
    } else if (!creep.memory.working && creep.isFull()) {
      creep.memory.working = true;
      delete task.data;
    }

    if (creep.memory.working) {
      // Full, take back to colony storage
      if (creep.room.name !== creep.memory.homeRoom) {
        creep.travelToRoom(creep.memory.homeRoom, { ignoreRoads: true });
        creep.say(creep.memory.homeRoom);
        return;
      }

      const storage = creep.room.storage as StructureStorage;

      if (creep.pos.getRangeTo(storage) > 1) {
        creep.travelTo(storage, { range: 1, ignoreRoads: true });
      } else {
        creep.transfer(storage, creep.getCarryingResources()[0]);
      }
    } else {
      // Not full yet, loot flag room
      if (creep.room.name !== task.room) {
        // Offroad since creep should be empty if it's not in target room
        creep.travelToRoom(task.room, { offRoad: true });
        creep.say(task.room);
        return;
      }

      if (!task.data) {
        // Loot
        let target:
          | StructureStorage
          | StructureTerminal
          | StructureLab
          // TODO
          // | Ruin
          // | Resource
          | undefined;

        const storage = creep.room.storage;
        const terminal = creep.room.terminal;
        const labs = creep.room.find<StructureLab>(FIND_HOSTILE_STRUCTURES, {
          filter: struct => struct.structureType === STRUCTURE_LAB,
        });

        switch (true) {
          case !!storage?.store.getUsedCapacity():
            target = storage;
            break;
          case !!terminal?.store.getUsedCapacity():
            target = terminal;
            break;
          default:
            target = labs.find(lab => lab.store.getUsedCapacity());
        }

        if (target) task.data = { currentTarget: target.id };
      }

      if (!task.data?.currentTarget) {
        Game.flags[task.target].remove();
        task.complete = true;
        return;
      }

      const target = Game.getObjectById(task.data.currentTarget);
      if (!target) {
        delete task.data;
        return;
      }

      if (creep.pos.getRangeTo(target) > 1) {
        creep.travelTo(target, { range: 1, ignoreRoads: true });
      } else {
        const resType = Object.keys(getAllResourceAmounts(target.store))[0];
        if (resType) {
          creep.withdraw(target, resType as ResourceConstant);
        } else {
          delete task.data;
        }
      }
    }
  }
}
