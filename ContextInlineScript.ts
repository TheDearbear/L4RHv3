export interface ContextFunction {
    (current: object, global: object[], id: number, backtrace: number[]): any;
}

function rfind(current: object, global: object[], id: number, backtrace: number[]): any {
    //
}

function find(current: object, global: object[], id: number, backtrace: number[]): any {
    //
}

function current(current: object, global: object[], id: number, backtrace: number[]): any {
    return current;
}

function global(current: object, global: object[], id: number, backtrace: number[]): any {
    return global;
}

export default class ContextInlineScript {
    public static readonly FUNCTIONS: Record<string, ContextFunction> = {
        rfind: rfind,
        find: find,
        current: current,
        global: global
    };

    public static execute(script: string): any {
        return null;
    }
}
