import ByteLengthCountResult from './ByteLengthCountResult';
import FieldTypes from './FieldTypes';
import Settings from './Settings';
import SubnestField from './SubnestField';

export default class Utilities {
    public behaviour: Settings;

    constructor(behaviour: Settings = new Settings()) {
        this.behaviour = behaviour;
    }

    public static hexAsUInt32(str: string): number | null {
        if (str.length < 3 || str.length > 10 || !str.startsWith('0x')) {
            return null;
        }

        var value = Number.parseInt(str);

        return isNaN(value) ? null : value;
    }

    /**
     * Returns hex-string version of number
     * @param number Number
     * @returns Hex-string
     */
    public static uint32AsHex(number: number): string {
        return '0x' + number.toString(16).padStart(8, '0').toUpperCase();
    }

    /**
     * Aligns pointer by aligning value
     * @param pointer Pointer for start of data
     * @param align Power of 2
     * @param offset Base offset
     * @returns Aligned pointer
     */
    public static alignDataPointer(pointer: number, align: number, offset: number = 0): number {
        var untilAligned = align - ((pointer + offset) & (align - 1));

        return untilAligned != align ? pointer + untilAligned : pointer;
    }

    /**
     * Reads ascii string from `buffer` starting from `offset` position
     * @param buffer Source buffer
     * @param offset Starting offset
     * @returns Parsed string
     */
    public static readAscii(buffer: Buffer, offset: number = 0): string {
        var end = buffer.indexOf(0, offset);
        if (end == -1) {
            return buffer.subarray(offset).toString('ascii');
        }

        return buffer.subarray(offset, end).toString('ascii');
    }

    /**
     * Returns size of primitive data types in bytes
     * @param type Data type
     * @returns Size of data type in bytes
     */
    public primitiveByteLength(type: string): number {
        if (type === FieldTypes.POINTER) {
            type = this.behaviour.pointersAre64Bits ? FieldTypes.INT64 : FieldTypes.INT32;
        }

        switch (type) {
            case FieldTypes.INT8:
                return 1;
            
            case FieldTypes.INT16:
                return 2;
            
            case FieldTypes.INT32:
            case FieldTypes.FLOAT:
                return 4;
            
            case FieldTypes.INT64:
            case FieldTypes.DOUBLE:
                return 8;
            
            case FieldTypes.STRUCTURE:
                throw new TypeError('Type must be a primitive');
        }

        throw new TypeError('Unknown type was passed (' + type + ')');
    }

    public structureByteLength(struct: Record<string, SubnestField>, ...sizes: number[]): number {
        var countResult = this.internalStructureByteLength(struct, ...sizes);

        if (countResult.sizesUsed != sizes.length) {
            this.behaviour.logger.warn('Number of sizes differs from number of sizes used by structure');
        }

        return countResult.length;
    }

    private internalStructureByteLength(struct: Record<string, SubnestField>, ...sizes: number[]): ByteLengthCountResult {
        var totalLength = 0;
        var sizeIndex = 0;

        for (const name in struct) {
            var field = struct[name];
            var length: number = 0;

            if (field.type === FieldTypes.STRUCTURE) {
                let hasStructure = field.structure != null;

                if (!hasStructure) {
                    this.behaviour.logger.warn('Field specified as structure but no layout present (field: ' + name + ')');
                } else {
                    let countResult = this.internalStructureByteLength(field.structure as Record<string, SubnestField>, ...sizes);
                    sizeIndex += countResult.sizesUsed;
                    length = countResult.length;
                }
            } else {
                length = this.primitiveByteLength(field.type);
            }

            if (typeof field.length === 'number') {
                length *= field.length;
            }
            else if (field.length != null) {
                let fieldLength = sizes[sizeIndex++];

                if (fieldLength == null) {
                    throw new Error('Not enough context values to determine size of struct (field: ' + name + ')');
                }

                length *= fieldLength;
            }

            totalLength += length;
        }

        return new ByteLengthCountResult(totalLength, sizeIndex);
    }

    public bufferIoFunctionName(
        basePrefix: string,
        type: string,
        endian: string,
        unsigned: Boolean
    ) {
        switch (endian) {
            case 'little':
                endian = 'LE';
                break;
            
            case 'big':
                endian = 'BE';
                break;
            
            default:
                throw new TypeError('Unknown endian was specified (' + endian + ')');
        }

        if (type === FieldTypes.POINTER) {
            type = this.behaviour.pointersAre64Bits ? FieldTypes.INT64 : FieldTypes.INT32;
        }

        var prefix = basePrefix;
        if (type == FieldTypes.INT64) {
            prefix += 'Big';
        }

        if (unsigned) {
            if (type === FieldTypes.FLOAT || type === FieldTypes.DOUBLE) {
                throw new TypeError('Passed data type cannot be interpreted as unsigned');
            }

            prefix += 'U';
        }

        if (type === FieldTypes.INT8) {
            endian = '';
        }

        switch (type) {
            case FieldTypes.INT8:
                type = 'Int8';
                break;

            case FieldTypes.INT16:
                type = 'Int16';
                break;

            case FieldTypes.INT32:
                type = 'Int32';
                break;

            case FieldTypes.INT64:
                type = 'Int64';
                break;

            case FieldTypes.FLOAT:
                type = 'Float';
                break;

            case FieldTypes.DOUBLE:
                type = 'Double';
                break;

            default:
                throw new TypeError('Unknown type passed (' + type + ')');
        }

        return prefix + type + endian;
    }

    public bitfieldToNumber(disassm: Record<string, any>, field: SubnestField): number {
        if (typeof field.bitfield !== 'object') {
            throw new Error('Field must be bitfield');
        }

        if (field.length != null) {
            throw new Error('Bitfield cannot be used in array');
        }

        if (field.modifier != null && field.modifier != "padding") {
            throw new Error('Only \"padding\" modifier allowed when using bitfield');
        }

        if (!field.unsigned) {
            throw new Error('Bitfield can be applied only to unsigned integer field');
        }

        if (field.type != FieldTypes.INT8 &&
            field.type != FieldTypes.INT16 &&
            field.type != FieldTypes.INT32 &&
            field.type != FieldTypes.INT64
        ) {
            throw new Error('Bitfield can be applied only to integer field');
        }

        let value = 0;
        let bitfieldSize = this.primitiveByteLength(field.type) * 8;

        for (const bitfieldName in field.bitfield) {
            let bitfield = field.bitfield[bitfieldName];

            if (!Number.isInteger(bitfield.offset) || bitfield.offset < 0) {
                throw new Error('Offset of bitfield\'s entry must be integer and must not be negative (' + bitfieldName + ')');
            }

            if (!Number.isInteger(bitfield.width) || bitfield.width < 1) {
                throw new Error('Width of bitfield\'s entry must be positive integer (' + bitfieldName + ')');
            }

            if (bitfield.offset + bitfield.width > bitfieldSize) {
                throw new Error('Entry of bitfield must be located inside bounds of parent type (' + bitfieldName + ')');
            }

            if (bitfieldName in disassm) {
                let entryValue = disassm[bitfieldName];
                if (typeof entryValue !== 'number') {
                    throw new Error('Value of bitfield\'s entry can be only numeric (' + bitfieldName + ')');
                }
                
                let maxValue = (1 << bitfield.width) - 1;
                if (entryValue > maxValue) {
                    let truncated = entryValue & maxValue; // Max value also can be used as mask to truncate bits
                    this.behaviour.logger.warn(
                        'Value of entry in bitfield is bigger than maximum possible (' + entryValue + ' > ' + maxValue + '). ' +
                        'Value will be truncated to ' + truncated + '. (' + bitfieldName + ')'
                    );

                    entryValue = truncated;
                }

                let valueMask = ((1 << bitfieldSize) - 1) ^ (maxValue << bitfield.offset);
                value = ((value as number) & valueMask) + (entryValue << bitfield.offset);
            }
            else if (!bitfield.padding && field.modifier !== 'padding') {
                this.behaviour.logger.warn('Cannot find value of entry in bitfield (' + bitfieldName + ')');
            }
        }

        return value;
    }

    public static replaceRange(str: string, start: number, end: number, substitute: string) {
        return str.substring(0, start) + substitute + str.substring(end);
    }

    /**
     * Creates minimal object that matches provided field layout
     * @param field Subnest field layout
     * @returns Minimally initialized object that matches field layout
     */
    public static defaultValue(field: SubnestField): Record<string, any>[] | Record<string, any> | string | number[] | number {
        var result: Record<string, any> | string | number;
        var isString = field.type == FieldTypes.INT8 && field.modifier == 'string';
        
        if (field.type != FieldTypes.STRUCTURE) {
            if (field.type != FieldTypes.INT8 && field.modifier == 'string') {
                throw new Error('Cannot use string modifier without int8 type');
            }

            result = field.modifier == 'string' ? "" : 0;
        }
        else {
            if (field.structure == null) {
                throw new Error('Field is declared as structure but layout is not present');
            }

            result = {};

            for (const name in field.structure) {
                result[name] = this.defaultValue(field.structure[name]);
            }
        }

        if (typeof field.length === 'undefined' || isString) {
            return result;
        }

        var array: Record<string, any>[] | number[] = [];

        if (typeof field.length === 'number') {
            for (let i = 0; i < field.length; i++) {
                array.push(result as (Record<string, any> & number));
            }
        }
        else {
            throw new Error('Using array size as Context Inline Script is currently not supported');
        }

        return array;
    }
};
