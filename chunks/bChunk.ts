export default class bChunk
{
    buffer: Buffer;
    id: number;
    size: number;

    /**
     * Constructor for chunk
     * @param buffer Source buffer for chunk
     */
    constructor(buffer: Buffer)
    {
        this.id = buffer.readUInt32LE(0);
        this.size = buffer.readUInt32LE(4);

        this.buffer = buffer.subarray(8, this.size + 8);
    }
}
