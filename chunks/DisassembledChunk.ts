export default class DisassembledChunk {
    public static readonly RAW_VALUE = '__raw_value__';

    public id: number;
    public data: DisassembledChunk[] | Record<string, any>;

    constructor(id: number, data: DisassembledChunk[] | Record<string, any> | string) {
        this.id = id;
        
        if (typeof data === 'string') {
            this.data = {};
            this.data[DisassembledChunk.RAW_VALUE] = data;
        } else {
            this.data = data;
        }
    }
}
