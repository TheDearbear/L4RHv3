import DisassembledChunk from '../chunks/DisassembledChunk';
import RawChunk from '../chunks/RawChunk';
import Utilities from '../Utilities';
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

// Size of current aligned raw chunk data
export function rawsize(context: ScriptContext): number {
    var backtrace = context.backtraceRaw.slice(0);
    var lastIndex = backtrace.pop();

    if (lastIndex == null) {
        throw new Error('Unexpected end of backtrace');
    }

    var currentLayer = getRawLayer(context.globalRawStorage, backtrace);
    var current = currentLayer[lastIndex];

    if (Array.isArray(current.data)) {
        let length = 0;

        current.data.forEach((v, i) => {
            let newContext = new ScriptContext(
                [],
                context.globalStorage, [],
                context.globalRawStorage, [...context.backtraceRaw, i],
                context.extraProperties,
                context.utils);
            length += rawsize(newContext);
        });

        return length;
    }

    var pseudoPointer = getRawPseudoPointer(context.globalRawStorage, backtrace);
    for (let i = 0; i < lastIndex; i++) {
        pseudoPointer += currentLayer[i].length + 8;
    }

    // Also count chunk header
    pseudoPointer += 8;

    var doc = context.utils.behaviour.docs.lookup(current.id);

    if (doc == null || doc.schema == null) {
        throw new Error('Invalid schema');
    }

    let length = current.length;
    if (doc.data_align != null && pseudoPointer % doc.data_align != 0) {
        var alignedPointer = Utilities.alignDataPointer(pseudoPointer, doc.data_align);
        length -= alignedPointer - pseudoPointer;
    }

    return length;
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

export function index(context: ScriptContext): number {
    var index = context.extraProperties[ScriptContext.PROPERTY_INDEX];

    if (typeof index !== 'number') {
        throw new Error('Index is not defined or have wrong type');
    }

    return index;
}

export function root(context: ScriptContext): object {
    var root = context.extraProperties[ScriptContext.PROPERTY_ROOT];

    if (typeof root !== 'object') {
        throw new Error('Invalid root object');
    }

    return root;
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

function getRawLayer(global: RawChunk[], backtrace: number[]): RawChunk[] {
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

function getRawPseudoPointer(global: RawChunk[], backtrace: number[]): number {
    var layer = global;
    var pseudoPointer = 0;
    for (let i = 0; i < backtrace.length; i++) {
        let layerIndex = backtrace[i];

        for (let j = 0; j < layerIndex; j++) {
            pseudoPointer += layer[j].length + 8;
        }

        if (layerIndex >= layer.length) {
            throw new Error('Out-of-bounce backtrace index');
        }

        let chunk = layer[layerIndex];
        if (!Array.isArray(chunk.data)) {
            throw new Error('Chunk with data found');
        }

        layer = chunk.data;
        
        // Count header of parent chunk
        pseudoPointer += 8;
    }

    return pseudoPointer;
}
