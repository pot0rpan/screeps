// https://screeps.admon.dev/building-planner/?share=N4IgdghgtgpiBcIQBoQHcD2AnANgEwRCigxRAGcALCLAxKmvABjKwGMcEAOVAIwFcAlvkFgA5uQShyABwhowUkDIyT4AbVAAPBACYArKgCeegIwBfZNr0AWYwlNdL1+Lp4gTriwF1LFAC7YEGJw8KAqapogOq6GHnq65r6oOKIA1koRCFExugDM9q55SX6BaDBYmarZLrp28UXO0baFuhZWza66rYkduQBsPU259Z66TMMtDXUlqP4VUKIQnGHK1Rq1BdOJySBYGBB04es5U56mAJyTRa0TfQmt7bWmQ-ddrcVv+a0213Wt+j+cTGvy+g2mn1qAHZXrVwWMnp0DLc-lsxv0-kxHtdLiivsCHE4wYVTFC-u4xpCkRcfn9Rg4MfiSYy4cy6a0ibVutNOUi0XpebkCa5BXp4QLUWyvtzzizOo5YfKKWYccrXHcXAqIaraW88ljphrOvrsXqDWNei4Tdqzbqua0yV8adNAV81bo5bkYdNHZrnWNXbVzWK-i8faGSb6kcH4I4cf6HFcnSSk7U1XGvt7zlGvVKrTGDBGeTqGpdZiAYFp5mByIIMIpVlkNnyAX8ZbYi5TMYqYrjpojewmut2bc87Uj27E261PWZW18C6C-R9OyrpXjNinyT29Fm9FSBuOhfPavTXLObuG3n2QSOA6vz3e9EbcjGy18w+dU0jP8-p6Xv1yScMzHUtRXeUsczOBwoMvc5wO+SCgUjdkr1qYVdFgj0HT+cVHyZaYL2wl0-j3KdMxnbcSLdI9d1o1wh3yP5GMtalTVqRiJl2HAIF4KpInQrdiTA3ChOhEkELI99WUNUiNyRdNALo-sqLGLi-DAfg0gqfiaiRDDil2DBeHICoADcdMbE5NxU3xzHMIA

import { BuildingPlans } from 'RoomPlanner';

type BunkerPlan = { dx: number; dy: number };

const storage: BunkerPlan[] = [{ dx: 1, dy: 0 }];
const terminal: BunkerPlan[] = [{ dx: -1, dy: 0 }];
const link: BunkerPlan[] = [{ dx: -1, dy: 1 }];
const nuker: BunkerPlan[] = [{ dx: 1, dy: 1 }];
const observer: BunkerPlan[] = [{ dx: -1, dy: -1 }];

const tower: BunkerPlan[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -2 },
  { dx: 0, dy: 2 },
  { dx: -2, dy: 0 },
  { dx: 2, dy: 0 },
];

const road_windmill: BunkerPlan[] = [
  { dx: 0, dy: -3 },
  { dx: 1, dy: -2 },
  { dx: 2, dy: -1 },
  { dx: 3, dy: 0 },
  { dx: 4, dy: 1 },
  { dx: 5, dy: 2 },
  { dx: 6, dy: 3 },
  { dx: 2, dy: 1 },
  { dx: 1, dy: 2 },
  { dx: 0, dy: 3 },
  { dx: -1, dy: 4 },
  { dx: -2, dy: 5 },
  { dx: -3, dy: 6 },
  { dx: -1, dy: 2 },
  { dx: -2, dy: 1 },
  { dx: -3, dy: 0 },
  { dx: -4, dy: -1 },
  { dx: -5, dy: -2 },
  { dx: -6, dy: -3 },
  { dx: -2, dy: -1 },
  { dx: -2, dy: -1 },
  { dx: -1, dy: -2 },
  { dx: 1, dy: -4 },
  { dx: 2, dy: -5 },
  { dx: 3, dy: -6 },
];

const road_perimeter: BunkerPlan[] = [
  { dx: 3, dy: -5 },
  { dx: 4, dy: -4 },
  { dx: 5, dy: -3 },
  { dx: 6, dy: -2 },
  { dx: 6, dy: -1 },
  { dx: 6, dy: 0 },
  { dx: 6, dy: 1 },
  { dx: 6, dy: 2 },
  { dx: 5, dy: 3 },
  { dx: 4, dy: 4 },
  { dx: 3, dy: 5 },
  { dx: 2, dy: 6 },
  { dx: 1, dy: 6 },
  { dx: 0, dy: 6 },
  { dx: -1, dy: 6 },
  { dx: -2, dy: 6 },
  { dx: -3, dy: 5 },
  { dx: -4, dy: 4 },
  { dx: -5, dy: 3 },
  { dx: -6, dy: 2 },
  { dx: -6, dy: 1 },
  { dx: -6, dy: 0 },
  { dx: -6, dy: -1 },
  { dx: -6, dy: -2 },
  { dx: -5, dy: -3 },
  { dx: -4, dy: -4 },
  { dx: -3, dy: -5 },
  { dx: -2, dy: -6 },
  { dx: -1, dy: -6 },
  { dx: 0, dy: -6 },
  { dx: 1, dy: -6 },
  { dx: 2, dy: -6 },
];

const lab: BunkerPlan[] = [
  { dx: 1, dy: -3 },
  { dx: 2, dy: -3 },
  { dx: 2, dy: -2 },

  { dx: 2, dy: -4 },
  { dx: 3, dy: -4 },
  { dx: 3, dy: -3 },

  { dx: 3, dy: -1 },
  { dx: 3, dy: -2 },
  { dx: 4, dy: -2 },
  { dx: 4, dy: -3 },
];

const extension: BunkerPlan[] = [
  // Right side by labs
  { dx: 4, dy: 0 },
  { dx: 5, dy: 1 },
  { dx: 5, dy: 0 },
  { dx: 5, dy: -1 },
  { dx: 5, dy: -2 },

  // Bottom right
  { dx: 3, dy: 1 },
  { dx: 4, dy: 2 },
  { dx: 3, dy: 2 },
  { dx: 4, dy: 3 },
  { dx: 2, dy: 2 },
  { dx: 3, dy: 3 },
  { dx: 2, dy: 3 },
  { dx: 3, dy: 4 },
  { dx: 1, dy: 3 },
  { dx: 2, dy: 4 },
  { dx: 1, dy: 4 },
  { dx: 2, dy: 5 },
  { dx: 0, dy: 4 },
  { dx: 1, dy: 5 },
  { dx: 0, dy: 5 },
  { dx: -1, dy: 5 },

  // Bottom left
  { dx: -1, dy: 3 },
  { dx: -2, dy: 4 },
  { dx: -2, dy: 3 },
  { dx: -3, dy: 4 },
  { dx: -2, dy: 2 },
  { dx: -3, dy: 3 },
  { dx: -3, dy: 2 },
  { dx: -4, dy: 3 },
  { dx: -3, dy: 1 },
  { dx: -4, dy: 2 },
  { dx: -4, dy: 1 },
  { dx: -5, dy: 2 },
  { dx: -4, dy: 0 },
  { dx: -5, dy: 1 },
  { dx: -5, dy: 0 },
  { dx: -5, dy: -1 },

  // Top left
  { dx: -3, dy: -1 },
  { dx: -4, dy: -2 },
  { dx: -3, dy: -2 },
  { dx: -4, dy: -3 },
  { dx: -2, dy: -2 },
  { dx: -3, dy: -3 },
  { dx: -2, dy: -3 },
  { dx: -3, dy: -4 },
  { dx: -1, dy: -3 },
  { dx: -2, dy: -4 },
  { dx: -1, dy: -4 },
  { dx: -2, dy: -5 },
  { dx: -1, dy: -5 },
  { dx: 0, dy: -5 },
  { dx: 1, dy: -5 },
];

const spawn: BunkerPlan[] = [
  { dx: 1, dy: -1 },
  { dx: 4, dy: -1 },
  { dx: 0, dy: -4 },
];

// Ramparts just cover entire bunker
const rampart: BunkerPlan[] = road_perimeter.concat(
  tower,
  storage,
  terminal,
  link,
  nuker,
  observer,
  spawn,
  extension,
  lab,
  road_windmill.filter(plan => Math.abs(plan.dx) < 6 && Math.abs(plan.dy) < 6)
);

// Based off bunker center, NOT first spawn
const bunkerPlans: { [key in BuildableStructureConstant]?: BunkerPlan[] } = {
  [STRUCTURE_SPAWN]: spawn,
  [STRUCTURE_EXTENSION]: extension,
  [STRUCTURE_STORAGE]: storage,
  [STRUCTURE_TERMINAL]: terminal,
  [STRUCTURE_LINK]: link,
  [STRUCTURE_NUKER]: nuker,
  [STRUCTURE_OBSERVER]: observer,
  [STRUCTURE_ROAD]: road_windmill.concat(road_perimeter),
  [STRUCTURE_TOWER]: tower,
  [STRUCTURE_LAB]: lab,
  [STRUCTURE_RAMPART]: rampart,
};

function calculateRoomPosition(
  baseCenter: RoomPosition,
  plan: BunkerPlan
): RoomPosition {
  return new RoomPosition(
    baseCenter.x + plan.dx,
    baseCenter.y + plan.dy,
    baseCenter.roomName
  );
}

export function generateBunkerPlans(
  baseCenter: RoomPosition
): Partial<BuildingPlans> {
  const plans: Partial<BuildingPlans> = {};

  for (const structureType in bunkerPlans) {
    plans[structureType as BuildableStructureConstant] = (
      bunkerPlans[structureType as BuildableStructureConstant] as BunkerPlan[]
    ).map(plan => ({
      pos: calculateRoomPosition(baseCenter, plan),
      structureType: structureType as BuildableStructureConstant,
    }));
  }

  return plans;
}
