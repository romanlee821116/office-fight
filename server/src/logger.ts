function stamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (...args: unknown[]) => console.info(`[${stamp()}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${stamp()}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${stamp()}]`, ...args),
};
