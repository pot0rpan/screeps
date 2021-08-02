// https://github.com/bencbartlett/Overmind/blob/master/src/creepSetups/CreepSetup.ts

import { TaskManager } from 'TaskManager';
import { bodyCost } from 'utils/creep';

declare global {
  interface CreepMemory {
    role: CreepRole;
    working: boolean;
    homeRoom: string;
    task?: CreepTask;
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
    | 'repair';

  type CreepRole = 'pioneer' | 'builder' | 'harvester' | 'mover' | 'upgrader';
}

export abstract class CreepBase {
  abstract role: CreepRole;
  abstract bodyPattern: BodyPartConstant[];
  maxBodyLength = Infinity;
  abstract targetNum(room: Room): number;
  abstract isValidTask(creep: Creep, task: CreepTask): boolean;
  abstract findTask(creep: Creep, taskManager: TaskManager): CreepTask | null;
  abstract run(creep: Creep): void;

  generateBody(energyAvailable: number) {
    const patternCost = bodyCost(this.bodyPattern);
    const numRepeats = Math.min(
      Math.floor(this.maxBodyLength / this.bodyPattern.length),
      Math.floor(energyAvailable / patternCost)
    );

    // Repeat this.bodyPattern as many times as possible
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < numRepeats; i++) {
      body.push(...this.bodyPattern);
    }
    return body;
  }

  build(energyAvailable: number) {
    const body = this.generateBody(energyAvailable);

    return {
      name: `${this.role}-${Game.time}`,
      body,
      cost: bodyCost(body),
    };
  }
}
