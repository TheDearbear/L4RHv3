import fs from 'fs';
import path from 'path';
import CommandLineArgs from './cli/CommandLineArgs';
import DocsManager from './DocsManager';
import Settings from './Settings';
import Utilities from './Utilities';
import ChunkAssembling from './chunks/ChunkAssembling';
import ChunkRecoding from './chunks/ChunkRecoding';
import Modes from './cli/Modes';
import RawChunk from './chunks/RawChunk';
import DisassembledChunk from './chunks/DisassembledChunk';

const ASSETS_FOLDER = path.join(__dirname, 'assets');

const args = CommandLineArgs.parse(process.argv.slice(2));

const settings = new Settings();

if (args.getTag('wide-pointer')) {
	settings.pointersAre64Bits = true;
}

// Subnests path CLI argument
{
	let tag = args.getTag('subnests');

	var subnestsFilename = tag?.value || path.join(ASSETS_FOLDER, 'default.subnests_v3.json');
}

// TODO: Rework argument as user can specify several files
// and we will write them to one file. As a result only
// last file will be saved.
var outputFile = args.getTag('output')?.value || null;

if (args.getTag("compress-threshold")) {
	settings.compressThreshold = Number.parseInt(args.getTag("compress-threshold")!.value!);
}

if (subnestsFilename.startsWith(ASSETS_FOLDER) && !fs.existsSync(ASSETS_FOLDER)) {
	fs.mkdirSync(ASSETS_FOLDER);
}

const filePaths = args.extras;

if (!filePaths.length) {
	console.error('Please specify input file!');
	process.exit();
}

const docs = DocsManager.parse(
	fs.readFileSync(path.join(ASSETS_FOLDER, subnestsFilename)).toString()
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
		console.log('This mode is currently not implemented');
		process.exit();
}

/** Returns parsed mode from start arguments */
function getMode(): symbol {
	var decodeTag = args.getTag("decode");
	var encodeTag = args.getTag("encode");
	var disassembleTag = args.getTag("disassemble");
	var assembleTag = args.getTag("assemble");
	var printTag = args.getTag("print");

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

	console.error('Two or more modes were specified!');
	process.exit(-1);
}

/**
 * Encodes json file to BlackBox bundle file
 * @param path Path to file
 */
function encodeFile(path: string) {
	console.log("Opening file:", path);

	/** @type {object[]} */
	var chunks: RawChunk[] = JSON.parse(fs.readFileSync(path).toString());

	var writePath = path.toLowerCase().endsWith(".json") ?
		path.substring(0, path.length - 5) :
		path + ".bin";

	var stream = fs.createWriteStream(outputFile ? outputFile : writePath);

	chunks.forEach(chunk => {
		stream.write(ChunkRecoding.encode(chunk));
	});

	stream.close();
}

/**
 * Decodes BlackBox bundle file to json file
 * @param path Path to file
 */
function decodeFile(path: string) {
	console.log("Opening file:", path);

	var chunks: RawChunk[] = [];

	var tryStartBufferReading = (buffer: Buffer) => {
		if (!buffer || buffer.length < 8) return Buffer.alloc(0);

		var returned = ChunkRecoding.decodeMany(buffer, settings.compressThreshold);
		chunks.push(...(returned.chunks));
		return returned.leftovers.length > 0 ? returned.leftovers : Buffer.alloc(0);
	};

	var lastProcessedChunkIndex = -1;

	var buffer = Buffer.alloc(0);
	var stream = fs.createReadStream(path, { highWaterMark: 20480,  });
	stream.on("data", (data: Buffer) => {
		buffer = buffer ? Buffer.concat([buffer, data]) : data;

		if (buffer.length >= 8) {
			buffer = tryStartBufferReading(buffer);
		}

		while (lastProcessedChunkIndex < chunks.length - 1) {
			var chunk = chunks[++lastProcessedChunkIndex];

			var doc = docs.lookup(chunk.id);

			if (!doc) {
				console.warn("Unknown chunk", Utilities.uint32AsHex(chunk.id));
			}
		}
	});

	stream.on("end", () => {
		if (args.getTag("even-broken")) {
			buffer = tryStartBufferReading(buffer);
		}

		if (buffer && buffer.length > 0) {
			console.error("Unknown data left (Size:", buffer.length, "): " + buffer);
		}

		fs.writeFileSync(outputFile ? outputFile : path + ".json", JSON.stringify(chunks, null, 4));
	});
}

/**
 * Disassembles decoded json chunks to disassembled json chunks
 * @param path Path to file
 */
function disassembleFile(path: string) {
	console.log("Opening file:", path);

	var sourceChunks: RawChunk[] = JSON.parse(fs.readFileSync(path).toString());
	var chunks: DisassembledChunk[] = [];
	new ChunkAssembling(docs, settings).disassemble(sourceChunks, 0, chunks, chunks);

	if (path.toLowerCase().endsWith(".json")) {
		path = path.substring(0, path.length - 5);
	}

	fs.writeFileSync(outputFile ? outputFile : path + ".disassm.json", JSON.stringify(chunks, null, 4));
}

/**
 * Assembles disassembled json chunks to decoded json chunks
 * @param path Path to file
 */
function assembleFile(path: string) {
	console.log("Opening file:", path);

	var sourceChunks: DisassembledChunk[] = JSON.parse(fs.readFileSync(path).toString());
	var chunks = new ChunkAssembling(docs, settings).assemble(sourceChunks).chunks;

	if (path.toLowerCase().endsWith(".disassm.json")) {
		path = path.substring(0, path.length - 13);
	}

	fs.writeFileSync(outputFile ? outputFile : path + ".json", JSON.stringify(chunks, null, 4));
}
