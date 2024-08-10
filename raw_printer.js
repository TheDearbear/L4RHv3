const fs = require("fs");
const path = require("path");
const CommandLineArgs = require("./cli/CommandLineArgs");
const DocsManager = require("./DocsManager");
const Constants = require("./Constants");
const L4RHUtils = require("./L4RHUtils");
const ChunkAssembling = require("./chunks/ChunkAssembling");
const ChunkRecoding = require("./chunks/ChunkRecoding");
const Modes = require("./Modes");

const ASSETS_FOLDER = path.join(__dirname, "assets");

const args = CommandLineArgs.parse(process.argv.slice(2));

if (args.getTag("wide-pointer")) {
	Constants.POINTERS_ARE_64BITS = true;
}

var subnestsFilename = "default.subnests_v3.json";
if (args.getTag("subnests")) {
	subnestsFilename = args.getTag("subnests").value;
}

var outputFile = null;
if (args.getTag("output")) {
	outputFile = args.getTag("output").value;
}

if (!fs.existsSync(ASSETS_FOLDER)) {
	fs.mkdirSync(ASSETS_FOLDER);
}

const docs = DocsManager.from(path.join(ASSETS_FOLDER, subnestsFilename));

if (!args.extras.length) {
	console.error("Please specify input file!");
	return;
}

const filePaths = args.extras;

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
		console.log("This mode is currently not implemented");
		return;
}

/**
 * Returns parsed mode from start arguments
 * @returns {symbol}
 */
function getMode() {
	var decodeTag = args.getTag("decode");
	var encodeTag = args.getTag("encode");
	var disassembleTag = args.getTag("disassemble");
	var assembleTag = args.getTag("assemble");
	var printTag = args.getTag("print");

	if (!encodeTag && !disassembleTag && !assembleTag && !printTag) { // Ignoring decodeTag to use it as default mode
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

	console.error("Two or more modes were specified!");
	process.exit(-1);
}

/**
 * Encodes json file to BlackBox bundle file
 * @param {string} path Path to file
 */
function encodeFile(path) {
	console.log("Opening file:", path);

	/** @type {object[]} */
	var chunks = JSON.parse(fs.readFileSync(path));

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
 * @param {string} path Path to file
 */
function decodeFile(path) {
	console.log("Opening file:", path);

	var chunks = [];
	var ctTag = args.getTag("compress-threshold");
	var compressThreshold = ctTag && !isNaN(+ctTag.value) ? +ctTag.value : 150;

	/**
	 * @param {Buffer} buffer 
	 */
	var tryStartBufferReading = buffer => {
		if (!buffer || buffer.length < 8) return null;

		var returned = ChunkRecoding.decode(buffer, compressThreshold);
		chunks.push(...(returned.chunks));
		return returned.leftovers.length > 0 ? returned.leftovers : null;
	};

	var lastProcessedChunkIndex = -1;

	var buffer = Buffer.alloc(0);
	var stream = fs.createReadStream(path, { highWaterMark: 20480 });
	stream.on("data", data => {
		buffer = buffer ? Buffer.concat([buffer, data]) : data;

		if (buffer.length >= 8) {
			buffer = tryStartBufferReading(buffer);
		}

		while (lastProcessedChunkIndex < chunks.length - 1) {
			var chunk = chunks[++lastProcessedChunkIndex];

			var doc = docs.lookup(chunk.id);

			if (!doc) {
				console.warn("Unknown chunk", L4RHUtils.getUInt32Hex(chunk.id));
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
 * @param {string} path Path to file
 */
function disassembleFile(path) {
	console.log("Opening file:", path);

	var sourceChunks = JSON.parse(fs.readFileSync(path));
	var chunks = [];
	ChunkAssembling.disassemble(sourceChunks, docs, 0, chunks, chunks);

	if (path.toLowerCase().endsWith(".json")) {
		path = path.substring(0, path.length - 5);
	}

	fs.writeFileSync(outputFile ? outputFile : path + ".disassm.json", JSON.stringify(chunks, null, 4));
}

/**
 * Assembles disassembled json chunks to decoded json chunks
 * @param {string} path Path to file
 */
function assembleFile(path) {
	console.log("Opening file:", path);

	var ctTag = args.getTag("compress-threshold");
	var compressThreshold = ctTag && !isNaN(+ctTag.value) ? +ctTag.value : 150;

	var sourceChunks = JSON.parse(fs.readFileSync(path));
	var chunks = ChunkAssembling.assemble(sourceChunks, docs, compressThreshold)[0];

	if (path.toLowerCase().endsWith(".disassm.json")) {
		path = path.substring(0, path.length - 13);
	}

	fs.writeFileSync(outputFile ? outputFile : path + ".json", JSON.stringify(chunks, null, 4));
}
