import 'prototypes/Creep';
import 'prototypes/Room';
import 'prototypes/RoomPosition';

import 'utils/Traveler';

import config from 'config';
import { Empire } from 'Empire';
import { Stats } from 'Stats';
import { CreepBase } from 'creeps/CreepBase';
import { PioneerCreep } from 'creeps/PioneerCreep';
import { BuilderCreep } from 'creeps/BuilderCreep';
import { HarvesterCreep } from 'creeps/HarvesterCreep';
import { UpgraderCreep } from 'creeps/UpgraderCreep';
import { MoverCreep } from 'creeps/MoverCreep';
import { ErrorMapper } from 'utils/ErrorMapper';
import { isNthTick } from 'utils';

declare global {
  /*
    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */

  interface Memory {
    colonies?: { roomName: string }[];
    _showStats?: boolean;
  }

  namespace NodeJS {
    interface Global {
      empire: Empire;
      stats: Stats;
      Creeps: Record<string, CreepBase>;
      isFirstTick: boolean;
    }
  }
}

global.Creeps = {
  pioneer: new PioneerCreep(),
  builder: new BuilderCreep(),
  harvester: new HarvesterCreep(),
  upgrader: new UpgraderCreep(),
  mover: new MoverCreep(),
};

global.empire = new Empire();
global.stats = new Stats();
global.isFirstTick = true;

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`Current game tick is ${Game.time}`);

  // Delete memory of missing creeps
  if (isNthTick(config.ticks.DELETE_DEAD_CREEP_MEMORY)) {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
      }
    }
  }

  // Run rooms
  global.empire.run();

  // Show stats visuals
  global.stats.run(global.empire);

  global.isFirstTick = false;
});
