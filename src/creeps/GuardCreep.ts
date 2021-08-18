import { TaskManager } from 'TaskManager';
import { BodySettings, CreepBase } from './CreepBase';

interface GuardTask extends CreepTask {
  type: 'attack';
  // data: { isFlag: boolean };
}

// function findAttackFlags(colonyRoom: Room): Flag[] {
//   const { adjacentRoomNames } = global.empire.colonies[colonyRoom.name];
//   const flags: Flag[] = [];

//   for (const flagName in Game.flags) {
//     const flag = Game.flags[flagName];
//     if (
//       flag.color === COLOR_RED &&
//       adjacentRoomNames.includes(flag.pos.roomName)
//     ) {
//       flags.push(flag);
//     }
//   }
//   return flags;
// }

function findRemotesUnderAttack(colonyRoom: Room): Room[] {
  const { adjacentRoomNames } = global.empire.colonies[colonyRoom.name];
  const rooms: Room[] = [];

  for (const roomName of adjacentRoomNames) {
    if (!Memory.rooms[roomName]?.colonize) continue;
    const room = Game.rooms[roomName];
    if (room?.findHostiles().length) {
      rooms.push(room);
      console.log(room.name, 'under attack');
    }
  }

  return rooms;
}

export class GuardCreep extends CreepBase {
  role: CreepRole = 'guard';
  bodyOpts: BodySettings = {
    pattern: [
      MOVE, // 50
      MOVE, // 50
      MOVE, // 50
      ATTACK, // 80
      ATTACK, // 80
      HEAL, // 250
    ],
    ordered: true,
  };

  // 2 per room with hostiles
  targetNum(room: Room): number {
    if ((room.controller?.level ?? 0) < 4) return 0;

    const numRemotes = findRemotesUnderAttack(room).length;

    return numRemotes * 2;

    // // Only go to flags if no visibility
    // const flags = findAttackFlags(room);
    // let num = 0;
    // for (const flag of flags) {
    //   if (!flag.room) num += 2;
    // }

    // return num;
  }

  isValidTask(creep: Creep, task: GuardTask): boolean {
    if (creep.room.name !== task.room) return true;
    if (creep.room.find(FIND_HOSTILE_CREEPS).length) return true;
    // if (task.data?.isFlag && Game.flags[task.target]) return true;
    return false;
  }

  findTask(creep: Creep, taskManager: TaskManager): GuardTask | null {
    const roomsToAttack = findRemotesUnderAttack(
      Game.rooms[creep.memory.homeRoom]
    );

    if (roomsToAttack.length) {
      for (const room of roomsToAttack) {
        if (!taskManager.isTaskTaken(room.name, room.name, 'attack')) {
          return taskManager.createTask<GuardTask>(
            room.name,
            room.name,
            'attack',
            2
            // { isFlag: false }
          );
        }
      }
    }

    // const flags = findAttackFlags(Game.rooms[creep.memory.homeRoom]);

    // for (const flag of flags) {
    //   if (!taskManager.isTaskTaken(flag.pos.roomName, flag.name, 'attack')) {
    //     return taskManager.createTask<GuardTask>(
    //       flag.pos.roomName,
    //       flag.name,
    //       'attack',
    //       2,
    //       { isFlag: true }
    //     );
    //   }
    // }

    return null;
  }

  run(creep: Creep): void {
    // Always heal, gets cancelled if attacking
    creep.heal(creep);

    const task = creep.memory.task;

    if (!task) {
      creep.say('...');
      return;
    }

    if (creep.room.name !== task.room) {
      creep.travelTo(new RoomPosition(25, 25, task.room), { range: 10 });
      return;
    }

    let target: Creep | null = null;

    const hostiles = creep.room
      .findHostiles()
      .sort((a, b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));

    // Most dangerous creeps
    target = hostiles.filter(
      hostile =>
        !hostile.getActiveBodyparts(WORK) && !hostile.getActiveBodyparts(CLAIM)
    )[0];

    // Potentially dangerous creep
    if (!target) {
      target = hostiles[0];
    }

    if (!target) {
      creep.say('...');
      return;
    }

    // Attack
    const range = creep.pos.getRangeTo(target);
    if (range <= 1 && creep.getActiveBodyparts(ATTACK)) {
      creep.cancelOrder('heal');
      creep.attack(target);
    } else {
      if (creep.pos.isNearEdge(3)) {
        // Don't follow creeps out of rooms
        creep.move(creep.pos.getDirectionTo(25, 25));
      } else {
        creep.travelTo(target, { range: 1 });
      }
    }
  }
}
