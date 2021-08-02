interface CreepNums {
  [role: string]: {
    target: number;
    actual: number;
  };
}

export class HumanResources {
  room: Room;
  adjacentRoomNames: string[];

  constructor(room: Room, adjacentRoomNames: string[]) {
    this.room = room;
    this.adjacentRoomNames = adjacentRoomNames;
  }

  // Will spawn 1 creep max per run from first available spawn in the room
  spawnCreeps(colonyCreeps: Creep[]) {
    // Only run once every 5 ticks

    // Can't spawn if not controlling
    if (!this.room.controller) return;

    // Make sure there's a free spawn, grab fullest one
    const spawn = this.room
      .findSpawns()
      .filter(spawn => !spawn.spawning)
      .sort(
        (a, b) =>
          a.store.getFreeCapacity(RESOURCE_ENERGY) -
          b.store.getFreeCapacity(RESOURCE_ENERGY)
      )[0];
    if (!spawn) {
      console.log('no spawns available for spawning');
      return;
    }

    // Listed in order of priority
    const creepNums: CreepNums = {
      pioneer: {
        target: global.Creeps.pioneer.targetNum(this.room),
        actual: 0,
      },
      builder: {
        target: global.Creeps.builder.targetNum(this.room),
        actual: 0,
      },
      harvester: {
        target: global.Creeps.harvester.targetNum(this.room),
        actual: 0,
      },
      mover: {
        target: global.Creeps.mover.targetNum(this.room),
        actual: 0,
      },
      upgrader: {
        target: global.Creeps.upgrader.targetNum(this.room),
        actual: 0,
      },
    };

    for (const creep of colonyCreeps) {
      // If creep is not dying, add 1 to role count
      if (!creep.isDying()) {
        creepNums[creep.memory.role].actual++;
      }
    }

    console.log(JSON.stringify(creepNums, null, 2));

    for (const role in creepNums) {
      const nums = creepNums[role];

      if (nums.actual < nums.target) {
        const creepClass = global.Creeps[role];
        const buildData = creepClass.build(this.room.energyCapacityAvailable);

        if (buildData.body.length) {
          if (buildData.cost <= this.room.energyAvailable) {
            // Current energy is enough for biggest creep we can spawn with current energy capacity
            console.log(spawn.name, 'spawning', role);

            spawn.spawnCreep(buildData.body, buildData.name, {
              memory: {
                role: role as CreepRole,
                working: false,
                homeRoom: spawn.room.name,
              },
            });

            return;
          } else {
            console.log(spawn.name, 'waiting for more energy to spawn', role);
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

  runCreeps(colonyCreeps: Creep[]) {
    for (const creep of colonyCreeps) {
      if (creep.spawning || !creep.memory.task) continue;
      global.Creeps[creep.memory.role].run(creep);
    }
  }
}
