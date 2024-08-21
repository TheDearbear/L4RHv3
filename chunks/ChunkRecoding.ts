import bChunk from './bChunk';
import RawChunk from './RawChunk';
import Utilities from '../Utilities';
import { inflateSync, deflateSync } from 'zlib';
import Logger from '../logging/Logger';

export class DecodeResult {
    chunks: RawChunk[];
    leftovers: Buffer;

    constructor(chunks: RawChunk[], leftovers: Buffer) {
        this.chunks = chunks;
        this.leftovers = leftovers;
    }
}

export default class ChunkRecoding {
    public logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Decodes chunks from buffer and returns them with leftovers
     * @param buffer Input buffer
     * @param compressThreshold Minimum data size for compressing them
     * @returns Decoded chunks and leftovers
     */
    public decodeMany(buffer: Buffer, compressThreshold: number): DecodeResult {
        var chunks: RawChunk[] = [];

        for (var chunk: bChunk; buffer.length >= 8; buffer = buffer.subarray(chunk.length + 8)) {
            chunk = new bChunk(buffer);
            if (chunk.length > chunk.buffer.length) {
                break;
            }

            chunks.push(this.decode(chunk, compressThreshold));
        }

        return new DecodeResult(chunks, buffer);
    }

    /**
     * Converts binary chunk to raw chunk
     * @param chunk Source chunk
     * @param compressThreshold Minimum data size for compressing it
     * @returns Converted chunk in raw format
     */
    public decode(chunk: bChunk, compressThreshold: number = 0): RawChunk {
        var data = new RawChunk(
            chunk.id,
            chunk.length,
            chunk.length != chunk.buffer.length
        );

        if ((chunk.id & 0x80000000) != 0 && !data.broken && chunk.length >= 8) {
            var chunkData = this.decodeMany(chunk.buffer, compressThreshold);
            data.data = chunkData.chunks;

            if (chunkData.leftovers.length > 0) {
                this.logger.error('Cannot properly parse data of chunk', Utilities.uint32AsHex(chunk.id));
            }
        } else {
            var buffer = chunk.buffer;

            if (!data.broken && data.length >= compressThreshold) {
                buffer = deflateSync(buffer);
                data.compressed = true;
            }

            data.data = buffer.toString('base64');

            if (data.broken) {
                this.logger.error('Size mismatch of chunk', Utilities.uint32AsHex(data.id));
            }
        }

        return data;
    }

    /**
     * Encodes json chunk to binary chunk without aligning padding
     * @param chunk Source chunk
     * @returns Encoded chunk
     */
    public encode(chunk: RawChunk): Buffer {
        var header = Buffer.alloc(8);
        header.writeUInt32LE(chunk.id, 0);
        header.writeUInt32LE(chunk.length, 4);

        if (Array.isArray(chunk.data)) {
            return Buffer.concat(
                [header, ...chunk.data.map(chunk => this.encode(chunk))]
            );
        }

        var data = Buffer.from(chunk.data, 'base64');
        if (chunk.compressed) {
            data = inflateSync(data);
        }

        return Buffer.concat([header, data]);
    }
}
