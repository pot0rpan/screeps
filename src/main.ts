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
import { DefenderCreep } from 'creeps/DefenderCreep';
import { HarvesterCreep } from 'creeps/HarvesterCreep';
import { FillerCreep } from 'creeps/FillerCreep';
import { MoverCreep } from 'creeps/MoverCreep';
import { BuilderCreep } from 'creeps/BuilderCreep';
import { UpgraderCreep } from 'creeps/UpgraderCreep';
import { ScoutCreep } from 'creeps/ScoutCreep';
import { ExterminatorCreep } from 'creeps/ExterminatorCreep';
import { AssassinCreep } from 'creeps/AssassinCreep';
import { ReserverCreep } from 'creeps/ReserverCreep';
import { MinerCreep } from 'creeps/MinerCreep';
import { HaulerCreep } from 'creeps/HaulerCreep';
import { ProspectorCreep } from 'creeps/ProspectorCreep';
import { AccountantCreep } from 'creeps/AccountantCreep';
import { DrainerCreep } from 'creeps/DrainerCreep';
import { AttackerCreep } from 'creeps/AttackerCreep';
import { HealerCreep } from 'creeps/HealerCreep';
import { RangedDefenderCreep } from 'creeps/RangedDefenderCreep';

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
  filler: new FillerCreep(),
  builder: new BuilderCreep(),
  ranged_defender: new RangedDefenderCreep(),
  defender: new DefenderCreep(),
  attacker: new AttackerCreep(),
  healer: new HealerCreep(),
  exterminator: new ExterminatorCreep(),
  drainer: new DrainerCreep(),
  harvester: new HarvesterCreep(),
  mover: new MoverCreep(),
  upgrader: new UpgraderCreep(),
  assassin: new AssassinCreep(),
  reserver: new ReserverCreep(),
  prospector: new ProspectorCreep(),
  miner: new MinerCreep(),
  hauler: new HaulerCreep(),
  accountant: new AccountantCreep(),
  scout: new ScoutCreep(),
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
