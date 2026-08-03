export class Logger {
  private readonly prefix = "[TrustLayer]";
  private readonly enabled: boolean;

  constructor(debug: boolean) {
    this.enabled = debug;
  }

  info(message: string, ...args: unknown[]): void {
    if (this.enabled) {
      console.info(`${this.prefix} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.enabled) {
      console.debug(`${this.prefix} [debug] ${message}`, ...args);
    }
  }
}
