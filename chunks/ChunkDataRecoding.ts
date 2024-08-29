import FieldTypes from '../FieldTypes';
import SubnestField from '../SubnestField';
import Utilities from '../Utilities';

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
     * @returns Disassembled data or source string encoded with `base64` if schema is `null`
     */
    public decode(
        data: Buffer,
        pseudoPointer: number = 0,
        schema: Record<string, SubnestField> | null = null,
        chunkId: number | null = null
    ): object | string {
        if (schema == null) {
            return data.toString('base64');
        }

        var result: Record<string, any> = {};
        var chunk = chunkId ? Utilities.uint32AsHex(chunkId) : 'unknown';

        for (const name in schema) {
            const value = schema[name];
            let rawLength = value.length;

            if (typeof value.modifier === 'string' &&
                value.modifier != 'array' &&
                value.modifier != 'string' &&
                value.modifier != 'padding'
            ) {
                throw new Error('Unknown modifier was specified (' + chunk + ':' + name + ')');
            }

            if (value.modifier == 'string' && value.type !== FieldTypes.INT8) {
                throw new Error('String modifier can be applied only to int8');
            }

            if (value.modifier == 'string' && typeof rawLength !== 'number' && typeof rawLength !== 'object') {
                throw new Error('Length of string must be specified');
            }

            if (value.modifier == 'array' && typeof rawLength !== 'number' && typeof rawLength !== 'object') {
                throw new Error('Length of array must be specified');
            }

            var dataTooSmallError = 'Provided schema requires bigger data buffer than provided (' + chunk + ':' + name + ')';

            var length = 1;

            if (typeof rawLength === 'number') {
                length = rawLength;
            }
            else if (typeof rawLength === 'object') {
                var lengthOfLength = this.utils.typeByteLength((rawLength as SubnestField).type);
                if (data.length < lengthOfLength) {
                    this.utils.behaviour.logger.error(dataTooSmallError);
                    break;
                }

                length = this.decodeSingle(data, rawLength as SubnestField);
                data = data.subarray(lengthOfLength);
            }
            else if (rawLength != null) {
                this.utils.behaviour.logger.warn('Unknown type of length property. Treating as single (' + chunk + ':' + name + ')');
            }

            var size: number;
            if (value.type === FieldTypes.STRUCTURE) {
                if (value.structure == null) {
                    throw new Error('Field specified as structure but no layout present (' + chunk + ':' + name + ')');
                }

                size = this.utils.structureByteLength(value.structure);
            } else {
                size = this.utils.typeByteLength(value.type);
            }
            
            if (data.length < size * length) {
                this.utils.behaviour.logger.error(dataTooSmallError);
                break;
            }

            function readData(
                ctx: ChunkDataRecoding,
                data: Buffer,
                value: SubnestField,
                size: number,
                offset: number = 0
            ): any {
                if (value.type === FieldTypes.STRUCTURE) {
                    return ctx.decode(data.subarray(offset, offset + size), pseudoPointer, value.structure, chunkId);
                }
                
                return ctx.decodeSingle(data, value, offset);
            }

            var entryValue: any[] | any;

            if (rawLength == null) {
                entryValue = readData(this, data, value, size * length);
            } else {
                entryValue = [];
                for (let j = 0; j < length; j++) {
                    entryValue.push(readData(this, data, value, size, j * size));
                }
            }

            if (value.type === FieldTypes.INT8 && value.modifier === 'string') {
                entryValue = Utilities.readAscii(Buffer.from(entryValue));
            }

            data = data.subarray(size * length);
            if (value.modifier !== 'padding' || this.utils.behaviour.exportPaddings) {
                result[name] = entryValue;
            }
        }

        if (data.length > 0) {
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
