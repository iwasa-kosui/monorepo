export const assertNever = (value: never): never => {
  throw new Error(`unreachable: ${JSON.stringify(value)}`);
};
