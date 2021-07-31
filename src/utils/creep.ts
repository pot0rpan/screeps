export function bodyCost(bodyParts: BodyPartConstant[]): number {
  return _.sum(bodyParts, part => BODYPART_COST[part]);
}

export function spawnTime(bodyParts: BodyPartConstant[] | number): number {
  let numParts = bodyParts;
  if (Array.isArray(bodyParts)) {
    numParts = bodyParts.length;
  }
  return (numParts as number) * 3;
}
