export function rfind(current: object, global: object[], args: Record<string | number, any> | null): object | null {
    return null;
}

export function find(current: object, global: object[], args: Record<string | number, any> | null): object | null {
    return null;
}

export function current(current: object): object {
    return current;
}

export function global(current: object, global: object[]): object[] {
    return global;
}

export function newobject(current: object, global: object[], args: Record<string | number, any> | null): Record<string | number, any> {
    return args || {};
}

export function strjoin(current: object, global: object[], args: Record<string | number, any> | null): string | null {
    if (args == null) {
        return null;
    }

    var result = '';
    for (const name in args) {
        result += args[name];
    }

    return result;
}
