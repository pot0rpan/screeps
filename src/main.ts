import 'prototypes/Creep';
import 'prototypes/Room';
import 'prototypes/RoomPosition';
import 'prototypes/StructureTerminal';

import 'utils/Traveler';

import config from 'config';
import { ErrorMapper } from 'utils/ErrorMapper';
import { isNthTick } from 'utils';
import { Empire } from 'Empire';
import { Stats } from 'Stats';

import { CreepBase } from 'creeps/CreepBase';
import { PioneerCreep } from 'creeps/PioneerCreep';
import { BuilderCreep } from 'creeps/BuilderCreep';
import { HarvesterCreep } from 'creeps/HarvesterCreep';
import { UpgraderCreep } from 'creeps/UpgraderCreep';
import { MoverCreep } from 'creeps/MoverCreep';
import { DefenderCreep } from 'creeps/DefenderCreep';
import { ScoutCreep } from 'creeps/ScoutCreep';
import { ReserverCreep } from 'creeps/ReserverCreep';
import { MinerCreep } from 'creeps/MinerCreep';
import { ExterminatorCreep } from 'creeps/ExterminatorCreep';
import { HaulerCreep } from 'creeps/HaulerCreep';
import { ProspectorCreep } from 'creeps/ProspectorCreep';
import { FillerCreep } from 'creeps/FillerCreep';
import { DrainerCreep } from 'creeps/DrainerCreep';
import { AssassinCreep } from 'creeps/AssassinCreep';
import { SalesmanCreep } from 'creeps/SalesmanCreep';

declare global {
  /*
    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */

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
  defender: new DefenderCreep(),
  harvester: new HarvesterCreep(),
  filler: new FillerCreep(),
  mover: new MoverCreep(),
  builder: new BuilderCreep(),
  upgrader: new UpgraderCreep(),
  scout: new ScoutCreep(),
  exterminator: new ExterminatorCreep(),
  assassin: new AssassinCreep(),
  reserver: new ReserverCreep(),
  miner: new MinerCreep(),
  hauler: new HaulerCreep(),
  prospector: new ProspectorCreep(),
  salesman: new SalesmanCreep(),
  drainer: new DrainerCreep(),
};

global.empire = new Empire();
global.stats = new Stats();
global.isFirstTick = true;

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`<span style="color:#44ff88">-- Tick ${Game.time} --</span>`);

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

  if (Game.cpu.bucket === 10000) {
    Game.cpu.generatePixel();
  }
});
