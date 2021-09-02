import config from 'config';

export function isFlagOfType(
  flag: Flag,
  type: keyof typeof config.flags
): boolean {
  const [primary, secondary] = config.flags[type];
  return flag.color === primary && flag.secondaryColor === secondary;
}
