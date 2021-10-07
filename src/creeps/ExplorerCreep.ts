import { saveScoutData } from 'utils/scouting';
import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface ExplorerTask extends CreepTask {
  type: 'explore';
}

function findRoomToScout(currentRoom: Room): string {
  // Get all exits that don't lead back to main colony rooms
  const exits = (
    Object.values(Game.map.describeExits(currentRoom.name)) as string[]
  ).filter(roomName => !(roomName in (Memory.colonies ?? {})));

  const rescoutRooms: string[] = [];

  for (const roomName of _.shuffle(exits)) {
    // Scout unscouted rooms first
    if (!Memory.rooms[roomName]?.lastScan) {
      return roomName;
    }
    rescoutRooms.push(roomName);
  }

  // If no unscouted rooms, go to least recently seen
  // rescoutRooms should never be empty, worst case we go back where we came from
  return _.min(rescoutRooms, roomName => Memory.rooms[roomName].lastScan);
}

export class ExplorerCreep extends CreepBase {
  role: CreepRole = 'explorer';
  bodyOpts: BodySettings = {
    pattern: [MOVE],
    sizeLimit: 1,
  };

  // None before RCL 4, otherwise always 1
  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) < 4) return 0;
    return 1;
  }

  isValidTask(creep: Creep, task: ExplorerTask): boolean {
    return true;
  }

  // Currently will have at most 1 explorer, no need to check if task is taken
  findTask(creep: Creep, taskManager: TaskManager): ExplorerTask | null {
    const nextRoom = findRoomToScout(creep.room);
    return taskManager.createTask<ExplorerTask>(nextRoom, nextRoom, 'explore');
  }

  run(creep: Creep): void {
    creep.notifyWhenAttacked(false);

    if (!creep.memory.task) {
      creep.suicide();
      return;
    }

    const targetRoomName = creep.memory.task.room;

    if (creep.room.name === targetRoomName) {
      // Reached target room, scan and save to memory
      saveScoutData(creep.room);
      creep.memory.task.complete = true;
    }

    // Travel no matter what, otherwise we bounce on exit and never leave colony
    creep.travelToRoom(targetRoomName, { offRoad: true });
    creep.say(targetRoomName);
  }
}
