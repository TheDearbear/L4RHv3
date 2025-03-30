import FieldTypes from '../FieldTypes';
import Settings from '../Settings';
import SubnestField from '../SubnestField';
import Utilities from '../Utilities';
import ContextInlineScript from '../cis/ContextInlineScript';
import ReferencedValue from '../cis/ReferencedValue';
import ScriptContext from '../cis/ScriptContext';
import DisassembledChunk from './DisassembledChunk';

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
                throw new Error('Only \"padding\" modifier allowed when using bitfield (' + chunk + ':' + name + ')');
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
                    context.extraProperties,
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

                let index = 0;
                let originalProperties = context.extraProperties;
                let extraProperties = Object.assign({}, originalProperties);

                context.extraProperties = extraProperties;
                let localContext = new ScriptContext(
                    {},
                    context.globalStorage,
                    context.backtrace,
                    context.globalRawStorage,
                    context.backtraceRaw,
                    extraProperties,
                    this.utils
                );

                while (data.length > 0) {
                    extraProperties[ScriptContext.PROPERTY_INDEX] = index++;
                    extraProperties[ScriptContext.PROPERTY_ROOT] = result;
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
                context.extraProperties = originalProperties;
            } else {
                let array = [];

                let originalProperties = context.extraProperties;
                let extraProperties = Object.assign({}, originalProperties);
                context.extraProperties = extraProperties;

                for (let j = 0; j < length; j++) {
                    let arrayValue: Record<string, any> = {};

                    extraProperties[ScriptContext.PROPERTY_INDEX] = j;
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
                context.extraProperties = originalProperties;
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
        var readName: string = this.utils.bufferIoFunctionName('read', field.type, field.endian, field.unsigned);
        var entryValue = (data as unknown as Record<string, Function>)[readName](offset);
        return entryValue;
    }

    public encode(
        data: Record<string, any>,
        pseudoPointer: number = 0,
        schema: Record<string, SubnestField> | null = null,
        chunkId: number | null = null,
        context: ScriptContext
    ): Buffer {
        var chunk = chunkId ? Utilities.uint32AsHex(chunkId) : 'unknown';

        if (DisassembledChunk.RAW_VALUE in data) {
            return Buffer.from(data[DisassembledChunk.RAW_VALUE], 'base64');
        }
        else if (schema == null) {
            throw new Error('Empty schema only allowed for raw data chunks (' + chunk + ')');
        }

        return this.encodeSingleStructure(data, schema, pseudoPointer, chunk, context);
    }

    public encodeSingleStructure(
        data: Record<string, any>,
        schema: Record<string, SubnestField>,
        pseudoPointer: number = 0,
        errorLocationPrefix: string = '',
        context: ScriptContext
    ): Buffer {
        if (errorLocationPrefix.length > 0) {
            errorLocationPrefix += ':';
        }

        var buffers = [];
        for (const name in schema) {
            let field = schema[name];
            let value: Record<string, any>[] | Record<string, any> | string | number[] | number;
            
            if (typeof field.bitfield !== 'undefined') {
                try {
                    value = this.utils.bitfieldToNumber(data, field);
                }
                catch (error) {
                    let message = error instanceof Error ? error.message : String(error);

                    throw new Error('Unable to convert bitfield to a number (' + errorLocationPrefix + name + '): ' + message);
                }
            }
            else if (name in data) {
                value = data[name];
            }
            else if (field.modifier === 'padding') {
                value = Utilities.defaultValue(field);
            }
            else {
                throw new Error('Trying to encode missing data (' + errorLocationPrefix + name + ')')
            }

            if (typeof field.align !== 'undefined') {
                let aligned = Utilities.alignDataPointer(pseudoPointer, field.align);
                if (aligned != pseudoPointer) {
                    let delta = aligned - pseudoPointer;
                    buffers.push(Buffer.alloc(delta));
                    pseudoPointer = aligned;
                }
            }

            if (field.modifier === 'jagged_array' && field.type !== FieldTypes.STRUCTURE) {
                throw new Error('Jagged array modifier can be applied only to structures (' + errorLocationPrefix + name + ')');
            }

            if (field.modifier === 'jagged_array' && typeof field.length !== 'string') {
                throw new Error('Length of structure in jagged array must be specified as CIS expression (' + errorLocationPrefix + name + ')');
            }

            let isString = field.type === FieldTypes.INT8 && field.modifier === 'string';

            if (isString) {
                if (typeof field.length !== 'string' && !Number.isInteger(field.length)) {
                    throw new Error('String length must be an integer or CIS expression (' + errorLocationPrefix + name + ')');
                }

                let length: number;
                let valueLength = (value as string).length;

                if (Number.isInteger(field.length)) {
                    length = field.length as number;
                }
                else {
                    try {
                        let result = ContextInlineScript.execute(field.length as string, context);
                        let rawLength = result instanceof ReferencedValue ? result.get<number>() : result;

                        if (typeof rawLength !== 'number') {
                            throw new Error('String length has unknown type (' + errorLocationPrefix + name + ')');
                        }

                        length = rawLength;
                    }
                    catch (error) {
                        this.utils.behaviour.logger.debug('Unable to pre-calculate size of buffer for string. Using minimal required size. (' + errorLocationPrefix + name + '): ' + (error instanceof Error ? error.message : String(error)));
                        length = valueLength + 1; // Add byte for string terminator
                    }
                }

                let stringBuffer = Buffer.alloc(length);

                if (valueLength >= length) {
                    this.utils.behaviour.logger.warn(
                        'String cannot fit into allocated buffer (' + valueLength  + ' >= ' + length + '). ' +
                        'String will be truncated by ' + (valueLength - length + 1) + ' chars. (' + errorLocationPrefix + name + ')'
                    );

                    stringBuffer.write(value as string, 'ascii');
                    stringBuffer[length - 1] = 0; // Replace last byte with string terminator
                }
                else {
                    stringBuffer.write(value as string, 'ascii');
                }

                buffers.push(stringBuffer);
                pseudoPointer += length;
            }
            else if (field.modifier === 'jagged_array') {
                if (typeof field.structure !== 'object') {
                    throw new Error('Jagged array elements do not have structure layout (' + errorLocationPrefix + name + ')');
                }

                let arrayBuffers: Buffer[] = [];
                let originalCurrent = context.currentChunk;
                let originalProperties = context.extraProperties;
                let array = value as Record<string, any>[];

                context.extraProperties = Object.assign({}, originalProperties);

                for (let i = 0; i < array.length; i++) {
                    context.currentChunk = array[i];
                    context.extraProperties[ScriptContext.PROPERTY_ROOT] = data;
                    context.extraProperties[ScriptContext.PROPERTY_INDEX] = i;
                    let result = ContextInlineScript.execute(field.length as string, context);
                    let length = result instanceof ReferencedValue ? result.get<number>() : result;

                    if (typeof length !== 'number') {
                        throw new Error('Structure length has unknowm type (' + errorLocationPrefix + name + ')');
                    }

                    if (field.align != null) {
                        let aligned = Utilities.alignDataPointer(pseudoPointer, field.align);
                        if (aligned != pseudoPointer) {
                            let delta = aligned - pseudoPointer;
                            arrayBuffers.push(Buffer.alloc(delta));
                            pseudoPointer = aligned;
                        }
                    }

                    let buffer = this.encodeSingleStructure(array[i], field.structure, pseudoPointer, errorLocationPrefix + name, context);

                    if (buffer.length != length) {
                        this.utils.behaviour.logger.error(
                            'Structure size differs from pre-calculated (' + buffer.length + ' != ' + length + '). ' +
                            'Consider checking data and subnests file (' + errorLocationPrefix + name + '[' + i + '])'
                        );
                    }

                    arrayBuffers.push(buffer);
                    pseudoPointer += buffer.length;
                }

                buffers.push(...arrayBuffers);
                context.currentChunk = originalCurrent;
                context.extraProperties = originalProperties;
            }
            else if (typeof field.length !== 'undefined') {
                let actualLength = (value as Record<string, any>[] & number[]).length;
                let length: number;

                if (typeof field.length === 'number') {
                    length = field.length;
                }
                else if (typeof field.length === 'string') {
                    try {
                        let result = ContextInlineScript.execute(field.length as string, context);
                        let rawLength = result instanceof ReferencedValue ? result.get<number>() : result;

                        if (typeof rawLength !== 'number') {
                            throw new Error('Array length has unknown type (' + errorLocationPrefix + name + ')');
                        }

                        length = rawLength;
                    }
                    catch (error) {
                        this.utils.behaviour.logger.debug('Unable to pre-calculate size of array. Using minimal required size. (' + errorLocationPrefix + name + '): ' + (error instanceof Error ? error.message : String(error)));
                        length = actualLength;
                    }
                }
                else {
                    throw new Error('Array size have invalid type (' + errorLocationPrefix + name + ')');
                }

                if (actualLength < length) {
                    this.utils.behaviour.logger.warn(
                        'Actual array size is smaller than should be (' + actualLength + ' < ' + length + '). ' +
                        'Default values will be used instead of missing elements. (' + errorLocationPrefix + name + ')'
                    );

                    let dummyField = new SubnestField(
                        field.type,
                        field.endian,
                        field.unsigned,
                        field.modifier,
                        field.structure,
                        length - actualLength,
                        field.align,
                        field.bitfield
                    );

                    (value as any[]) = (value as any[]).concat(Utilities.defaultValue(dummyField) as any[]);
                }
                else if (actualLength > length) {
                    this.utils.behaviour.logger.error(
                        'Actual array size is bigger than should be (' + actualLength + ' > ' + length + '). ' +
                        'Extra elements will not be written. Consider increasing array size if this was intentional. (' + errorLocationPrefix + name + ')'
                    );
                }

                let arrayBuffers: Buffer[] = [];
                if (field.type !== FieldTypes.STRUCTURE) {
                    let writeFunctionName = this.utils.bufferIoFunctionName('write', field.type, field.endian, field.unsigned);
                    let elementSize = this.utils.primitiveByteLength(field.type);
                    let array = value as number[];

                    for (let i = 0; i < length; i++) {
                        if (field.align != null) {
                            let aligned = Utilities.alignDataPointer(pseudoPointer, field.align);
                            if (aligned != pseudoPointer) {
                                let delta = aligned - pseudoPointer;
                                arrayBuffers.push(Buffer.alloc(delta));
                                pseudoPointer = aligned;
                            }
                        }

                        let buffer = Buffer.allocUnsafe(elementSize);
                        this.encodeSingleToInternal(array[i], writeFunctionName, buffer, 0);

                        arrayBuffers.push(buffer);
                        pseudoPointer += elementSize;
                    }
                }
                else {
                    if (typeof field.structure !== 'object') {
                        throw new Error('Field declared as structure but no layout was found (' + errorLocationPrefix + name + ')');
                    }

                    let array = value as Record<string, any>[];

                    let originalProperties = context.extraProperties;
                    context.extraProperties = Object.assign({}, originalProperties);

                    for (let i = 0; i < array.length; i++) {
                        if (field.align != null) {
                            let aligned = Utilities.alignDataPointer(pseudoPointer, field.align);
                            if (aligned != pseudoPointer) {
                                let delta = aligned - pseudoPointer;
                                arrayBuffers.push(Buffer.alloc(delta));
                                pseudoPointer = aligned;
                            }
                        }

                        context.extraProperties[ScriptContext.PROPERTY_INDEX] = i;

                        let buffer = this.encodeSingleStructure(array[i], field.structure, pseudoPointer, errorLocationPrefix + name, context);
                        arrayBuffers.push(buffer);
                        pseudoPointer += buffer.length;
                    }

                    context.extraProperties = originalProperties;
                }

                buffers.push(...arrayBuffers);
            }
            else {
                let valueBuffer: Buffer;

                if (field.type === FieldTypes.STRUCTURE) {
                    if (typeof field.structure !== 'object') {
                        throw new Error('Field declared as structure but no layout was found (' + errorLocationPrefix + name + ')');
                    }

                    valueBuffer = this.encodeSingleStructure(value as Record<string, any>, field.structure, pseudoPointer, errorLocationPrefix + name, context);
                }
                else {
                    valueBuffer = this.encodeSingle(value as number, field);
                }
                
                buffers.push(valueBuffer);
                pseudoPointer += valueBuffer.length;
            }
        }

        return Buffer.concat(buffers);
    }

    public encodeSingleTo(
        value: number,
        field: SubnestField,
        buffer: Buffer,
        offset: number = 0
    ): boolean {
        var minSize = this.utils.primitiveByteLength(field.type);
        if (buffer.length - offset < minSize) {
            return false;
        }

        var writeName = this.utils.bufferIoFunctionName('write', field.type, field.endian, field.unsigned);

        this.encodeSingleToInternal(value, writeName, buffer, offset);

        return true;
    }

    private encodeSingleToInternal(
        value: number,
        writeFunctionName: string,
        buffer: Buffer,
        offset: number
    ) {
        (buffer as unknown as Record<string, Function>)[writeFunctionName](value, offset);
    }

    public encodeSingle(
        value: number,
        field: SubnestField
    ): Buffer {
        var writeName = this.utils.bufferIoFunctionName('write', field.type, field.endian, field.unsigned);
        
        var data = Buffer.allocUnsafe(this.utils.primitiveByteLength(field.type));
        (data as unknown as Record<string, Function>)[writeName](value);

        return data;
    }
}
