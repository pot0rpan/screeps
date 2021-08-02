import config from 'config';
import { Colony } from 'Colony';
import { isNthTick } from 'utils';

export interface TaskCache {
  [id: string]: { task: CreepTask; creeps: string[] };
}

export class TaskManager {
  room: Room;
  tasks: TaskCache = {};

  constructor(colony: Colony) {
    this.room = colony.room;
  }

  generateTaskId(room: string, target: string, type: TaskType): string {
    return `${room}${target}${type}`;
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
    type: TaskType,
    limit: number = -1,
    data?: any
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
    return task;
  }

  assignTask(creep: Creep, newTask: CreepTask): void {
    creep.memory.task = newTask;

    if (this.tasks[newTask.id]) {
      this.tasks[newTask.id].creeps.push(creep.name);
    } else {
      this.tasks[newTask.id] = { task: newTask, creeps: [creep.name] };
    }

    console.log('assigned task to', creep, JSON.stringify(newTask));
  }

  isTaskTaken(room: string, target: string, type: TaskType): boolean {
    const cache = this.tasks[this.generateTaskId(room, target, type)];
    if (!cache) return false;
    if (cache.task.limit < 0) return false;
    return cache.creeps.length >= cache.task.limit;
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
        const newTask = creepClass.findTask(creep, this);
        if (newTask) {
          this.assignTask(creep, newTask);
        }
      }
    }
  }
}
