
export default class ByteLengthCountResult {
    public length: number;
    public sizesUsed: number;

    constructor(length: number, sizesUsed: number) {
        this.length = length;
        this.sizesUsed = sizesUsed;
    }
}
