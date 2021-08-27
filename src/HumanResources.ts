declare global {
  interface CreepMemory {
    birth: number;
  }
}

interface CreepNums {
  [role: string]: {
    target: number;
    actual: number;
  };
}

export class HumanResources {
  roomName: string;
  adjacentRoomNames: string[];

  constructor(room: string, adjacentRoomNames: string[]) {
    this.roomName = room;
    this.adjacentRoomNames = adjacentRoomNames;
  }

  public renewCreeps() {
    const spawns = Game.rooms[this.roomName]
      .findSpawns()
      .filter(spawn => !spawn.spawning);

    for (const spawn of spawns) {
      // Find creeps near spawn that have tasks to do
      const creepToRenew = spawn.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: creep =>
          creep.memory.task &&
          creep.memory.recycle === undefined &&
          (creep.ticksToLive ?? Infinity) < 1000,
      })[0];

      if (creepToRenew) {
        console.log(
          `Renewing creep ${creepToRenew}, been alive for ${
            Game.time - creepToRenew.memory.birth
          } ticks`
        );
        spawn.renewCreep(creepToRenew);
      }
    }
  }

  public recycleCreeps() {
    const spawns = Game.rooms[this.roomName].findSpawns();

    for (const spawn of spawns) {
      const creepToRecycle = spawn.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: creep =>
          creep.memory.recycle !== undefined && creep.memory.recycle <= 0,
      })[0];

      if (creepToRecycle) {
        console.log('Recycling creep', creepToRecycle);
        spawn.recycleCreep(creepToRecycle);
      }
    }
  }

  // Will spawn 1 creep max per run from first available spawn in the room
  public spawnCreeps(colonyCreeps: Creep[]) {
    const room = Game.rooms[this.roomName];

    // Can't spawn if not controlling
    if (!room.controller) return;

    // Make sure there's a free spawn, grab fullest one
    const spawn = room
      .findSpawns()
      .filter(spawn => !spawn.spawning)
      .sort(
        (a, b) =>
          b.store.getFreeCapacity(RESOURCE_ENERGY) -
          a.store.getFreeCapacity(RESOURCE_ENERGY)
      )[0];
    if (!spawn) {
      console.log('no spawns available for spawning');
      return;
    }

    if (room.energyAvailable < 300) {
      console.log('skip spawning, total energy only', room.energyAvailable);
      return;
    }

    // Listed in order of priority
    const creepNums: CreepNums = {};
    const roleOrder = [
      'pioneer',
      'ranged_defender',
      'defender',
      'filler',
      'attacker',
      'healer',
      'exterminator',
      'drainer',
      'harvester',
      'mover',
      'builder',
      'upgrader',
      'assassin',
      'reserver',
      'prospector',
      'miner',
      'hauler',
      'accountant',
      'scout',
    ];

    for (const role of roleOrder) {
      creepNums[role] = {
        target: global.Creeps[role].targetNum(room),
        actual: 0,
      };
    }

    for (const creep of colonyCreeps) {
      // If creep is not dying, add 1 to role count
      if (!creep.isDying() && creepNums[creep.memory.role]) {
        creepNums[creep.memory.role].actual++;
      }
    }

    for (const role in creepNums) {
      const nums = creepNums[role];

      if (nums.actual < nums.target) {
        const creepClass = global.Creeps[role];
        const emergency =
          creepNums.mover.actual === 0 && creepNums.pioneer.actual === 0;
        let buildData = creepClass.build(
          emergency ? room.energyAvailable : room.energyCapacityAvailable
        );

        if (buildData.body.length) {
          if (buildData.cost <= room.energyAvailable) {
            // Current energy is enough for biggest creep we can spawn with current energy capacity
            console.log(
              spawn.name,
              'spawning',
              role,
              JSON.stringify(buildData.body),
              `${buildData.cost}/${room.energyAvailable}`
            );

            spawn.spawnCreep(buildData.body, buildData.name, {
              memory: {
                role: role as CreepRole,
                working: false,
                homeRoom: spawn.room.name,
                birth: Game.time,
              },
            });

            return;
          } else {
            console.log(
              spawn.name,
              'waiting for more energy to spawn',
              role,
              `${room.energyAvailable}/${buildData.cost}`
            );
            return;
          }
        } else {
          // generateBody returns [] if not enough energy
          console.log(spawn.name, "can't yet spawn any", role);
        }
      }
    }
    console.log(spawn.name, 'nothing to spawn');
  }

  public runCreeps(colonyCreeps: Creep[]) {
    let start = 0;

    for (const creep of colonyCreeps) {
      if (creep.spawning) continue;
      start = Game.cpu.getUsed();
      if (!global.Creeps[creep.memory.role]) {
        console.log(
          `<span style="color:red">${creep} Invalid role: ${creep.memory.role}`
        );
        continue;
      }

      global.Creeps[creep.memory.role].run(creep);

      if (global.stats.profile) {
        const cpuUsed = Game.cpu.getUsed() - start;
        console.log(
          `<span style="color: #4488ff">${creep} CPU: <span style="color: ${
            cpuUsed >= 0.5
              ? 'red'
              : cpuUsed >= 0.3
              ? 'yellow'
              : cpuUsed < 0.2
              ? 'green'
              : 'white'
          }">${cpuUsed.toFixed(3)}</span></span>`
        );
      }
    }
  }
}
