import { Colony } from 'Colony';
import config from 'config';
import { isNthTick } from 'utils';

export interface TaskCache {
  [id: string]: CreepTask;
}

export class TaskManager {
  room: Room;
  tasks: TaskCache = {};

  constructor(colony: Colony) {
    this.room = colony.room;
  }

  deleteTask(creep: Creep) {
    if (!creep.memory.task) return;
    // Delete in creep.memory.task and tasks cache
    delete this.tasks[creep.memory.task.id];
    delete creep.memory.task;
  }

  createTask<TaskType extends CreepTask>(
    room: string,
    target: string,
    type: CreepTask['type'],
    data?: any
  ): TaskType {
    return {
      id: `${room}${target}${type}`,
      room,
      target,
      type,
      complete: false,
      data
    } as TaskType;
  }

  assignTask(creep: Creep, newTask: CreepTask): void {
    creep.memory.task = newTask;
    this.tasks[newTask.id] = newTask;
    console.log('assigned task to', creep, JSON.stringify(newTask));
  }

  isTaskTaken(room: string, target: string, type: CreepTask['type']): boolean {
    return !!this.tasks[this.createTask(room, target, type).id];
  }

  populateTaskCache(colonyCreeps: Creep[]): void {
    for (const creep of colonyCreeps) {
      if (creep.memory.task) {
        this.tasks[creep.memory.task.id] = creep.memory.task;
      }
    }
  }

  run(colonyCreeps: Creep[]): void {
    // Populate cache after global reset
    if (global.isFirstTick) {
      this.populateTaskCache(colonyCreeps);
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
        this.deleteTask(creep);

        // Assign a new task and add it to cache
        const newTask = creepClass.findTask(creep, this);
        if (newTask) {
          this.assignTask(creep, newTask);
        }
      }
    }
  }
}
