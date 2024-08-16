export default class RawChunk {
    public id: number;
    public length: number;
    public broken: Boolean;
    public compressed: Boolean;
    public data: string | RawChunk[];

    constructor(
        id: number,
        length: number = 0,
        broken: Boolean = false,
        compressed: Boolean = false,
        data: string | RawChunk[] = ""
    ) {
        this.id = id;
        this.length = length;
        this.broken = broken;;
        this.compressed = compressed;
        this.data = data;
    }
}
