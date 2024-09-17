import DisassembledChunk from '../chunks/DisassembledChunk';
import ScriptContext from './ScriptContext';

export function rfind(
    context: ScriptContext,
    args: Record<string | number, any> | null
): object[] | object | null {
    if (args == null || typeof args.id !== 'number' || typeof args.max_backtrace !== 'number') {
        throw new Error('Invalid args were passed');
    }

    var id = args.id;
    var maxBacktrace = Math.min(args.max_backtrace, context.backtrace.length);

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
        let limit = backtrace.pop() || context.globalStorage.length;

        if (wasntEmpty && iteration === 0) {
            limit--;
        }
        
        let layer = getLayer(context.globalStorage, backtrace);
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

    return processLayer(context.backtrace);
}

export function find(context: ScriptContext, args: Record<string | number, any> | null): object | null {
    return null;
}

export function current(context: ScriptContext): object {
    return context.currentChunk;
}

export function global(context: ScriptContext): object[] {
    return context.globalStorage;
}

export function size(context: ScriptContext): number {
    var backtrace = context.backtrace.slice(0);
    var lastIndex = backtrace.pop();

    if (lastIndex == null) {
        throw new Error('Unexpected end of backtrace');
    }

    var current = getLayer(context.globalStorage, backtrace)[lastIndex];

    if (Array.isArray(current.data)) {
        let length = 0;

        current.data.forEach((v, i) => {
            let newContext = new ScriptContext(v.data, context.globalStorage, [...context.backtrace, i], context.utils);
            length += size(newContext);
        });

        return length;
    }

    var doc = context.utils.behaviour.docs.lookup(current.id);

    if (doc == null || doc.schema == null) {
        throw new Error('Invalid schema');
    }

    return context.utils.structureByteLength(doc.schema);
}

export function newobject(
    context: ScriptContext | undefined = undefined,
    args: Record<string | number, any> | null
): Record<string | number, any> {
    return args || {};
}

export function strjoin(
    context: ScriptContext | undefined = undefined,
    args: Record<string | number, any> | null
): string | null {
    if (args == null) {
        return null;
    }

    var result = '';
    for (const name in args) {
        result += args[name];
    }

    return result;
}

export function math(
    context: ScriptContext | undefined = undefined,
    args: Record<string | number, any> | null
): number {
    if (
        args == null ||
        typeof args.a !== 'number' ||
        typeof args.b !== 'number' ||
        typeof args.action !== 'string'
    ) {
        throw new Error('Invalid args were passed');
    }

    switch (args.action) {
        case 'plus':
            return args.a + args.b;
        
        case 'minus':
            return args.a - args.b;
        
        case 'multiply':
            return args.a * args.b;
        
        case 'divide':
            return args.a / args.b;
    }

    throw new Error('Unknown action was passed');
}

function getLayer(global: DisassembledChunk[], backtrace: number[]): DisassembledChunk[] {
    var layer = global;
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
