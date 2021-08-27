import config from 'config';
import { Colony } from 'Colony';
import { isNthTick } from 'utils';

export interface TaskCache {
  [id: string]: { task: CreepTask; creeps: string[] };
}

export class TaskManager {
  roomName: string;
  tasks: TaskCache = {};

  constructor(colony: Colony) {
    this.roomName = colony.roomName;
  }

  generateTaskId(room: string, target: string, type: TaskType): string {
    return `${room}${target}${type}`;
  }

  getTaskById(taskId: string): TaskCache['id'] | undefined {
    return this.tasks[taskId];
  }

  removeTask(creep: Creep) {
    if (!creep.memory.task) return;
    const taskId = creep.memory.task.id;

    const cache = this.tasks[taskId];

    if (cache) {
      // Remove creep from task.creeps
      this.tasks[taskId].creeps = this.tasks[taskId].creeps.filter(
        name => name !== creep.name
      );

      // Remove task from cache if no creeps doing it anymore
      if (!this.tasks[taskId].creeps.length) {
        delete this.tasks[taskId];
      }
    }

    delete creep.memory.task;
  }

  createTask<Task extends CreepTask>(
    room: string,
    target: string,
    type: Task['type'],
    limit: number = -1,
    data?: Task['data']
  ): Task {
    // TODO: Fix generic typing and remove `as`
    const task = {
      id: this.generateTaskId(room, target, type),
      room,
      target,
      type,
      complete: false,
      limit,
      data,
    } as Task;

    if (limit < 0 && type === 'harvest') {
      // Limit based on available spaces
      task.limit =
        Game.getObjectById(target as Id<Source>)?.pos.getAdjacentPositions(1)
          .length ?? -1;
    }

    return task;
  }

  assignTask(creep: Creep, newTask: CreepTask): void {
    let cache = this.tasks[newTask.id];

    let limit = newTask.limit;

    if (cache) {
      if (cache.task.limit !== limit) {
        // Update cache and other creeps memory if limit changed
        cache.task.limit = limit;

        for (const creepName of cache.creeps) {
          const task = Memory.creeps[creepName].task;
          if (task) task.limit = limit;
        }
      }

      cache.creeps.push(creep.name);
    } else {
      this.tasks[newTask.id] = { task: newTask, creeps: [creep.name] };
    }

    creep.memory.task = newTask;

    // Reset recycle timer
    delete creep.memory.recycle;

    console.log('assigned task to', creep, JSON.stringify(newTask));
  }

  isTaskTaken(
    room: string,
    target: string,
    type: TaskType,
    newLimit?: number
  ): boolean {
    const cache = this.tasks[this.generateTaskId(room, target, type)];
    if (!cache) return false;

    const limit = newLimit === undefined ? cache.task.limit : newLimit;

    if (limit < 0) return false;

    return cache.creeps.length >= limit;
  }

  populateTaskCache(colonyCreeps: Creep[]): void {
    this.tasks = {};

    for (const creep of colonyCreeps) {
      if (!creep.spawning && creep.memory.task) {
        if (this.tasks[creep.memory.task.id]) {
          this.tasks[creep.memory.task.id].creeps.push(creep.name);
        } else {
          this.tasks[creep.memory.task.id] = {
            task: creep.memory.task,
            creeps: [creep.name],
          };
        }
      }
    }
  }

  cleanTaskCache(colonyCreeps: Creep[]): void {
    this.populateTaskCache(colonyCreeps);
  }

  run(colonyCreeps: Creep[]): void {
    // Populate cache after global reset
    if (global.isFirstTick) {
      this.populateTaskCache(colonyCreeps);
    }

    // Clean cache every N ticks
    if (isNthTick(config.ticks.CLEAN_TASK_CACHE)) {
      this.cleanTaskCache(colonyCreeps);
    }

    for (const creep of colonyCreeps) {
      if (creep.spawning) continue;

      const creepClass = global.Creeps[creep.memory.role];

      // Check task validity every N ticks,
      // mark as complete if not valid anymore
      if (
        isNthTick(config.ticks.RECHECK_TASK_VALIDITY) &&
        creep.memory.task &&
        !creepClass.isValidTask(creep, creep.memory.task)
      ) {
        console.log(
          creep,
          'deleted invalid task',
          JSON.stringify(creep.memory.task)
        );
        creep.memory.task.complete = true;
      }

      // Assign new task if needed
      if (!creep.memory.task || creep.memory.task.complete) {
        this.removeTask(creep);

        // Assign a new task and add it to cache
        const start = Game.cpu.getUsed();
        const newTask = creepClass.findTask(creep, this);
        global.stats.profileLog(`${creep.memory.role} findTask()`, start);

        if (newTask) {
          this.assignTask(creep, newTask);
        } else {
          console.log(creep, 'no task to assign');
        }
      }
    }
  }
}
