import config from 'config';
import { generateBunkerPlans } from 'stamps/bunker';

declare global {
  interface RoomMemory {
    baseCenter?: { x: number; y: number };
  }
}

export interface BuildingPlan {
  pos: RoomPosition;
}

export type BuildingPlans = {
  [key in BuildableStructureConstant]?: BuildingPlan[];
};

export class RoomPlanner {
  roomName: string;
  baseCenter: RoomPosition | null = null;
  rcl: number;
  plans: BuildingPlans = {};

  constructor(roomName: string) {
    const room = Game.rooms[roomName];
    this.roomName = roomName;
    this.rcl = room.controller?.level ?? 0;

    if (room.memory.baseCenter) {
      this.baseCenter = new RoomPosition(
        room.memory.baseCenter.x,
        room.memory.baseCenter.y,
        roomName
      );
    } else {
      const spawn = room.findSpawns()[0];
      if (spawn) {
        this.baseCenter = new RoomPosition(
          spawn.pos.x - 1,
          spawn.pos.y + 1,
          roomName
        );
        room.memory.baseCenter = { x: this.baseCenter.x, y: this.baseCenter.y };
      }
    }
  }

  // Plan everything, no matter the RCL (unless rcl < 2)
  // Push all plans to this.plans[type]
  public run() {
    console.log('RoomPlanner run()');

    if (!this.baseCenter) return;
    const room = Game.rooms[this.roomName];
    this.rcl = room.controller?.level ?? 0;

    // Nothing to build at lvl 1
    if (this.rcl < 2) return;

    // Don't construct when under attack
    if (Memory.rooms[this.roomName].defcon) return;

    // Only plan if bucket isn't empty and no plans exist (global reset)
    if (
      (this.roomName === 'sim' || Game.cpu.bucket > 200) &&
      !Object.keys(this.plans).length
    ) {
      if (this.baseCenter) {
        this.planBunker(this.baseCenter);
        this.planSourceRoutes(this.baseCenter);
        this.planControllerProtection();
        if (this.rcl >= 6) {
          this.planMineralRoute(this.baseCenter);
        }
      }
    }

    this.placeConstructionSites(this.rcl);
  }

  private planBunker(baseCenter: RoomPosition): void {
    this.plans = generateBunkerPlans(baseCenter);
  }

  private planControllerProtection(): void {
    const controller = Game.rooms[this.roomName].controller;
    if (!controller) return;

    if (!this.plans[STRUCTURE_RAMPART]) this.plans[STRUCTURE_RAMPART] = [];

    for (const pos of controller.pos.getAdjacentPositions(1, true)) {
      (this.plans[STRUCTURE_RAMPART] as BuildingPlan[]).push({
        pos,
      });
    }
  }

  private planSourceRoutes(baseCenter: RoomPosition): void {
    console.log('planning roads/containers');

    const containers: {
      controller: BuildingPlan;
      sources: BuildingPlan[];
    } = {
      controller: null!,
      sources: [],
    };

    const links: {
      controller: BuildingPlan;
    } = {
      controller: null!,
    };

    const room = Game.rooms[this.roomName];
    const controller = room.controller;

    // Make path to each container from spawn, add coords to plans
    // Sort to plan shortest path first, then reuse in other cost matrices
    // If controller in room, make path to that first
    let sources: (Source | StructureController)[] = room.findSources();
    sources.sort(
      (a, b) => a.pos.getRangeTo(baseCenter) - b.pos.getRangeTo(baseCenter)
    );

    // Always do controller route first
    if (controller) sources.unshift(controller);

    // Fix bug: Don't double place containers at sources
    const sourcesNeedingContainers = sources.filter(
      source =>
        !source.pos.findInRange(FIND_STRUCTURES, 2, {
          filter: struct => struct.structureType === STRUCTURE_CONTAINER,
        }).length &&
        !source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, {
          filter: site => site.structureType === STRUCTURE_CONTAINER,
        }).length
    );

    // Probably need the same here
    // Only place link at controller for now
    const sourcesNeedingLinks = sources.filter(
      source =>
        source instanceof StructureController &&
        source.pos.getAdjacentPositions(1, true).length > 1 &&
        !source.pos.findInRange(FIND_STRUCTURES, 1, {
          filter: struct => struct.structureType === STRUCTURE_LINK,
        }).length &&
        !source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
          filter: site => site.structureType === STRUCTURE_LINK,
        }).length
    );

    // baseCenter is only walkable by spawning there,
    // so start pathfinding from road above first spawn
    const startPos = new RoomPosition(
      baseCenter.x + 1,
      baseCenter.y - 2,
      baseCenter.roomName
    );

    for (const source of sources) {
      const goal = { pos: source.pos, range: 1 };

      const ret = PathFinder.search(startPos, goal, {
        plainCost: 2,
        swampCost: 10,
        maxRooms: 1,

        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          const costs = new PathFinder.CostMatrix();

          // Add road plans as lowest cost,
          // and other plans as blocking
          for (const planType in this.plans) {
            if (
              planType === STRUCTURE_RAMPART ||
              planType === STRUCTURE_CONTAINER
            ) {
              continue;
            }

            const cost = planType === STRUCTURE_ROAD ? 1 : 0xff;

            for (const plan of this.plans[
              planType as BuildableStructureConstant
            ] ?? []) {
              costs.set(plan.pos.x, plan.pos.y, cost);
            }
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
        },
      });

      if (ret.incomplete || !ret.path.length) {
        console.log('no path found for road to', source);
        continue;
      }

      // Add link construction site at last pos if controller
      if (sourcesNeedingLinks.includes(source)) {
        links.controller = {
          pos: ret.path[ret.path.length - 1],
        };
      }

      // Add container at second to last pos
      if (sourcesNeedingContainers.includes(source)) {
        const plan = {
          pos: ret.path[ret.path.length - 2],
          structureType: STRUCTURE_CONTAINER,
        };

        if (source instanceof StructureController) {
          containers.controller = plan;
        } else {
          containers.sources.push(plan);
        }
      }

      // Add road construction sites to plans,
      // ignoring first 2 positions to clear baseCenter
      // and last pos to leave room for link
      if (!this.plans[STRUCTURE_ROAD]) this.plans[STRUCTURE_ROAD] = [];

      for (const pos of ret.path.slice(2, ret.path.length - 1)) {
        let skip = false;

        // Don't place road on baseCenter
        if (pos.x === baseCenter.x && pos.y === baseCenter.y) continue;

        for (const plan of this.plans[STRUCTURE_ROAD] as BuildingPlan[]) {
          // Avoid duplicate road plans
          if (plan.pos.x === pos.x && plan.pos.y === pos.y) {
            skip = true;
            break;
          }
        }

        if (!skip) {
          (this.plans[STRUCTURE_ROAD] as BuildingPlan[]).push({
            pos,
          });
        }
      }
    }

    if (!this.plans[STRUCTURE_CONTAINER]) this.plans[STRUCTURE_CONTAINER] = [];
    if (!this.plans[STRUCTURE_LINK]) this.plans[STRUCTURE_LINK] = [];

    if (containers.controller) {
      // Add container plans in order of priority
      // Add closest source container first, then controller, then other sources
      (this.plans[STRUCTURE_CONTAINER] as BuildingPlan[]).unshift(
        containers.sources[0],
        containers.controller,
        ...containers.sources.slice(1)
      );
    } else if (containers.sources.length) {
      (this.plans[STRUCTURE_CONTAINER] as BuildingPlan[]).unshift(
        ...containers.sources
      );
    }

    if (links.controller) {
      (this.plans[STRUCTURE_LINK] as BuildingPlan[]).push(links.controller);
    }
  }

  private planMineralRoute(baseCenter: RoomPosition): void {
    const room = Game.rooms[this.roomName];
    const mineral = room.find(FIND_MINERALS)[0];
    if (!mineral) return;

    if (!this.plans[STRUCTURE_EXTRACTOR]) this.plans[STRUCTURE_EXTRACTOR] = [];
    if (!this.plans[STRUCTURE_ROAD]) this.plans[STRUCTURE_ROAD] = [];

    // Place extractor
    (this.plans[STRUCTURE_EXTRACTOR] as BuildingPlan[]).push({
      pos: mineral.pos,
    });

    // Place road
    const goal = { pos: mineral.pos, range: 1 };

    // baseCenter is only accessible by spawning there,
    // so start pathfinding from road above first spawn
    const startPos = new RoomPosition(
      baseCenter.x + 1,
      baseCenter.y - 2,
      baseCenter.roomName
    );

    const ret = PathFinder.search(startPos, goal, {
      plainCost: 2,
      swampCost: 10,
      maxRooms: 1,

      roomCallback: roomName => {
        const room = Game.rooms[roomName];
        const costs = new PathFinder.CostMatrix();

        // Add road plans
        for (const plan of this.plans[STRUCTURE_ROAD] as BuildingPlan[]) {
          costs.set(plan.pos.x, plan.pos.y, 1);
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
      },
    });

    if (ret.incomplete || !ret.path.length) {
      console.log('no path found for road to', mineral);
      return;
    }

    // Add road construction sites to plans
    for (const pos of ret.path) {
      let skip = false;

      // Don't place road on baseCenter
      if (pos.x === baseCenter.x && pos.y === baseCenter.y) continue;

      for (const plan of this.plans[STRUCTURE_ROAD] as BuildingPlan[]) {
        // Avoid duplicate road plans
        if (plan.pos.x === pos.x && plan.pos.y === pos.y) {
          skip = true;
          break;
        }
      }

      if (!skip) {
        (this.plans[STRUCTURE_ROAD] as BuildingPlan[]).push({
          pos,
        });
      }
    }

    // Add link adjacent to last road position, but not on a road
    // This should keep it in a good spot in range of Prospector creep
    // Should only have to check against second-to-last road plan
    const roadToAvoid = ret.path[ret.path.length - 2];
    for (const pos of ret.path[ret.path.length - 1].getAdjacentPositions(1)) {
      if (!pos.isEqualTo(roadToAvoid)) {
        this.plans[STRUCTURE_LINK]?.push({
          pos,
        });
        break;
      }
    }
  }

  // Place construction sites for all plans
  // If wrong construction site or structure is in place, it gets destroyed
  // Placed in order of this.plans PlanType keys,
  // but some limits apply like the amount of each type at a given RCL
  private placeConstructionSites(rcl: number): void {
    const room = Game.rooms[this.roomName];
    const terrain = new Room.Terrain(this.roomName);

    // Counter to stay under config.MAX_CONSTRUCTION_SITES
    let numConstructionSites = room.findConstructionSites().length;

    for (const planType of Object.keys(this.plans)) {
      const plans = this.plans[
        planType as BuildableStructureConstant
      ] as BuildingPlan[];
      console.log(plans.length, planType, 'plans created');

      // Visualize all plans for sanity check
      this.visualizePlans(planType as BuildableStructureConstant, plans);

      if (planType === STRUCTURE_TOWER && rcl < 3) continue;
      if (planType === STRUCTURE_CONTAINER && rcl < 3) continue;
      if (planType === STRUCTURE_ROAD && rcl < 3) continue;
      if (planType === STRUCTURE_STORAGE && rcl < 4) continue;
      if (planType === STRUCTURE_RAMPART && rcl < 5) continue; // Can be build earlier, but shouldn't need them
      if (planType === STRUCTURE_LINK && rcl < 5) continue;
      if (planType === STRUCTURE_EXTRACTOR && rcl < 6) continue;
      if (planType === STRUCTURE_TERMINAL && rcl < 6) continue;
      if (planType === STRUCTURE_LAB && rcl < 6) continue;

      const maxAtThisRcl =
        CONTROLLER_STRUCTURES[planType as BuildableStructureConstant][rcl];

      for (const plan of plans.slice(0, maxAtThisRcl)) {
        if (numConstructionSites >= config.MAX_CONSTRUCTION_SITES) break;

        if (terrain.get(plan.pos.x, plan.pos.y) === TERRAIN_MASK_WALL) continue;

        let alreadyBuilt = false;

        // Check existing structures at location, destroy if wrong type
        // If right type, plan is already constructed
        for (const struct of room.lookForAt(LOOK_STRUCTURES, plan.pos)) {
          if (
            struct.structureType === (planType as BuildableStructureConstant)
          ) {
            alreadyBuilt = true;
            break;
          }
        }

        if (alreadyBuilt) continue;

        // Can only have 1 construction site per spot
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, plan.pos).length) continue;

        const res = room.createConstructionSite(
          plan.pos,
          planType as BuildableStructureConstant
        );

        if (res === ERR_FULL) return;
        if (res === ERR_RCL_NOT_ENOUGH) continue;
        if (res === OK) numConstructionSites++;
      }
    }
  }

  private visualizePlans(
    type: BuildableStructureConstant,
    plans: BuildingPlan[]
  ): void {
    const room = Game.rooms[this.roomName];

    for (const i in plans) {
      const plan = plans[i];
      if (room.visual.getSize() >= 512000) break;

      let fill = 'white';

      switch (type) {
        case STRUCTURE_ROAD:
          fill = 'grey';
          break;
        case STRUCTURE_CONTAINER:
        case STRUCTURE_STORAGE:
        case STRUCTURE_LINK:
          fill = 'orange';
          break;
        case STRUCTURE_TOWER:
          fill = 'red';
          break;
        case STRUCTURE_EXTENSION:
          fill = 'yellow';
          break;
        case STRUCTURE_SPAWN:
          fill = 'cyan';
          break;
        case STRUCTURE_RAMPART:
          fill = 'transparent';
          break;
        case STRUCTURE_TERMINAL:
          fill = 'blue';
          break;
        case STRUCTURE_LAB:
          fill = 'black';
          break;
      }

      const isRampart = type === STRUCTURE_RAMPART;

      room.visual.circle(plan.pos.x, plan.pos.y, {
        radius: isRampart ? 0.45 : 0.25,
        fill,
        // opacity: isRampart ? 0.2 : undefined,
        stroke: isRampart ? 'green' : undefined,
      });
      if (type !== STRUCTURE_RAMPART) {
        room.visual.text(i, plan.pos.x, plan.pos.y + 0.1, {
          font: 0.3,
        });
      }
    }
  }
}
