import Logger from './Logger';

export default class StubLogger implements Logger {
    debug(...data: any[]): void { }

    log(...data: any[]): void { }

    warn(...data: any[]): void { }

    error(...data: any[]): void { }

    critical(...data: any[]): void { }
}
