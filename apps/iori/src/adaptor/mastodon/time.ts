export const toIsoString = (instant: number): string => new Date(instant).toISOString();

export const toDateString = (instant: number): string => toIsoString(instant).slice(0, 10);
