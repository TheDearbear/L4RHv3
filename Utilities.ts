import FieldTypes from "./FieldTypes";
import Settings from "./Settings";
import SubnestField from "./SubnestField";

export default class Utilities {
	public behaviour: Settings;

	constructor(behaviour: Settings = new Settings()) {
		this.behaviour = behaviour;
	}

	public static hexAsUInt32(str: string): number | null {
		if (str.length < 3 || str.length > 10 || !str.startsWith("0x")) {
			return null;
		}

		var value = Number.parseInt(str);

		return isNaN(value) ? null : value;
	}

	/**
	 * Returns hex-string version of number
	 * @param number Number
	 * @returns Hex-string
	 */
	public static uint32AsHex(number: number): string {
		return "0x" + number.toString(16).padStart(8, "0").toUpperCase();
	}

	/**
	 * Aligns pointer by aligning value
	 * @param pointer Pointer for start of data
	 * @param align Power of 2
	 * @param offset Base offset
	 * @returns Aligned pointer
	 */
	public static alignDataPointer(pointer: number, align: number, offset: number = 0): number {
		var untilAligned = align - ((pointer + offset) & (align - 1));

		return untilAligned != align ? pointer + untilAligned : pointer;
	}

	/**
	 * Reads ascii string from `buffer` starting from `offset` position
	 * @param buffer Source buffer
	 * @param offset Starting offset
	 * @returns Parsed string
	 */
	public static readAscii(buffer: Buffer, offset: number = 0): string {
		var end = buffer.indexOf(0, offset);
		if (end == -1) {
			return buffer.subarray(offset).toString("ascii");
		}

		return buffer.subarray(offset, end).toString("ascii");
	}

	public typeByteLength(type: string): number {
		if (type === FieldTypes.POINTER) {
			type = this.behaviour.pointersAre64Bits ? FieldTypes.INT64 : FieldTypes.INT32;
		}

		switch (type) {
			case FieldTypes.INT8:
				return 1;
			
			case FieldTypes.INT16:
				return 2;
			
			case FieldTypes.INT32:
			case FieldTypes.FLOAT:
				return 4;
			
			case FieldTypes.INT64:
			case FieldTypes.DOUBLE:
				return 8;
			
			case FieldTypes.STRUCTURE:
				throw new TypeError("Type must be a primitive");
		}

		throw new TypeError("Unknown type was passed (" + type + ")");
	}

	public structureByteLength(struct: Record<string, SubnestField>): number {
		var totalLength = 0;

		for (const name in struct) {
			var field = struct[name];
			var length: number;

			if (field.type === FieldTypes.STRUCTURE) {
				var hasStructure = field.structure !== null;

				if (!hasStructure) {
					console.warn("Field specified as structure but no layout present (field: " + name + ")");
				}

				length = hasStructure ? this.structureByteLength(field.structure as Record<string, SubnestField>) : 0;
			} else {
				length = this.typeByteLength(field.type);
			}

			if (typeof field.length === "number") {
				length *= field.length;
			}
			else if (field.length != null) {
				throw new Error("Context dependent length is currently not supported (field: " + name + ")");
			}

			totalLength += length;
		}

		return totalLength;
	}

	public functionReadName(
		type: string,
		endian: string,
		unsigned: Boolean
	) {
		switch (endian) {
			case "little":
				endian = "LE";
				break;
			
			case "big":
				endian = "BE";
				break;
			
			default:
				throw new TypeError("Unknown endian was specified (" + endian + ")");
		}

		if (type === FieldTypes.POINTER) {
			type = this.behaviour.pointersAre64Bits ? FieldTypes.INT64 : FieldTypes.INT32;
		}

		var prefix = type === FieldTypes.INT64 ? "readBig" : "read";

		if (unsigned) {
			if (type === FieldTypes.FLOAT || type === FieldTypes.DOUBLE) {
				throw new TypeError("Passed data type cannot be interpreted as unsigned");
			}

			prefix += "U";
		}

		if (type === FieldTypes.INT8) {
			endian = "";
		}

		switch (type) {
			case FieldTypes.INT8:
				type = "Int8";
				break;

			case FieldTypes.INT16:
				type = "Int16";
				break;

			case FieldTypes.INT32:
				type = "Int32";
				break;

			case FieldTypes.INT64:
				type = "Int64";
				break;

			case FieldTypes.FLOAT:
				type = "Float";
				break;

			case FieldTypes.DOUBLE:
				type = "Double";
				break;

			default:
				throw new TypeError("Unknown type passed (" + type + ")");
		}

		return prefix + type + endian;
	}
};
