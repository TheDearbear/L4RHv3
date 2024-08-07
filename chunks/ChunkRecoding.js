const L4RHUtils = require("../L4RHUtils");
const bChunk = require("./bChunk");
const zlib = require("zlib");

class DecodeResult {
    /** @type {object[]} */
    chunks;
    /** @type {Buffer} */
    leftovers;

    /**
     * @param {object[]} chunks 
     * @param {Buffer} leftovers 
     */
    constructor(chunks, leftovers) {
        this.chunks = chunks;
        this.leftovers = leftovers;
    }
}

module.exports = Object.freeze({
    /**
     * Decodes chunks from buffer and returns them with leftovers
     * @param {Buffer} buffer Input buffer
     * @param {number} compressThreshold Minimum data size for compressing them
     * @returns {DecodeResult} Decoded chunks and leftovers
     */
    decode: function (buffer, compressThreshold) {
        var chunks = [];

        for (var chunk; buffer.length >= 8; buffer = buffer.subarray(chunk.length + 8)) {
            chunk = new bChunk(buffer);
            if (chunk.length > chunk.buffer.length) {
                break;
            }

            chunks.push(this.decodeOne(chunk, compressThreshold));
        }

        return new DecodeResult(chunks, buffer);
    },

    /**
     * Converts binary chunk to JSON chunk
     * @param {bChunk} chunk Source chunk
     * @param {number|null} compressThreshold Minimum data size for compressing it
     * @returns {object} Converted chunk in JSON format
     */
    decodeOne: function (chunk, compressThreshold) {
        var data = {
            id: chunk.id,
            length: chunk.length,
            broken: false
        };

        if (chunk.length != chunk.buffer.length) {
            data.broken = true;
        }

        if ((chunk.id & 0x80000000) != 0 && !data.broken && chunk.length >= 8) {
            var chunkData = this.decode(chunk.buffer, compressThreshold);
            data.data = chunkData.chunks;

            if (chunkData.leftovers.length > 0) {
                console.error("Cannot properly parse data of chunk", L4RHUtils.getUInt32Hex(chunk.id));
            }
        } else {
            var buffer = chunk.buffer;

            if (!data.broken && data.length >= compressThreshold) {
                buffer = zlib.deflateSync(buffer);
                data.compressed = true;
            }

            data.data = buffer.toString("base64");

            if (data.broken) {
                console.error("Size mismatch of chunk", L4RHUtils.getUInt32Hex(data.id));
            }
        }

        return data;
    },

    /**
     * Encodes json chunk to binary chunk without paddings
     * @param {object} chunk Source chunk
     * @returns {Buffer} Encoded chunk
     */
    encode: function (chunk) {
        var header = Buffer.alloc(8);
        header.writeUInt32LE(chunk.id, 0);
        header.writeUInt32LE(chunk.length, 4);

        /** @type {Buffer} */
        var data;
        if (Array.isArray(chunk.data)) {
            var buffers = [];
            chunk.data.forEach(chunk => {
                buffers.push(this.encode(chunk));
            });

            data = Buffer.concat(buffers);
        } else {
            data = Buffer.from(chunk.data, "base64");
            if (chunk.compressed) {
                data = zlib.inflateSync(data);
            }
        }

        return Buffer.concat([header, data]);
    },

    DecodeResult: DecodeResult
});
