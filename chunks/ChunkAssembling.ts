import ContextInlineScript from "../ContextInlineScript";
import ChunkDataRecoding from "./ChunkDataRecoding";
import DocsManager from "../DocsManager";
import DisassembledChunk from "./DisassembledChunk";
import RawChunk from "./RawChunk";
import Settings from "../Settings";
import Utilities from "../Utilities";
import zlib from "zlib";

export class AssembleResult {
    public chunks: RawChunk[];
    public pseudoPointer: number;

    constructor(chunks: RawChunk[], pseudoPointer: number) {
        this.chunks = chunks;
        this.pseudoPointer = pseudoPointer;
    }
}

export default class ChunkAssembling {
    public docs: DocsManager;
    public settings: Settings;

    constructor(docs: DocsManager, settings: Settings = new Settings()) {
        this.docs = docs;
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
        backtrace: number[] = []
    ) {
        var pseudoPointer = offset;
        var recoder = new ChunkDataRecoding(new Utilities(this.settings));

        raw.forEach((chunk, index) => {
            var doc = this.docs.lookup(chunk.id);
            if (!doc) {
                console.warn("Missing documentation for chunk", Utilities.uint32AsHex(chunk.id));
            }

            if (Array.isArray(chunk.data)) {
                pseudoPointer += 8;

                var subchunks: DisassembledChunk[] = [];
                output.push(new DisassembledChunk(chunk.id, subchunks));

                this.disassemble(chunk.data, pseudoPointer, global, subchunks, [...backtrace, index]);

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
                pseudoPointer += 8 + chunk.length;
                return;
            }

            if (doc.align != null && (pseudoPointer % doc.align) != 0) {
                console.warn("Chunk", Utilities.uint32AsHex(chunk.id), "is not aligned properly!");
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
                console.warn("Documentation mismatch for chunk", Utilities.uint32AsHex(chunk.id), "(data align found)");
            }

            output.push(
                new DisassembledChunk(
                    chunk.id,
                    recoder.decode(data, pseudoPointer, doc.schema, chunk.id)
                )
            );

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

        disasm.forEach((chunk, index) => {
            let doc = this.docs.lookup(chunk.id);
            if (!doc) {
                console.warn("Missing documentation for chunk", Utilities.uint32AsHex(chunk.id));
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
                            zlib.deflateSync(Buffer.alloc(toAlign - 8)).toString("base64")
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

            if (DisassembledChunk.RAW_VALUE in chunk.data === false) {
                throw new Error("Assembling is not yet implemented");
            }

            let data = Buffer.from(chunk.data[DisassembledChunk.RAW_VALUE], "base64");

            if (doc && doc.data_align != null && pseudoPointer % doc.data_align != 0) {
                var alignedPointer = Utilities.alignDataPointer(pseudoPointer, doc.data_align);
                data = Buffer.concat([Buffer.from('\x11'.repeat(alignedPointer - pseudoPointer)), data]);
            }

            let length = data.length;
            let compressed = data.length >= this.settings.compressThreshold;
            if (compressed) {
                data = zlib.inflateSync(data);
            }

            result.chunks.push(
                new RawChunk(
                    chunk.id,
                    length,
                    false,
                    compressed,
                    data.toString("base64")
                )
            );

            pseudoPointer += length;
        });

        result.pseudoPointer = pseudoPointer;
        return result;
    }
}