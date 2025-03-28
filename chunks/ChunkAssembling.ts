import ChunkDataRecoding from './ChunkDataRecoding';
import DisassembledChunk from './DisassembledChunk';
import RawChunk from './RawChunk';
import Settings from '../Settings';
import Utilities from '../Utilities';
import zlib from 'node:zlib';
import ScriptContext from '../cis/ScriptContext';

export class AssembleResult {
    public chunks: RawChunk[];
    public pseudoPointer: number;

    constructor(chunks: RawChunk[], pseudoPointer: number) {
        this.chunks = chunks;
        this.pseudoPointer = pseudoPointer;
    }
}

export default class ChunkAssembling {
    public settings: Settings;

    constructor(settings: Settings = new Settings()) {
        this.settings = settings;
    }

    /**
     * Disassembles raw chunks using subnests file
     * @param raw Source raw chunks
     * @param offset Starting offset
     * @param global Global context for executing CIS
     * @param output Output array for chunks
     * @param backtrace Way from `global` to `output`
     */
    public disassemble(
        raw: RawChunk[],
        offset: number = 0,
        global: DisassembledChunk[],
        output: DisassembledChunk[],
        globalRaw: RawChunk[] | undefined = undefined,
        backtrace: number[] = [],
        backtraceRaw: number[] = []
    ) {
        var pseudoPointer = offset;
        var recoder = new ChunkDataRecoding(new Utilities(this.settings));

        let index = 0;
        raw.forEach((chunk, rawIndex) => {
            var doc = this.settings.docs.lookup(chunk.id);
            if (!doc) {
                this.settings.logger.warn('Missing documentation for chunk', Utilities.uint32AsHex(chunk.id));
            }

            let currentBacktrace = [...backtrace, index++];
            let currentRawBacktrace = [...backtraceRaw, rawIndex];

            if (Array.isArray(chunk.data)) {
                pseudoPointer += 8;

                var subchunks: DisassembledChunk[] = [];
                output.push(new DisassembledChunk(chunk.id, subchunks));

                this.disassemble(chunk.data, pseudoPointer, global, subchunks, globalRaw || raw, currentBacktrace, currentRawBacktrace);

                pseudoPointer += chunk.length;
                return;
            }

            if (!doc) {
                output.push(
                    new DisassembledChunk(chunk.id, chunk.data)
                );

                pseudoPointer += 8 + chunk.length;
                return;
            }

            if (doc.ignore) {
                index--;
                pseudoPointer += 8 + chunk.length;
                return;
            }

            if (doc.align != null && (pseudoPointer % doc.align) != 0) {
                this.settings.logger.warn('Chunk', Utilities.uint32AsHex(chunk.id), 'is not aligned properly!');
            }

            pseudoPointer += 8;
            let data = Buffer.from(chunk.data, 'base64');

            if (chunk.compressed) {
                data = zlib.inflateSync(data);
            }

            if (doc.data_align != null) {
                var alignedPointer = Utilities.alignDataPointer(pseudoPointer, doc.data_align);

                data = data.subarray(alignedPointer - pseudoPointer);
            }

            if (data.length >= 4 && data.readUInt32LE() == 0x11111111) {
                this.settings.logger.warn('Documentation mismatch for chunk', Utilities.uint32AsHex(chunk.id), '(data align found)');
            }

            let outIndex = output.push(new DisassembledChunk(chunk.id, {})) - 1;
            let context = new ScriptContext(
                [],
                global,
                currentBacktrace,
                globalRaw || raw,
                currentRawBacktrace
            );
            try {
                let outValue = recoder.decode(data, pseudoPointer, doc.schema, chunk.id, context);

                if (typeof outValue === 'string') {
                    let outValueRaw: Record<string, string> = {};
                    outValueRaw[DisassembledChunk.RAW_VALUE] = outValue;

                    output[outIndex].data = outValueRaw;
                } else {
                    output[outIndex].data = outValue;
                }
            } catch (e) {
                this.settings.logger.critical('Cannot disassemble chunk', Utilities.uint32AsHex(chunk.id), 'due to error');
                this.settings.logger.critical(e);
                throw e;
            }

            pseudoPointer += chunk.length;
        });
    }

    /**
     * Assembles chunks using subnests file
     * @param disasm Source chunks
     * @param offset Starting offset
     * @returns Assembled raw chunks and `offset + length`
     */
    public assemble(
        disasm: DisassembledChunk[],
        offset: number = 0
    ): AssembleResult {
        var pseudoPointer = offset;
        var result = new AssembleResult([], pseudoPointer);
        var recoder = new ChunkDataRecoding(new Utilities(this.settings));

        disasm.forEach(chunk => {
            let doc = this.settings.docs.lookup(chunk.id);
            if (!doc) {
                this.settings.logger.warn('Missing documentation for chunk', Utilities.uint32AsHex(chunk.id));
            }
            else if (doc.align != null && pseudoPointer % doc.align != 0) {
                var toAlign = doc.align - (pseudoPointer % doc.align);
                if (toAlign < 8) {
                    toAlign += doc.align;
                }

                if (toAlign == 8) {
                    result.chunks.push(
                        new RawChunk(0)
                    );
                } else {
                    result.chunks.push(
                        new RawChunk(
                            0,
                            toAlign - 8,
                            false,
                            true,
                            zlib.deflateSync(Buffer.alloc(toAlign - 8)).toString('base64')
                        )
                    );
                }

                pseudoPointer += toAlign;
            }

            pseudoPointer += 8;

            if (Array.isArray(chunk.data)) {
                let assembled = this.assemble(chunk.data, pseudoPointer);

                result.chunks.push(
                    new RawChunk(
                        chunk.id,
                        assembled.pseudoPointer - pseudoPointer,
                        false,
                        undefined,
                        assembled.chunks
                    )
                );

                pseudoPointer = assembled.pseudoPointer;
                return;
            }

            let data: Buffer;
            if (DisassembledChunk.RAW_VALUE in chunk.data) {
                if (doc && doc.schema) {
                    this.settings.logger.warn('Chunk', Utilities.uint32AsHex(chunk.id), 'have schema but raw value was found');
                }

                data = Buffer.from(chunk.data[DisassembledChunk.RAW_VALUE], 'base64');
            }
            else {
                if (!doc) {
                    throw new Error('Cannot assemble chunk without schema (' + Utilities.uint32AsHex(chunk.id) + ')');
                }

                data = recoder.encode(chunk.data, pseudoPointer, doc.schema, chunk.id);
            }

            if (doc && doc.data_align != null && pseudoPointer % doc.data_align != 0) {
                var alignedPointer = Utilities.alignDataPointer(pseudoPointer, doc.data_align);
                data = Buffer.concat([Buffer.from('\x11'.repeat(alignedPointer - pseudoPointer)), data]);
            }

            let length = data.length;
            let compressed = data.length >= this.settings.compressThreshold;
            if (compressed) {
                data = zlib.deflateSync(data);
            }

            result.chunks.push(
                new RawChunk(
                    chunk.id,
                    length,
                    false,
                    compressed,
                    data.toString('base64')
                )
            );

            pseudoPointer += length;
        });

        result.pseudoPointer = pseudoPointer;
        return result;
    }
}
