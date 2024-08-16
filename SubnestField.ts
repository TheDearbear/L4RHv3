export default class SubnestField {
    public type: string;
    public endian: string;
    public unsigned: Boolean;
    public modifier: string | null;
    public structure: Record<string, SubnestField> | null;
    public length: number | SubnestField | null;

    constructor(
        type: string,
        endian: string,
        unsigned: Boolean = false,
        modifier: string | null = null,
        structure: Record<string, SubnestField> | null = null,
        length: number | SubnestField | null = null
    ) {
        this.type = type;
        this.endian = endian;
        this.unsigned = unsigned;
        this.modifier = modifier;
        this.structure = structure;
        this.length = length;
    }
}
