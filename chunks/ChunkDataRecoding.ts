import FieldTypes from '../FieldTypes';
import Settings from '../Settings';
import SubnestField from '../SubnestField';
import Utilities from '../Utilities';
import ContextInlineScript from '../cis/ContextInlineScript';
import ReferencedValue from '../cis/ReferencedValue';
import ScriptContext from '../cis/ScriptContext';

export default class ChunkDataRecoding {
    public static readonly LEFTOVERS = '__leftovers__';

    public readonly utils: Utilities;

    constructor(utils: Utilities = new Utilities()) {
        this.utils = utils;
    }

    /**
     * Decodes data to disassembled format or returns source string if schema is `null`
     * @param data Buffer with data
     * @param pseudoPointer Pointer to current position in bytes relative to the start of file
     * @param schema Schema for data
     * @param chunkId Id of chunk
     * @param global Global context for decoding
     * @param backtrace Backtrace from global context to current
     * @returns Disassembled data or source string encoded with `base64` if schema is `null`
     */
    public decode(
        data: Buffer,
        pseudoPointer: number = 0,
        schema: Record<string, SubnestField> | null = null,
        chunkId: number | null = null,
        context: ScriptContext
    ): Record<string, any> | string {
        if (schema == null) {
            return data.toString('base64');
        }

        var result: Record<string, any> = {};
        var chunk = chunkId ? Utilities.uint32AsHex(chunkId) : 'unknown';

        for (const name in schema) {
            const value = schema[name];
            let rawLength = value.length;

            if (typeof value.modifier === 'string' &&
                value.modifier != 'jagged_array' &&
                value.modifier != 'string' &&
                value.modifier != 'padding'
            ) {
                throw new Error('Unknown modifier was specified (' + chunk + ':' + name + ')');
            }

            if (value.bitfield != null && value.length != null) {
                throw new Error('Bitfield cannot be used in array (' + chunk + ':' + name + ')');
            }

            if (value.bitfield != null && (value.modifier != null && value.modifier != "padding")) {
                throw new Error('Only "padding" modifier allowed when using bitfield (' + chunk + ':' + name + ')');
            }

            if (value.bitfield != null && !value.unsigned) {
                throw new Error('Bitfield can be applied only to unsigned integer field (' + chunk + ':' + name + ')');
            }

            if (value.bitfield != null &&
                value.type != FieldTypes.INT8 &&
                value.type != FieldTypes.INT16 &&
                value.type != FieldTypes.INT32 &&
                value.type != FieldTypes.INT64
            ) {
                throw new Error('Bitfield can be applied only to integer field (' + chunk + ':' + name + ')');
            }

            if (value.modifier == 'string' && value.type !== FieldTypes.INT8) {
                throw new Error('String modifier can be applied only to int8 (' + chunk + ':' + name + ')');
            }

            var isJaggedArray = value.modifier == 'jagged_array';

            if (typeof rawLength === 'string' && !isJaggedArray) {
                let localContext = new ScriptContext(
                    result,
                    context.globalStorage,
                    context.backtrace,
                    context.globalRawStorage,
                    context.backtraceRaw,
                    this.utils
                );
                let executeResult = ContextInlineScript.execute(rawLength, localContext);

                rawLength = executeResult instanceof ReferencedValue ? executeResult.get() : executeResult;
            }

            if (value.modifier == 'string' && typeof rawLength !== 'number') {
                throw new Error('Length of string must be specified (' + chunk + ':' + name + ')');
            }

            if (isJaggedArray && value.type !== FieldTypes.STRUCTURE) {
                throw new Error('Jagged array modifier can only be applied to structure (' + chunk + ':' + name + ')');
            }

            if (isJaggedArray && typeof rawLength !== 'string') {
                throw new Error('Size of array\'s element must be specified as ContextInlineScript (' + chunk + ':' + name + ')');
            }

            var length = 1;
            if (typeof rawLength === 'number') {
                length = rawLength;
            }
            else if (!isJaggedArray && rawLength != null) {
                this.utils.behaviour.logger.warn('Unknown type of length property. Treating as single (' + chunk + ':' + name + ')');
            }

            if (!Number.isInteger(length)) {
                this.utils.behaviour.logger.warn('Length have float value (' + chunk + ':' + name + ')');
            }

            var size = 0;
            if (!isJaggedArray) {
                if (value.type === FieldTypes.STRUCTURE) {
                    if (value.structure == null) {
                        throw new Error('Field specified as structure but no layout present (' + chunk + ':' + name + ')');
                    }

                    size = this.utils.structureByteLength(value.structure);
                } else {
                    size = this.utils.primitiveByteLength(value.type);
                }
            
                if (data.length < size * length && typeof rawLength !== 'number') {
                    this.utils.behaviour.logger.error('Provided schema requires bigger data buffer than provided (' + chunk + ':' + name + ')');
                    break;
                }
            }

            function readData(
                ctx: ChunkDataRecoding,
                data: Buffer,
                result: Record<string, any>,
                size: number | undefined,
                offset: number = 0
            ) {
                if (value.type === FieldTypes.STRUCTURE) {
                    var dataEnd = size != undefined ? offset + size : undefined;

                    result[name] = ctx.decode(data.subarray(offset, dataEnd), pseudoPointer, value.structure, chunkId, context);
                    return;
                }
                
                let decoded = ctx.decodeSingle(data, value, offset);
                if (value.bitfield == null) {
                    result[name] = decoded;
                } else {
                    let decodedNumber = decoded as number;

                    for (const key in value.bitfield) {
                        let bitfieldEntry = value.bitfield[key];

                        if (!bitfieldEntry.padding) {
                            result[key] = (decodedNumber >> bitfieldEntry.offset) & ((1 << bitfieldEntry.width) - 1);
                        }
                    }
                }
            }

            var entryValue: Record<string, any> = {};
            var entryOffset = 0;

            if (rawLength == null) {
                readData(this, data, entryValue, size);
                pseudoPointer += size;

                if (value.align != null) {
                    let previousPointer = pseudoPointer;
                    pseudoPointer = Utilities.alignDataPointer(previousPointer, value.align);
                    entryOffset = pseudoPointer - previousPointer;
                }
            } else if (isJaggedArray) {
                let array = [];

                let recodingContext = new ChunkDataRecoding(new Utilities(Object.assign(new Settings(), this.utils.behaviour)));
                recodingContext.utils.behaviour.suppressExtraDataWarning = true;

                let localContext = new ScriptContext(
                    {},
                    context.globalStorage,
                    context.backtrace,
                    context.globalRawStorage,
                    context.backtraceRaw,
                    this.utils
                );

                while (data.length > 0) {
                    let element: Record<string, any> = {};
                    readData(recodingContext, data, element, undefined);
                    localContext.currentChunk = element[name];
                    let executeResult = ContextInlineScript.execute(value.length as string, localContext);
                    let size = executeResult instanceof ReferencedValue ? executeResult.get<number>() : executeResult;

                    if (typeof size !== 'number') {
                        throw new Error('Result of different type was returned after calculating element size (' + chunk + ':' + name + ')');
                    }

                    if (value.align != null) {
                        size = Utilities.alignDataPointer(pseudoPointer + size, value.align) - pseudoPointer;
                    }
                    
                    array.push(element[name]);
                    data = data.subarray(size);
                    pseudoPointer += size;
                }

                entryValue[name] = array;
            } else {
                let array = [];

                for (let j = 0; j < length; j++) {
                    let arrayValue: Record<string, any> = {};
                    readData(this, data, arrayValue, size, j * size);
                    array.push(arrayValue[name]);
                    pseudoPointer += size;
                }

                if (value.align != null) {
                    let previousPointer = pseudoPointer;
                    pseudoPointer = Utilities.alignDataPointer(previousPointer, value.align);
                    entryOffset = pseudoPointer - previousPointer;
                }

                entryValue[name] = array;
            }

            if (value.type === FieldTypes.INT8 && value.modifier === 'string') {
                entryValue[name] = Utilities.readAscii(Buffer.from(entryValue[name]));
            }

            data = data.subarray(size * length + entryOffset);
            if (value.modifier !== 'padding' || this.utils.behaviour.exportPaddings) {
                for (const key in entryValue) {
                    result[key] = entryValue[key];
                }
            }
        }

        if (data.length > 0 && !this.utils.behaviour.suppressExtraDataWarning) {
            this.utils.behaviour.logger.warn('Provided schema requires smaller data buffer than provided (' + chunk + ')');
        }

        return result;
    }

    /**
     * Decodes single object from data buffer
     * @param data Buffer for decoding
     * @param singleSchema Object's schema
     * @returns Decoded object
     */
    public decodeSingle(
        data: Buffer,
        field: SubnestField,
        offset: number = 0
    ): any {
        var readName: string = this.utils.functionReadName(field.type, field.endian, field.unsigned);
        var entryValue = (data as unknown as Record<string, Function>)[readName](offset);
        return entryValue;
    }

    public encode() {
        //
    }
}
