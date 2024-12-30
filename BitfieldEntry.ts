export default class BitfieldEntry {
    public offset: number;
    public width: number;
    public padding: boolean | undefined;

    constructor(
        offset: number,
        width: number,
        padding: boolean | undefined
    ) {
        this.offset = offset;
        this.width = width;
        this.padding = padding;
    }
}
