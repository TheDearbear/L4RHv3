import DisassembledChunk from '../chunks/DisassembledChunk';

export function rfind(
    current: DisassembledChunk[] | Record<string, any>,
    global: DisassembledChunk[],
    backtrace: number[],
    args: Record<string | number, any> | null
): object[] | object | null {
    if (args == null || typeof args.id !== 'number' || typeof args.max_backtrace !== 'number') {
        throw new Error('Invalid args were passed');
    }

    var id = args.id;
    var maxBacktrace = Math.min(args.max_backtrace, backtrace.length);

    function getLayer(backtrace: number[]): DisassembledChunk[] {
        let layer = global;
        for (let i = 0; i < backtrace.length; i++) {
            let layerIndex = backtrace[i];

            if (layerIndex >= layer.length) {
                throw new Error('Out-of-bounce backtrace index');
            }

            let chunk = layer[layerIndex];
            if (!Array.isArray(chunk.data)) {
                throw new Error('Chunk with data found');
            }

            layer = chunk.data;
        }

        return layer;
    }

    function rfindChunkById(source: DisassembledChunk, id: number): DisassembledChunk | null {
        if (Array.isArray(source.data)) {
            for (let i = source.data.length - 1; i >= 0; i--) {
                let chunk = rfindChunkById(source.data[i], id);
                if (chunk != null) {
                    return chunk;
                }
            }
        }

        return source.id === id ? source : null;
    }

    function processLayer(backtrace: number[], iteration: number = 0): object[] | object | null {
        let wasntEmpty = backtrace.length !== 0;
        let limit = backtrace.pop() || global.length;

        if (wasntEmpty && iteration === 0) {
            limit--;
        }
        
        let layer = getLayer(backtrace);
        for (let i = limit; i >= 0; i--) {
            let foundChunk = rfindChunkById(layer[i], id);
            if (foundChunk != null) {
                return foundChunk.data;
            }
        }

        if (maxBacktrace < iteration) {
            return processLayer(backtrace, iteration + 1);
        }

        return null;
    }

    return processLayer(backtrace);
}

export function find(current: object, global: object[], backtrace: number[], args: Record<string | number, any> | null): object | null {
    return null;
}

export function current(current: object): object {
    return current;
}

export function global(current: object, global: object[]): object[] {
    return global;
}

export function newobject(current: object, global: object[], backtrace: number[], args: Record<string | number, any> | null): Record<string | number, any> {
    return args || {};
}

export function strjoin(current: object, global: object[], backtrace: number[], args: Record<string | number, any> | null): string | null {
    if (args == null) {
        return null;
    }

    var result = '';
    for (const name in args) {
        result += args[name];
    }

    return result;
}
