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

  // Plan everything, no matter the RCL (unless rcl < 2)
  // Push all plans to this.plans[type]
  // Place construction sites in order of type priority and RCL limits (extensions,storage)
  run() {
    console.log(this.room, 'RoomPlanner run()');

    const rcl = this.room.controller?.level ?? 0;

    // Nothing to build at level 1
    if (rcl < 2) return;

    // Only plan if no plans (usually global reset/code push)
    if (Object.values(this.plans).flat().length) {
      return;
    }

    if (this.baseCenter) {
      this.planExtensions(this.baseCenter);
      this.planBaseCenter(this.baseCenter);
      this.planRoadsAndContainers(this.baseCenter);
    }

    this.placeConstructionSites(rcl);
  }

  planRoadsAndContainers(baseCenter: RoomPosition) {
    console.log('planning roads/containers');
    const controller = this.room.controller;

    // Make path to each container from spawn, add coords to plans
    // Sort to plan shortest path first, then reuse in other cost matrices
    // If controller in room, make path to that first
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
        console.log('no path found for road to', source);
        continue;
      }

      // Add container construction site at last pos
      this.plans[PlanType.container].push({
        pos: ret.path[ret.path.length - 1],
        structureType: STRUCTURE_CONTAINER
      });

      // Add road construction sites to plans,
      // ignoring last pos to leave room for container
      for (const pos of ret.path.slice(0, ret.path.length - 1)) {
        let skip = false;

        // Don't place road on baseCenter
        if (pos.x === baseCenter.x && pos.y === baseCenter.y) continue;

        for (const plan of this.plans[PlanType.road]) {
          // Avoid duplicate road plans
          if (
            plan.pos.x === pos.x &&
            plan.pos.y === pos.y &&
            plan.structureType === STRUCTURE_ROAD
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

  planBaseCenter(baseCenter: RoomPosition) {
    console.log('planning main base layout');

    this.room.visual.rect(baseCenter.x - 3.5, baseCenter.y - 3.5, 7, 7, {
      stroke: 'grey',
      fill: 'transparent'
    });

    // Plan roads around spawn, both X and + shape 3 long
    // Sort to plan farthest first (closest to sources)
    const roadPlans = baseCenter
      .getDiagonalPositions(3)
      .concat(baseCenter.getAdjacentOrthogonalPositions(3))
      .sort((a, b) => b.getRangeTo(baseCenter) - a.getRangeTo(baseCenter));

    for (const pos of roadPlans) {
      // Leave room for storage/container below baseCenter
      if (pos.x === baseCenter.x && pos.y === baseCenter.y + 1) {
        continue;
      }

      // Leave room for 1 tower on each side of baseCenter
      if (
        pos.y === baseCenter.y &&
        (pos.x === baseCenter.x - 1 || pos.x === baseCenter.x + 1)
      ) {
        continue;
      }

      this.plans[PlanType.road].push({ pos, structureType: STRUCTURE_ROAD });
    }

    // Plan tower sites on each side of center
    this.planTowers(baseCenter);

    // Plan container/storage below center
    this.planCenterStorage(baseCenter);
  }

  planTowers(baseCenter: RoomPosition) {
    console.log('planning towers');

    // TODO: Add more tower sites for higher levels
    const towerSites = [
      new RoomPosition(baseCenter.x - 1, baseCenter.y, this.room.name),
      new RoomPosition(baseCenter.x + 1, baseCenter.y, this.room.name)
    ];

    for (const pos of towerSites) {
      this.plans[PlanType.tower].push({
        pos,
        structureType: STRUCTURE_TOWER
      });
    }
  }

  // Plan container if rcl < 4 or storage
  planCenterStorage(baseCenter: RoomPosition) {
    console.log('planning center storage');
    const rcl = this.room.controller?.level ?? 0;

    if (this.room.storage) return; // No need to plan

    const planType = rcl < 4 ? PlanType.container : PlanType.storage;
    const structureType =
      planType === PlanType.container ? STRUCTURE_CONTAINER : STRUCTURE_STORAGE;

    const x = baseCenter.x;
    const y = baseCenter.y + 1;

    this.plans[planType].push({
      pos: new RoomPosition(x, y, this.room.name),
      structureType
    });
  }

  planExtensions(baseCenter: RoomPosition) {
    console.log('planning extensions');

    const pattern = [
      { x: -3, y: -2 },
      { x: -3, y: -1 },
      { x: -2, y: -1 },
      { x: -2, y: -3 },
      { x: -1, y: -3 },
      { x: -1, y: -2 }
    ];

    const plans: BuildingPlan[] = [];

    // Repeat pattern 4 times rotated around center
    for (let xF = -1; xF <= 1; xF += 2) {
      for (let yF = -1; yF <= 1; yF += 2) {
        for (const pos of pattern) {
          const x = baseCenter.x + pos.x * xF;
          const y = baseCenter.y + pos.y * yF;

          plans.push({
            pos: new RoomPosition(x, y, this.room.name),
            structureType: STRUCTURE_EXTENSION
          });
        }
      }
    }

    // Build closest to spawn first
    this.plans[PlanType.extension].push(
      ...plans.sort(
        (a, b) => a.pos.getRangeTo(baseCenter) - b.pos.getRangeTo(baseCenter)
      )
    );
  }

  // Place construction sites for all plans
  // If wrong construction site or structure is in place, it gets destroyed
  // Placed in order of this.plans PlanType keys,
  // but some limits apply like the amount of each type at a given RCL
  placeConstructionSites(rcl: number) {
    // Counter to stay under config.MAX_CONSTRUCTION_SITES
    let numConstructionSites = this.room.findConstructionSites().length;

    for (const planType of Object.keys(this.plans)) {
      const plans = this.plans[planType as unknown as PlanType];
      console.log(plans.length, planType, 'plans created');

      // Visualize all plans on global reset/code push for sanity check
      if (global.isFirstTick) {
        this.visualizePlans(plans);
      }

      if (planType === PlanType.road && rcl < 3) continue;
      if (planType === PlanType.storage && rcl < 4) continue;

      for (const plan of plans) {
        if (numConstructionSites >= config.MAX_CONSTRUCTION_SITES) break;
        let alreadyBuilt = false;

        // Check existing structures at location, destroy if wrong type
        // If right type, plan is already constructed
        const existingStructures = this.room.lookForAt(
          LOOK_STRUCTURES,
          plan.pos
        );

        for (const struct of existingStructures) {
          if (struct.structureType === plan.structureType) {
            alreadyBuilt = true;
            break;
          } else {
            struct.destroy();
          }
        }

        if (alreadyBuilt) continue;

        // Check existing const sites, destroy if wrong type
        const existingSites = this.room.lookForAt(
          LOOK_CONSTRUCTION_SITES,
          plan.pos
        );

        for (const site of existingSites) {
          if (site.structureType === plan.structureType) {
            alreadyBuilt = true;
            break;
          } else {
            site.remove();
          }
        }

        if (alreadyBuilt) continue;

        const res = this.room.createConstructionSite(
          plan.pos,
          plan.structureType
        );

        if (res === ERR_FULL) return;
        if (res === ERR_RCL_NOT_ENOUGH) continue;
        if (res === OK) numConstructionSites++;
      }
    }
  }

  visualizePlans(plans: BuildingPlan[]) {
    for (const i in plans) {
      const plan = plans[i];
      if (this.room.visual.getSize() >= 512000) break;

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
