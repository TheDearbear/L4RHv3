import Logger from './Logger';

export default class DefaultConsoleLogger implements Logger {
    private warnings: string[] = [];

    debug(...data: any[]): void {
        console.debug(...data);
    }
    log(...data: any[]): void {
        console.log(...data);
    }
    warn(...data: any[]): void {
        var warning = data.map(v => String(v)).join(' ');

        if (!this.warnings.includes(warning)) {
            console.warn(...data);

            this.warnings.push(warning);
        }
    }
    error(...data: any[]): void {
        console.error(...data);
    }
    critical(...data: any[]): void {
        console.error(...data);
    }
}
