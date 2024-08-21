import Logger from './Logger';

export default class DefaultConsoleLogger implements Logger {
    debug(...data: any[]): void {
        console.debug(...data);
    }
    log(...data: any[]): void {
        console.log(...data);
    }
    warn(...data: any[]): void {
        console.warn(...data);
    }
    error(...data: any[]): void {
        console.error(...data);
    }
    critical(...data: any[]): void {
        console.error(...data);
    }
}
