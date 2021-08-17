// https://github.com/bencbartlett/Overmind/blob/master/src/creepSetups/CreepSetup.ts

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
    | 'withdraw'
    | 'upgrade'
    | 'build'
    | 'repair'
    | 'attack'
    | 'patrol'
    | 'scout'
    | 'reserve';

  type CreepRole =
    | 'pioneer'
    | 'builder'
    | 'harvester'
    | 'mover'
    | 'upgrader'
    | 'defender'
    | 'scout'
    | 'reserver';
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
  abstract targetNum(room: Room): number;
  abstract isValidTask(creep: Creep, task: CreepTask): boolean;
  abstract findTask(creep: Creep, taskManager: TaskManager): CreepTask | null;
  abstract run(creep: Creep): void;

  generateBody(energyAvailable: number) {
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
      Math.floor((energyAvailable - prefixCost - suffixCost) / patternCost)
    );

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

    return body;
  }

  build(energyAvailable: number) {
    const body = this.generateBody(energyAvailable);

    return {
      name: `${this.role}-${Game.time.toString().slice(-4)}`,
      body,
      cost: bodyCost(body),
    };
  }
}
