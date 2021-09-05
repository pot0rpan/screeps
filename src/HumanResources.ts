import config from 'config';
import { Colony } from 'Colony';

declare global {
  interface CreepMemory {
    birth: number;
  }
}

interface CreepNums {
  [role: string]: {
    target: number;
    actual: number;
    spawning: number;
  };
}

export class HumanResources {
  colony: Colony;

  private _creepNums: CreepNums | null = null;
  private _creepNumsCacheTimestamp: number = 0;

  constructor(colony: Colony) {
    this.colony = colony;
  }

  // Cached for until spawning again
  // Stats visuals get cached nums the other ticks
  public getCreepNums(colonyCreeps: Creep[], fresh = false): CreepNums {
    if (
      fresh ||
      !this._creepNums ||
      !this._creepNumsCacheTimestamp ||
      Game.time - this._creepNumsCacheTimestamp >= config.ticks.SPAWN_CREEPS
    ) {
      const room = Game.rooms[this.colony.roomName];
      // Listed in order of priority
      const creepNums: CreepNums = {};
      const roleOrder = [
        'pioneer',
        'filler',
        'builder',
        'ranged_defender',
        'defender',
        'attacker',
        'healer',
        'exterminator',
        'drainer',
        'harvester',
        'mover',
        'upgrader',
        'assassin',
        'reserver',
        'prospector',
        'miner',
        'hauler',
        // 'accountant',
        'operator',
        'claimer',
        'colonizer',
        'scout',
      ];

      for (const role of roleOrder) {
        const start = Game.cpu.getUsed();
        creepNums[role] = {
          target: global.Creeps[role].targetNum(room),
          actual: 0,
          spawning: 0,
        };
        global.stats.profileLog(`${role} targetNum()`, start, [
          this.colony.roomName,
          role,
        ]);
      }

      for (const creep of colonyCreeps) {
        // If creep is not dying, add 1 to role count
        if (!creep.isDying() && creepNums[creep.memory.role]) {
          if (creep.spawning) {
            creepNums[creep.memory.role].spawning++;
          } else {
            creepNums[creep.memory.role].actual++;
          }
        }
      }

      this._creepNums = creepNums;
      this._creepNumsCacheTimestamp = Game.time;
    }

    return this._creepNums;
  }

  //? This can mess with some roles and uses too much CPU
  // public renewCreeps() {
  //   const spawns = Game.rooms[this.roomName]
  //     .findSpawns()
  //     .filter(spawn => !spawn.spawning);

  //   for (const spawn of spawns) {
  //     // Find creeps near spawn that have tasks to do
  //     const creepToRenew = spawn.pos.findInRange(FIND_MY_CREEPS, 1, {
  //       filter: creep =>
  //         (creep.memory.role === 'operator' ||
  //           (creep.memory.task && creep.memory.recycle === undefined)) &&
  //         (creep.ticksToLive ?? Infinity) < 1000,
  //     })[0];

  //     if (creepToRenew) {
  //       console.log(
  //         `Renewing creep ${creepToRenew}, been alive for ${
  //           Game.time - creepToRenew.memory.birth
  //         } ticks`
  //       );
  //       spawn.renewCreep(creepToRenew);
  //     }
  //   }
  // }

  public recycleCreeps() {
    const spawns = Game.rooms[this.colony.roomName].findSpawns();

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

  private getSpawnDirections(
    role: CreepRole,
    spawn: StructureSpawn
  ): DirectionConstant[] {
    // Default directions for outer 2 spawns
    let directions: DirectionConstant[] = [RIGHT, BOTTOM, BOTTOM_LEFT];

    // Only spawn in directions that work with bunker layout
    // if spawn is center spawn, only spawn to center if Operator
    const baseCenter = new RoomPosition(
      spawn.room.memory.baseCenter?.x ?? 25,
      spawn.room.memory.baseCenter?.y ?? 25,
      spawn.room.name
    );

    // If center spawn
    // and if role is operator, only spawn to baseCenter
    // otherwise AVOID spawning to baseCenter
    if (spawn.pos.getRangeTo(baseCenter) === 1) {
      if (role === 'operator') {
        directions = [BOTTOM_LEFT];
      } else {
        directions = [TOP, RIGHT];
      }
    }

    return directions;
  }

  // Will spawn 1 creep max per run from first available spawn in the room
  public spawnCreeps(colonyCreeps: Creep[]) {
    const room = Game.rooms[this.colony.roomName];

    // Can't spawn if not controlling
    if (!room.controller) return;

    // Make sure there's a free spawn, grab fullest one
    const spawns = room
      .findSpawns()
      .filter(spawn => !spawn.spawning)
      .sort(
        (a, b) =>
          b.store.getFreeCapacity(RESOURCE_ENERGY) -
          a.store.getFreeCapacity(RESOURCE_ENERGY)
      );

    const spawn = spawns[0];

    if (!spawn) {
      console.log(this.colony.roomName, 'no spawns available for spawning');
      return;
    }

    if (room.energyAvailable < 300) {
      console.log(
        this.colony.roomName,
        'skip spawning, total energy only',
        room.energyAvailable
      );
      return;
    }

    const creepNums = this.getCreepNums(colonyCreeps, true);

    for (const role in creepNums) {
      const nums = creepNums[role];

      if (nums.actual + nums.spawning < nums.target) {
        const creepClass = global.Creeps[role];

        if (!creepClass.shouldUseSpawn(spawn)) continue;

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
              directions: this.getSpawnDirections(role as CreepRole, spawn),
              // Empty array is needed otherwise concat has weird type error
              energyStructures: (
                [] as (StructureSpawn | StructureExtension)[]
              ).concat(spawns, spawn.room.findExtensions()),
            });

            return;
          } else {
            console.log(
              this.colony.roomName,
              'waiting for more energy to spawn',
              role,
              `${room.energyAvailable}/${buildData.cost}`
            );
            return;
          }
        } else {
          // generateBody returns [] if not enough energy
          console.log(this.colony.roomName, "can't yet spawn any", role);
        }
      }
    }
    console.log(this.colony.roomName, 'nothing to spawn');
  }

  public runCreeps(colonyCreeps: Creep[]) {
    let total = Game.cpu.getUsed();
    let start = 0;

    for (const creep of colonyCreeps) {
      if (creep.spawning) continue;
      start = Game.cpu.getUsed();
      if (!global.Creeps[creep.memory.role]) {
        console.log(
          `<span style="color:red">${creep.room} ${creep} Invalid role: ${creep.memory.role}`
        );
        continue;
      }

      global.Creeps[creep.memory.role].run(creep);
      global.stats.profileLog(`${creep.room} ${creep}`, start, [
        this.colony.roomName,
        creep.name,
        creep.memory.role,
      ]);
    }

    global.stats.profileLog(this.colony.roomName + ' runCreeps()', total, [
      this.colony.roomName,
    ]);
  }
}
