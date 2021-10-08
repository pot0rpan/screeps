// https://github.com/bencbartlett/Overmind/blob/master/src/creepSetups/CreepSetup.ts

declare global {
  interface Memory {
    _stealth?: boolean;
  }
}

import config from 'config';
import { TaskManager } from 'TaskManager';
import { bodyCost } from 'utils/creep';

declare global {
  interface CreepMemory {
    role: CreepRole;
    working: boolean;
    homeRoom: string;
    task?: CreepTask;
    recycle?: number;
  }

  interface CreepTask {
    id: string;
    room: string;
    target: string;
    type: TaskType;
    complete: boolean;
    limit: number;
    data?: any;
  }

  type TaskType =
    | 'transfer'
    | 'harvest'
    | 'harvest_static'
    | 'withdraw'
    | 'upgrade'
    | 'build'
    | 'repair'
    | 'attack'
    | 'scout'
    | 'reserve'
    | 'guard'
    | 'exterminate'
    | 'pickup'
    | 'drain'
    | 'assassinate'
    | 'balance'
    | 'heal'
    | 'claim'
    | 'colonize'
    | 'loot'
    | 'explore';

  type CreepRole =
    | 'pioneer'
    | 'builder'
    | 'harvester'
    | 'mover'
    | 'filler'
    | 'upgrader'
    | 'ranged_defender'
    | 'defender'
    | 'scout'
    | 'reserver'
    | 'guard'
    | 'miner'
    | 'exterminator'
    | 'hauler'
    | 'prospector'
    | 'drainer'
    | 'assassin'
    | 'accountant'
    | 'attacker'
    | 'healer'
    | 'operator'
    | 'claimer'
    | 'colonizer'
    | 'looter'
    | 'explorer';
}

export interface BodySettings {
  pattern: BodyPartConstant[];
  sizeLimit?: number;
  ordered?: boolean;
  prefix?: BodyPartConstant[];
  suffix?: BodyPartConstant[];
}

interface BodySettingsPopulated extends BodySettings {
  sizeLimit: number;
  ordered: boolean;
  prefix: BodyPartConstant[];
  suffix: BodyPartConstant[];
}

export abstract class CreepBase {
  abstract role: CreepRole;
  abstract bodyOpts: BodySettings;
  public taskPriority = 1; // 1 will findTask every tick if no task assigned
  abstract targetNum(room: Room): number;
  abstract isValidTask(creep: Creep, task: CreepTask): boolean;
  abstract findTask(creep: Creep, taskManager: TaskManager): CreepTask | null;
  abstract run(creep: Creep): void;

  private bodySizeCache: Record<number, BodyPartConstant[]> = {};

  // Override to limit spawning to certain spawn(s) by role
  // used for Operator currently
  public shouldUseSpawn(spawn: StructureSpawn): boolean {
    return true;
  }

  generateBody(energyAvailable: number): BodyPartConstant[] {
    if (this.bodySizeCache[energyAvailable]) {
      return this.bodySizeCache[energyAvailable];
    }

    const defaults: Partial<BodySettings> = {
      sizeLimit: Infinity,
      ordered: false,
      prefix: [],
      suffix: [],
    };
    const opts = Object.assign(
      defaults,
      this.bodyOpts
    ) as BodySettingsPopulated;

    const body: BodyPartConstant[] = [];
    const prefixCost = bodyCost(opts.prefix);
    const suffixCost = bodyCost(opts.suffix);
    const patternCost = bodyCost(opts.pattern);
    const numRepeats = Math.min(
      opts.sizeLimit,
      Math.floor((energyAvailable - prefixCost - suffixCost) / patternCost),
      Math.floor(
        (50 - opts.prefix.length - opts.suffix.length) / opts.pattern.length
      )
    );
    if (numRepeats === 0) return [];

    if (opts.prefix.length) {
      for (const part of opts.prefix) {
        body.push(part);
      }
    }

    if (opts.ordered) {
      for (const part of opts.pattern) {
        for (let i = 0; i < numRepeats; i++) {
          body.push(part);
        }
      }
    } else {
      for (let i = 0; i < numRepeats; i++) {
        body.push(...opts.pattern);
      }
    }

    if (opts.suffix.length) {
      for (const part of opts.suffix) {
        body.push(part);
      }
    }

    this.bodySizeCache[energyAvailable] = body;

    return body;
  }

  build(energyAvailable: number) {
    const body = this.generateBody(energyAvailable);

    return {
      name: `${Memory._stealth ? config.STEALTH_NAME : this.role}-${Game.time
        .toString()
        .slice(-4)}-${Math.random().toString().slice(-2)}`,
      body,
      cost: bodyCost(body),
    };
  }
}
