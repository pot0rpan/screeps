// Toggle `working` boolean if working and out of energy
// or not working and full of energy
// Optionally mark task as complete so TaskManager assigns a new one
export function toggleWorking(creep: Creep, completeTask = true): void {
  if (creep.memory.working && creep.isEmpty()) {
    creep.memory.working = false;
    if (completeTask && creep.memory.task) creep.memory.task.complete = true;
  } else if (!creep.memory.working && creep.isFull()) {
    creep.memory.working = true;
    if (completeTask && creep.memory.task) creep.memory.task.complete = true;
  }
}
