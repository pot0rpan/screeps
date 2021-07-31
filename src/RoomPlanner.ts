import config from 'config';

declare global {
  interface RoomMemory {
    baseCenter?: { x: number; y: number };
  }
}

export interface BuildingPlan {
  pos: RoomPosition;
  structureType: BuildableStructureConstant;
}

enum PlanType {
  extension = 'extension',
  road = 'road',
  tower = 'tower',
  container = 'container',
  storage = 'storage'
}

export class RoomPlanner {
  room: Room;
  baseCenter: RoomPosition | null = null;

  // Plans are built into construction sites in this order
  plans: {
    [key in PlanType]: BuildingPlan[];
  } = {
    [PlanType.extension]: [],
    [PlanType.container]: [],
    [PlanType.storage]: [],
    [PlanType.tower]: [],
    [PlanType.road]: []
  };

  DRY_RUN = false;

  constructor(room: Room) {
    console.log('RoomPlanner constructor()', room);

    this.room = room;

    if (room.memory.baseCenter) {
      this.baseCenter = new RoomPosition(
        room.memory.baseCenter.x,
        room.memory.baseCenter.y,
        room.name
      );
    } else {
      const spawn = room.findSpawns()[0];
      if (spawn) {
        this.baseCenter = new RoomPosition(spawn.pos.x, spawn.pos.y, room.name);
      }
    }
  }

  run() {
    const rcl = this.room.controller?.level ?? 0;

    // Nothing to build at level 1
    if (rcl < 2) return;

    // Only plan if no plans
    if (Object.values(this.plans).flat().length) {
      return;
    }

    if (this.baseCenter) {
      this.planBaseRoom(this.baseCenter, rcl);
    }

    this.placeConstructionSites(this.DRY_RUN, rcl);
  }

  planBaseRoom(baseCenter: RoomPosition, rcl: number) {
    this.planExtensions(baseCenter, rcl);
    this.planBaseLayout(baseCenter, rcl);

    this.planRoadsAndContainers(baseCenter);
  }

  planRoadsAndContainers(baseCenter: RoomPosition) {
    console.log('planning roads/containers');
    const controller = this.room.controller;

    // Make path to each container from spawn, add coords to plans
    // If controller in room, make path to that as well
    // Sort to plan shortest path first, then reuse in other cost matrices
    let sources: (Source | StructureController)[] = this.room.findSources();
    sources.sort(
      (a, b) => a.pos.getRangeTo(baseCenter) - b.pos.getRangeTo(baseCenter)
    );

    // Always do controller route first
    if (controller) sources.unshift(controller);

    for (const source of sources) {
      const goal = { pos: source.pos, range: 1 };

      const ret = PathFinder.search(baseCenter, goal, {
        plainCost: 1,
        swampCost: 10,
        maxRooms: 1,

        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          const costs = new PathFinder.CostMatrix();

          // Set certain positions to lower cost for prettier roads
          for (const pos of source.pos.getAdjacentOrthogonalPositions()) {
            costs.set(pos.x, pos.y, 1);
          }

          // Add previously planned road positions to cost matrix
          for (const plan of this.plans[PlanType.road]) {
            costs.set(plan.pos.x, plan.pos.y, 1);
          }

          // Add road construction sites to cost matrix,
          // these will not appear in this.plans as they're removed after placing
          for (const site of room.findConstructionSites(STRUCTURE_ROAD)) {
            costs.set(site.pos.x, site.pos.y, 1);
          }

          for (const struct of room.find(FIND_STRUCTURES)) {
            if (struct.structureType === STRUCTURE_ROAD) {
              // Favor roads over plain tiles
              costs.set(struct.pos.x, struct.pos.y, 1);
            } else if (
              struct.structureType !== STRUCTURE_CONTAINER &&
              (struct.structureType !== STRUCTURE_RAMPART || !struct.my)
            ) {
              // Can't walk through non-walkable buildings
              costs.set(struct.pos.x, struct.pos.y, 0xff);
            }
          }
          return costs;
        }
      });

      if (ret.incomplete || !ret.path.length) {
        console.log('no path found to', source);
        continue;
      }

      // Add container construction site at last pos
      const containerPos = ret.path[ret.path.length - 1];
      if (
        !this.room.lookForAt(LOOK_CONSTRUCTION_SITES, containerPos).length &&
        !this.room.lookForAt(LOOK_STRUCTURES, containerPos).length
      ) {
        this.plans[PlanType.container].push({
          pos: containerPos,
          structureType: STRUCTURE_CONTAINER
        });
      }

      // Add road construction sites to plans,
      // ignoring last road pos to leave room for container
      for (const pos of ret.path.slice(0, ret.path.length - 1)) {
        let skip = false;

        if (pos.x === baseCenter.x && pos.y === baseCenter.y) continue;

        for (const plan of this.plans[PlanType.road]) {
          // Avoid duplicate plans
          if (
            plan.pos.x === pos.x &&
            plan.pos.y === pos.y &&
            plan.structureType === STRUCTURE_ROAD
          ) {
            skip = true;
            break;
          }

          // Make sure position is free
          if (
            this.room.lookForAt(LOOK_CONSTRUCTION_SITES, pos).length ||
            this.room.lookForAt(LOOK_STRUCTURES, pos).length
          ) {
            skip = true;
            break;
          }
        }

        if (!skip) {
          this.plans[PlanType.road].push({
            pos,
            structureType: STRUCTURE_ROAD
          });
        }
      }
    }
  }

  planBaseLayout(baseCenter: RoomPosition, rcl: number) {
    console.log('planning main base layout');

    this.room.visual.rect(baseCenter.x - 3.5, baseCenter.y - 3.5, 7, 7, {
      stroke: 'grey',
      fill: 'transparent'
    });

    // Plan roads around spawn
    const roadPlans = baseCenter
      .getDiagonalPositions(3)
      .concat(baseCenter.getAdjacentOrthogonalPositions(3))
      .sort((a, b) => a.getRangeTo(baseCenter) - b.getRangeTo(baseCenter));

    for (const pos of roadPlans) {
      // Leave room for storage/container below spawn
      if (pos.x === baseCenter.x && pos.y === baseCenter.y + 1) {
        continue;
      }

      // Leave room for 1 tower on each side of spawn
      if (
        pos.y === baseCenter.y &&
        (pos.x === baseCenter.x - 1 || pos.x === baseCenter.x + 1)
      ) {
        continue;
      }

      this.plans[PlanType.road].push({ pos, structureType: STRUCTURE_ROAD });
    }

    // Plan tower sites on each side of spawn
    if (rcl >= 3) {
      this.planTowers(baseCenter, rcl);

      this.planCenterStorage(baseCenter, rcl);
    }
  }

  planTowers(baseCenter: RoomPosition, rcl: number) {
    console.log('planning towers');

    const maxPerRCL = [0, 0, 0, 1, 1, 2, 2, 3, 6];

    const towerSites = [
      new RoomPosition(baseCenter.x - 1, baseCenter.y, this.room.name),
      new RoomPosition(baseCenter.x + 1, baseCenter.y, this.room.name)
    ];

    let i = 0;

    for (const pos of towerSites) {
      if (i++ >= maxPerRCL[rcl]) break;

      const existingSite = this.room.lookForAt(
        LOOK_CONSTRUCTION_SITES,
        pos.x,
        pos.y
      )[0];

      if (existingSite?.structureType === STRUCTURE_TOWER) {
        continue;
      }

      const existingTower = this.room.lookForAt(
        LOOK_STRUCTURES,
        pos.x,
        pos.y
      )[0];

      if (existingTower?.structureType === STRUCTURE_TOWER) {
        continue;
      }

      this.plans[PlanType.tower].push({
        pos,
        structureType: STRUCTURE_TOWER
      });
    }
  }

  // Plan container < 4 or storage
  planCenterStorage(baseCenter: RoomPosition, rcl: number) {
    console.log('planning storage');

    const planType = rcl < 4 ? PlanType.container : PlanType.storage;
    const structureType =
      planType === PlanType.container ? STRUCTURE_CONTAINER : STRUCTURE_STORAGE;

    const x = baseCenter.x;
    const y = baseCenter.y + 1;

    if (!this.plans[planType].length) {
      // Handle removing container if we can build storage now

      const existingSite = this.room.lookForAt(
        LOOK_CONSTRUCTION_SITES,
        x,
        y
      )[0];

      if (existingSite && existingSite.structureType !== structureType) {
        console.log(existingSite);

        existingSite.remove();
      }

      const existingStructure = this.room.lookForAt(LOOK_STRUCTURES, x, y)[0];

      if (
        existingStructure &&
        existingStructure.structureType !== structureType
      ) {
        existingStructure.destroy();
      }

      this.plans[planType].push({
        pos: new RoomPosition(x, y, this.room.name),
        structureType
      });
    }
  }

  planExtensions(baseCenter: RoomPosition, rcl: number) {
    console.log('planning extensions');

    const maxPerRCL = [0, 0, 5, 10, 20, 30, 40, 50, 60];

    const pattern = [
      { x: -3, y: -2 },
      { x: -3, y: -1 },
      { x: -2, y: -1 },
      { x: -2, y: -3 },
      { x: -1, y: -3 },
      { x: -1, y: -2 }
    ];

    const plans: BuildingPlan[] = [];

    let numExtensions =
      this.room.findConstructionSites(STRUCTURE_EXTENSION).length +
      this.room.find(FIND_STRUCTURES, {
        filter: struct => struct.structureType === STRUCTURE_EXTENSION
      }).length;

    for (let xF = -1; xF <= 1; xF += 2) {
      for (let yF = -1; yF <= 1; yF += 2) {
        for (const pos of pattern) {
          if (numExtensions >= maxPerRCL[rcl]) break;

          const x = baseCenter.x + pos.x * xF;
          const y = baseCenter.y + pos.y * yF;

          const existingSite = this.room.lookForAt(
            LOOK_CONSTRUCTION_SITES,
            x,
            y
          )[0];

          if (existingSite?.structureType === STRUCTURE_EXTENSION) {
            continue;
          }

          plans.push({
            pos: new RoomPosition(x, y, this.room.name),
            structureType: STRUCTURE_EXTENSION
          });

          numExtensions++;
        }
      }
    }

    this.plans[PlanType.extension].push(
      ...plans.sort(
        (a, b) => a.pos.getRangeTo(baseCenter) - b.pos.getRangeTo(baseCenter)
      )
    );
  }

  // If dryRun = true, just draw site locations instead of creating them
  placeConstructionSites(dryRun = false, rcl: number) {
    // Counter to stay under config.MAX_CONSTRUCTION_SITES
    let numConstructionSites = this.room.findConstructionSites().length;

    for (const planType of Object.keys(this.plans)) {
      if (planType === PlanType.road && rcl < 3) continue;

      const plans = this.plans[planType as unknown as PlanType];
      console.log(plans.length, planType, 'plans to construct');

      if (dryRun || global.isFirstTick) {
        for (const i in plans) {
          const plan = plans[i];
          if (this.room.visual.getSize() < 512000) {
            this.room.visual.circle(plan.pos.x, plan.pos.y, {
              radius: 0.25,
              fill:
                plan.structureType === STRUCTURE_ROAD
                  ? 'grey'
                  : plan.structureType === STRUCTURE_CONTAINER ||
                    plan.structureType === STRUCTURE_STORAGE
                  ? 'orange'
                  : plan.structureType === STRUCTURE_TOWER
                  ? 'red'
                  : plan.structureType === STRUCTURE_EXTENSION
                  ? 'yellow'
                  : 'white'
            });
            this.room.visual.text(i, plan.pos.x, plan.pos.y, {
              font: 0.3
            });
          }
        }
      }

      if (dryRun) continue;

      let i = 0;
      while (
        i < plans.length &&
        numConstructionSites <= config.MAX_CONSTRUCTION_SITES
      ) {
        const plan = plans[i];

        const res = this.room.createConstructionSite(
          plan.pos,
          plan.structureType
        );

        if (res === ERR_FULL) break;
        if (res === ERR_RCL_NOT_ENOUGH) {
          i++;
          continue;
        }

        // Remove plan from plans, it's now done or can't be done
        plans.splice(i, 1);
        numConstructionSites++;
      }
    }
  }
}
