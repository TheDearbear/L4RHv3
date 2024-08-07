class bChunk
{
	/** @type {Buffer} */
	buffer;

	/** @type {number} */
	id;

	/** @type {number} */
	length;

	/**
     * Constructor for chunk
     * @param {Buffer} buffer Source buffer for chunk
     */
	constructor(buffer)
	{
		this.id = buffer.readUInt32LE(0);
		this.length = buffer.readUInt32LE(4);

		this.buffer = buffer.subarray(8, this.length + 8);
	}
}

module.exports = bChunk;
