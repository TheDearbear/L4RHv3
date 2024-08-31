import fs from 'node:fs';
import path from 'node:path';
import CommandLineArgs from './cli/CommandLineArgs';
import DocsManager from './DocsManager';
import Settings from './Settings';
import Utilities from './Utilities';
import ChunkAssembling from './chunks/ChunkAssembling';
import ChunkRecoding from './chunks/ChunkRecoding';
import Modes from './cli/Modes';
import RawChunk from './chunks/RawChunk';
import DisassembledChunk from './chunks/DisassembledChunk';
import DefaultConsoleLogger from './logging/DefaultConsoleLogger';

const ASSETS_FOLDER = path.join(__dirname, 'assets');
const DISASSEMBLED_FILE_ENDING = '.disassm.json';

const args = CommandLineArgs.parse(process.argv.slice(2));

const settings = new Settings();
settings.logger = new DefaultConsoleLogger();

if (args.getTag('wide-pointer')) {
    settings.pointersAre64Bits = true;
}

if (args.getTag('export-paddings')) {
    settings.exportPaddings = true;
}

// Subnests path CLI argument
{
    let tag = args.getTag('subnests');

    var subnestsPath = tag?.value || path.join(ASSETS_FOLDER, 'default.subnests_v3.json');
}

var outputFile = args.getTag('output')?.value || null;

if (args.getTag('compress-threshold')) {
    settings.compressThreshold = Number.parseInt(args.getTag('compress-threshold')!.value || "");
}

var prettyPrintIndent: number | undefined;

if (args.getTag('pretty-print')) {
    let size = Number.parseInt(args.getTag('pretty-print')!.value || "");
    prettyPrintIndent = isNaN(size) ? 4 : size;
}

if (subnestsPath.startsWith(ASSETS_FOLDER) && !fs.existsSync(ASSETS_FOLDER)) {
    fs.mkdirSync(ASSETS_FOLDER);
}

const filePaths = args.extras;

if (!filePaths.length) {
    settings.logger.critical('Please specify input file!');
    process.exit();
}

if (outputFile != null && filePaths.length > 1) {
    settings.logger.critical('Output argument can be used only when one input file is specified!');
    process.exit();
}

const docs = DocsManager.parse(
    fs.readFileSync(subnestsPath).toString()
);

const mode = getMode();
switch (mode) {
    case Modes.DECODE:
        filePaths.forEach(decodeFile);
        break;
    case Modes.ENCODE:
        filePaths.forEach(encodeFile);
        break;
    case Modes.DISASSEMBLE:
        filePaths.forEach(disassembleFile);
        break;
    case Modes.ASSEMBLE:
        filePaths.forEach(assembleFile);
        break;
    case Modes.PRINT:
        settings.logger.error('This mode is currently not implemented');
        process.exit();
}

/** Returns parsed mode from start arguments */
function getMode(): symbol {
    var decodeTag = args.getTag('decode');
    var encodeTag = args.getTag('encode');
    var disassembleTag = args.getTag('disassemble');
    var assembleTag = args.getTag('assemble');
    var printTag = args.getTag('print');

    // Ignoring decodeTag to use it implicitly as default mode
    if (!encodeTag && !disassembleTag && !assembleTag && !printTag) {
        return Modes.DECODE;
    } else if (!decodeTag && encodeTag && !disassembleTag && !assembleTag && !printTag) {
        return Modes.ENCODE;
    } else if (!decodeTag && !encodeTag && disassembleTag && !assembleTag && !printTag) {
        return Modes.DISASSEMBLE;
    } else if (!decodeTag && !encodeTag && !disassembleTag && assembleTag && !printTag) {
        return Modes.ASSEMBLE;
    } else if (!decodeTag && !encodeTag && !disassembleTag && !assembleTag && printTag) {
        return Modes.PRINT;
    }

    settings.logger.critical('Two or more modes were specified!');
    process.exit(-1);
}

/**
 * Encodes json file to BlackBox bundle file
 * @param path Path to file
 */
function encodeFile(path: string) {
    settings.logger.log('Opening file:', path);

    /** @type {object[]} */
    var chunks: RawChunk[] = JSON.parse(fs.readFileSync(path).toString());

    var writePath = path.toLowerCase().endsWith('.json') ?
        path.substring(0, path.length - 5) :
        path + '.bin';

    var stream = fs.createWriteStream(outputFile ? outputFile : writePath);
    var recoder = new ChunkRecoding(settings.logger);

    chunks.forEach(chunk => {
        stream.write(recoder.encodeAsBuffer(chunk));
    });

    stream.close();
}

/**
 * Replacer function for serializing `RawChunk`s to JSON
 * @param key JSON Key
 * @param value JSON Value
 * @returns New JSON Value
 */
function rawChunkJsonReplacer(key: string, value: any): any {
    if (key == 'compressed' && value === false) {
        return undefined;
    }

    return value;
}

/**
 * Decodes BlackBox bundle file to json file
 * @param path Path to file
 */
function decodeFile(path: string) {
    settings.logger.log('Opening file:', path);

    var chunks: RawChunk[] = [];
    var recoder = new ChunkRecoding(settings.logger);

    var tryStartBufferReading = (buffer: Buffer) => {
        if (!buffer || buffer.length < 8) return Buffer.alloc(0);

        var returned = recoder.decodeMany(buffer, settings.compressThreshold);
        chunks.push(...(returned.chunks));
        return returned.leftovers.length > 0 ? returned.leftovers : Buffer.alloc(0);
    };

    var lastProcessedChunkIndex = -1;

    const OPTICAL_DRIVE_SECTOR_SIZE = 2048;

    var buffer = Buffer.alloc(0);
    var stream = fs.createReadStream(path, { highWaterMark: OPTICAL_DRIVE_SECTOR_SIZE });
    stream.on('data', (data: Buffer) => {
        buffer = buffer ? Buffer.concat([buffer, data]) : data;

        if (buffer.length >= 8) {
            buffer = tryStartBufferReading(buffer);
        }

        while (lastProcessedChunkIndex < chunks.length - 1) {
            var chunk = chunks[++lastProcessedChunkIndex];

            var doc = docs.lookup(chunk.id);

            if (!doc) {
                settings.logger.warn('Unknown chunk', Utilities.uint32AsHex(chunk.id));
            }
        }
    });

    stream.on('end', () => {
        if (args.getTag('even-broken')) {
            buffer = tryStartBufferReading(buffer);
        }

        if (buffer && buffer.length > 0) {
            settings.logger.error('Unknown data left (Size:', buffer.length, '): ' + buffer);
        }

        fs.writeFileSync(
            outputFile || path + '.json',
            JSON.stringify(chunks, rawChunkJsonReplacer, prettyPrintIndent)
        );
    });
}

/**
 * Disassembles decoded json chunks to disassembled json chunks
 * @param path Path to file
 */
function disassembleFile(path: string) {
    settings.logger.log('Opening file:', path);

    var sourceChunks: RawChunk[] = JSON.parse(fs.readFileSync(path).toString());
    var chunks: DisassembledChunk[] = [];
    new ChunkAssembling(docs, settings).disassemble(sourceChunks, 0, chunks, chunks);

    if (path.toLowerCase().endsWith('.json')) {
        path = path.substring(0, path.length - 5);
    }

    fs.writeFileSync(
        outputFile || path + DISASSEMBLED_FILE_ENDING,
        JSON.stringify(chunks, null, prettyPrintIndent)
    );
}

/**
 * Assembles disassembled json chunks to decoded json chunks
 * @param path Path to file
 */
function assembleFile(path: string) {
    settings.logger.log('Opening file:', path);

    var sourceChunks: DisassembledChunk[] = JSON.parse(fs.readFileSync(path).toString());
    var chunks = new ChunkAssembling(docs, settings).assemble(sourceChunks).chunks;

    if (path.toLowerCase().endsWith(DISASSEMBLED_FILE_ENDING)) {
        path = path.substring(0, path.length - DISASSEMBLED_FILE_ENDING.length);
    }

    fs.writeFileSync(
        outputFile || path + '.json',
        JSON.stringify(chunks, null, prettyPrintIndent)
    );
}
