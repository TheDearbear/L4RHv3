const fs = require("fs");
const path = require("path");
const Constants = require("./Constants");

module.exports = Object.freeze({
	/**
	 * Escapes hex values to dec
	 * @param {string} str 
	 * @returns {string}
	 */
	escapeHex: function (str) {
		str = str.toString();
		var exec;

		while (exec = /0x([0-9A-F]){1,}/i.exec(str)) {
			str = str.replace(exec[0], Number.parseInt(exec[0]).toString());
		}

		return str;
	},

	/**
	 * Formats text
	 * @param {string} str 
	 * @returns {string}
	 */
	formatText: function (str) {
		str = this.escapeHex(str);

		// Support for: 0_4_JDLZ = 0x4A444C5A = 1245989978
		// for (var exec, index = -1; (exec = /0_([0-9]){1,}_/i.exec(str)) && exec; index = str.indexOf(exec[0], index), str = str.replace(exec[0], "").replace(str.slice(index, index + (exec.groups[0] - 0)), /* String to hex */));

		return str;
	},

	/**
	 * Returns path to asset
	 * @param {string} assets 
	 * @param {string} asset 
	 * @returns {string}
	 */
	getAssetPath: function (assets, asset) {
		if (!fs.existsSync(assets))
			fs.mkdirSync(assets, { recursive: true });

		return path.join(assets, asset);
	},

	/**
	 * Returns number value if string is hex-like representation of uint32 (0x00000000)
	 * @param {string} string Any string
	 * @returns {number?} Value if string was hex-like
	 */
	getHexUInt32: function (string) {
		if (!string || typeof string !== "string" || string.length < 3 || string.length > 10 || !string.startsWith("0x"))
			return null;

		var value = Number.parseInt(string);
		return isNaN(value) ? null : value;
	},

	/**
	 * Returns hex-string version of given number
	 * @param {number} number 
	 * @returns {string} Hex-string
	 */
	getUInt32Hex: function (number) {
		return "0x" + number.toString(16).padStart(8, "0").toUpperCase();
	},

	/**
	 * Aligns pointer by align value
	 * @param {number} pointer Pointer for start of data
	 * @param {number} align Power of 2
	 * @param {number} offset Base offset
	 * @returns {number} Aligned pointer
	 */
	getDataAlignedPointer: function (pointer, align, offset) {
		var position = pointer + (offset || 0);
		var toAlign = align - (position & (align - 1));

		return toAlign != align ? pointer + toAlign : pointer;
	},

	/**
	 * Returns name of function for reading from buffer by schema-style names
	 * @param {string} type Schema-style type name
	 * @param {string} endian Schema-style endian name
	 * @param {boolean} unsinged Type should be interpreted as unsinged
	 * @returns {string} Name of function for reading from buffer
	 */
	getReadFunctionName: function (type, endian, unsigned) {
		if (endian == "little") {
			endian = "LE";
		} else if (endian == "big") {
			endian = "BE";
		} else {
			throw new TypeError("Unknown endian name passed to function");
		}

		if (type == "pointer") {
			type = Constants.POINTERS_ARE_64BITS ? "int64" : "int32";
		}

		var prefix = "read";
		if (type == "int64") {
			prefix += "Big";
		}

		if (unsigned) {
			prefix += "U";
		}

		if (type == "int8") {
			endian = "";
		}

		if (unsigned && (type == "float" || type == "double")) {
			throw new TypeError("Passed data type cannot be interpreted as unsigned");
		}

		switch (type) {
			case "int8":
				type = "Int8";
				break;
			case "int16":
				type = "Int16";
				break;
			case "int32":
				type = "Int32";
				break;
			case "int64":
				type = "Int64";
				break;
			case "float":
				type = "Float";
				break;
			case "double":
				type = "Double";
				break;
			default:
				throw new TypeError("Unknown type passed (" + type + ")");
		}

		return prefix + type + endian;
	},

	/**
	 * Returns number of bytes required by type for storing
	 * @param {string} type Schema-style type name
	 * @returns {number} Number of bytes required by type for storing
	 */
	getTypeByteLength: function (type) {
		if (type == "int8") {
			return 1;
		} else if (type == "int16") {
			return 2;
		} else if (type == "int32" || type == "float" || (type == "pointer" && !Constants.POINTERS_ARE_64BITS)) {
			return 4;
		} else if (type == "int64" || type == "double" || (type == "pointer" && Constants.POINTERS_ARE_64BITS)) {
			return 8;
		} else {
			throw new TypeError("Unknown type passed (" + type + ")");
		}
	},

	/**
	 * Returns number of bytes required by structure for storing
	 * @param {object} struct Schema for structure
	 * @returns {number} Number of bytes required by structure for storing
	 */
	getStructureByteLength: function (struct) {
		var names = Object.getOwnPropertyNames(struct);
		var length = 0;

		names.forEach(name => {
			var value = struct[name];
			var fieldLength;
			if (value.type == "structure") {
				fieldLength = this.getStructureByteLength(value.structure);
			} else {
				fieldLength = this.getTypeByteLength(value.type);
			}

			if (typeof value.length === "number") {
				fieldLength *= value.length;
			}

			length += fieldLength;
		});

		return length;
	},

	/**
	 * Reads ascii string from buffer
	 * @param {Buffer} buffer Source buffer
	 * @param {number} offset Start offset
	 * @returns {string} Ascii string
	 */
	readAscii: function (buffer, offset = 0) {
		var end = buffer.indexOf(0, offset);
		if (end == -1) {
			end = buffer.length;
		}

		return buffer.subarray(offset, end).toString("ascii");
	}
});
