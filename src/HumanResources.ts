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

  public recycleCreeps() {
    const spawn = Game.rooms[this.roomName]
      .findSpawns()
      .filter(spawn => !spawn.spawning)[0];
    if (!spawn) return;
    const creepToRecycle = spawn.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: creep => creep.memory.recycle === 0,
    })[0];
    if (creepToRecycle) {
      console.log('Recycling creep', creepToRecycle);
      spawn.recycleCreep(creepToRecycle);
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
          a.store.getFreeCapacity(RESOURCE_ENERGY) -
          b.store.getFreeCapacity(RESOURCE_ENERGY)
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
    const creepNums: CreepNums = {
      pioneer: {
        target: global.Creeps.pioneer.targetNum(room),
        actual: 0,
      },
      defender: {
        target: global.Creeps.defender.targetNum(room),
        actual: 0,
      },
      harvester: {
        target: global.Creeps.harvester.targetNum(room),
        actual: 0,
      },
      mover: {
        target: global.Creeps.mover.targetNum(room),
        actual: 0,
      },
      builder: {
        target: global.Creeps.builder.targetNum(room),
        actual: 0,
      },
      upgrader: {
        target: global.Creeps.upgrader.targetNum(room),
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
              },
            });

            return;
          } else {
            console.log(
              spawn.name,
              'waiting for more energy to spawn',
              role,
              `${buildData.cost}/${room.energyAvailable}`
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
    for (const creep of colonyCreeps) {
      if (creep.spawning) continue;
      global.Creeps[creep.memory.role].run(creep);
    }
  }
}
