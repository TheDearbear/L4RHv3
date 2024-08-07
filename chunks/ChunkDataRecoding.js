const L4RHUtils = require("../L4RHUtils");

const leftovers = "___leftovers__";

module.exports = Object.freeze({
    LEFTOVERS: leftovers,

    /**
     * Decodes data to disassembled format or returns source string if schema is `null`
     * @param {Buffer} data Buffer with data
     * @param {number} pseudoPointer Pointer to current position in bytes relative to the start of file
     * @param {object} schema Schema for data
     * @param {number} chunkId Id of chunk
     * @returns {object|string} Disassembled data or source string encoded with `base64` if schema is `null`
     */
    decode: function (data, pseudoPointer, schema, chunkId) {
        if (!schema) {
            return data.toString("base64");
        }

        var result = {};
        var chunk = chunkId ? L4RHUtils.getUInt32Hex(chunkId) : "unknown";

        var names = Object.getOwnPropertyNames(schema);
        for (let i = 0; i < names.length; i++) {
            let name = names[i];
            let value = schema[name];

            if (typeof value.modifier === "string" &&
                value.modifier != "array" &&
                value.modifier != "string" &&
                value.modifier != "padding"
            ) {
                console.warn("Unknown modifier passed (" + chunk + ":" + name + ")");
            }

            if (value.modifier == "string" && value.type != "int8") {
                throw new Error("String modifier can be applied only to int8");
            }

            if (value.modifier == "string" && typeof value.length !== "number" && typeof value.length !== "object") {
                throw new Error("Length of string must be specified");
            }

            if (value.modifier == "array" && typeof value.length !== "number" && typeof value.length !== "object") {
                throw new Error("Length of array must be specified");
            }

            //if (value.modifier) {
            //    throw new Error("Modifiers are not supported");
            //}

            var dataTooSmallError = "Provided schema requires bigger data buffer than provided (" + chunk + ":" + name + ")";

            var length = 1;
            if (typeof value.length === "number") {
                length = value.length;
            } else if (typeof value.length === "object") {
                var lengthOfLength = L4RHUtils.getTypeByteLength(value.length);
                if (data.length < lengthOfLength) {
                    console.error(dataTooSmallError);
                    break;
                }

                length = this.decodeSingle(data, value.length);
                data = data.subarray(lengthOfLength);
            }

            var size = value.type == "structure" ?
                L4RHUtils.getStructureByteLength(value.structure) :
                L4RHUtils.getTypeByteLength(value.type);
            
            if (data.length < size * length) {
                console.error(dataTooSmallError);
                break;
            }

            function readData(decodeFunction, data, value, offset = 0) {
                if (value.type == "structure") {
                    return decodeFunction(data.slice(offset), pseudoPointer, value.structure, null);
                } else {
                    var readName = L4RHUtils.getReadFunctionName(value.type, value.endian, value.unsigned);

                    return data[readName](offset);
                }
            }

            var entryValue;

            if (!value.length) {
                entryValue = readData(this.decode, data, value);
            } else {
                entryValue = [];
                for (let j = 0; j < length; j++) {
                    entryValue.push(readData(this.decode, data, value, j * size));
                }
            }

            if (value.type == "int8" && value.modifier == "string") {
                entryValue = L4RHUtils.readAscii(Buffer.from(entryValue));
            }

            data = data.subarray(size * length);
            if (value.modifier != "padding") {
                result[name] = entryValue;
            }
        }

        if (data.length > 0) {
            console.warn("Provided schema requires smaller data buffer than provided (" + chunk + ")");
        }

        return result;
    },

    /**
     * Decodes single object from data buffer
     * @param {Buffer} data Buffer for decoding
     * @param {object} singleSchema Object's schema
     * @returns {any} Decoded object
     */
    decodeSingle: function (data, singleSchema) {
        if (!singleSchema ||
            typeof singleSchema.type !== "string" ||
            typeof singleSchema.endian !== "string" ||
            typeof singleSchema.unsigned !== "boolean"
        ) {
            throw new Error("Invalid schema");
        }

        var readName = L4RHUtils.getReadFunctionName(singleSchema.type, singleSchema.endian, singleSchema.unsigned);
        var entryValue = data[readName]();
        return entryValue;
    },

    encode: function () {
        //
    }
});
