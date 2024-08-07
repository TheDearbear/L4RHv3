const ContextMicroScript = require("../ContextMicroScript");
const ChunkDataRecoding = require("./ChunkDataRecoding");
const DocsManager = require("../DocsManager");
const L4RHUtils = require("../L4RHUtils");
const zlib = require("zlib");

module.exports = Object.freeze({
    /**
     * Disassembles JSON chunks using subnests file
     * @param {object[]} json Source JSON chunks
     * @param {DocsManager} docs Documentation
     * @param {number} offset Starting offset
     * @returns {object[]} Disassembled JSON chunks
     */
    disassemble: function (json, docs, offset, global, pushCtx) {
        var chunks = [];
        var pseudoPointer = offset ? offset : 0;

        for (let i = 0; i < json.length; i++) {
            let chunk = json[i];

            var disasm = {
                id: chunk.id,
                data: chunk.data
            };

            var doc = docs.lookup(disasm.id);
            if (!doc) {
                //console.warn("Missing documentation for chunk", L4RHUtils.getUInt32Hex(disasm.id));
            }

            if (doc && doc.ignore) {
                pseudoPointer += 8;
                pseudoPointer += chunk.length;
                continue;
            }

            if (doc && doc.align && (pseudoPointer % doc.align) != 0) {
                console.warn("Chunk", L4RHUtils.getUInt32Hex(disasm.id), "is not aligned properly!");
            }

            pseudoPointer += 8;
            var data = chunk.data;

            if (Array.isArray(chunk.data)) {
                data = [];
                this.disassemble(chunk.data, docs, pseudoPointer, global, data);
            } else if (chunk.compressed || (doc && doc.data_align)) {
                data = Buffer.from(chunk.data, "base64");
                if (chunk.compressed) {
                    data = zlib.inflateSync(data);
                }

                if (doc && doc.data_align) {
                    var alignedPointer = L4RHUtils.getDataAlignedPointer(pseudoPointer, doc.data_align);

                    data = data.subarray(alignedPointer - pseudoPointer);
                }

                if (data.length >= 4 && data.readUInt32LE() == 0x11111111) {
                    console.warn("Documentation mismatch for chunk", L4RHUtils.getUInt32Hex(disasm.id), "(data align found)");
                }
            }

            disasm.data = Array.isArray(data) ? data : ChunkDataRecoding.decode(
                typeof data === "string" ? Buffer.from(data, "base64") : data,
                pseudoPointer,
                doc ? doc.schema : null,
                disasm.id);
            
            if (doc && doc.csm) {
                console.log(ContextMicroScript.execute(doc.csm, disasm.data, global));
            }

            pseudoPointer += chunk.length;

            pushCtx.push(disasm);//chunks.push(disasm);
        }

        return chunks;
    },

    /**
     * Assembles JSON chunks using subnests file
     * @param {object[]} json Source JSON chunks
     * @param {DocsManager} docs Documentation
     * @param {number} compressThreshold Minimum data size for compressing it
     * @param {number?} offset Starting offset
     * @returns {[object[], number]} Assembled JSON chunks and total length
     */
    assemble: function (json, docs, compressThreshold, offset) {
        var chunks = [];
        var pseudoPointer = offset ? offset : 0;

        for (let i = 0; i < json.length; i++) {
            let chunk = json[i];

            var doc = docs.lookup(chunk.id);
            var asm = {
                id: chunk.id,
                broken: false
            }

            if (!doc) {
                console.warn("Missing documentation for chunk", L4RHUtils.getUInt32Hex(asm.id));
            }

            if (doc && doc.align && pseudoPointer % doc.align != 0) {
                var toAlign = doc.align - (pseudoPointer % doc.align);
                if (toAlign < 8) {
                    toAlign += doc.align;
                }

                chunks.push({
                    id: 0,
                    length: toAlign - 8,
                    broken: false,
                    compressed: toAlign != 8,
                    data: toAlign == 8 ? "" : zlib.deflateSync(Buffer.alloc(toAlign - 8)).toString("base64")
                });

                pseudoPointer += toAlign;
            }

            pseudoPointer += 8;

            if (Array.isArray(chunk.data)) {
                var assembled = this.assemble(chunk.data, docs, compressThreshold, pseudoPointer);
                asm.length = assembled[1] - pseudoPointer;
                asm.data = assembled[0];
            } else {
                var data = Buffer.from(chunk.data, "base64");

                if (doc && doc.data_align && pseudoPointer % doc.data_align != 0) {
                    var alignedPointer = L4RHUtils.getDataAlignedPointer(pseudoPointer, doc.data_align);
                    data = Buffer.concat([Buffer.from('\x11'.repeat(alignedPointer - pseudoPointer)), data]);

                    if (chunk.id == 0x134011) {
                        console.log(alignedPointer, pseudoPointer, alignedPointer - pseudoPointer, doc.data_align);
                    }
                }

                asm.length = data.length;
                if (data.length >= compressThreshold) {
                    data = zlib.deflateSync(data);
                    asm.compressed = true;
                }

                asm.data = data.toString("base64");
            }

            pseudoPointer += asm.length;

            chunks.push(asm);
        }

        return [chunks, pseudoPointer];
    }
});
