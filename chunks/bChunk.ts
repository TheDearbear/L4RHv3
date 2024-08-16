export default class bChunk
{
	buffer: Buffer;
	id: number;
	length: number;

	/**
     * Constructor for chunk
     * @param buffer Source buffer for chunk
     */
	constructor(buffer: Buffer)
	{
		this.id = buffer.readUInt32LE(0);
		this.length = buffer.readUInt32LE(4);

		this.buffer = buffer.subarray(8, this.length + 8);
	}
}
