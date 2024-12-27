export default class SubnestField {
    public type: string;
    public endian: string;
    public unsigned: Boolean;
    public modifier: string | undefined;
    public structure: Record<string, SubnestField> | undefined;
    public length: number | string | SubnestField | undefined;
    public align: number | undefined;

    constructor(
        type: string,
        endian: string,
        unsigned: Boolean = false,
        modifier: string | undefined = undefined,
        structure: Record<string, SubnestField> | undefined = undefined,
        length: number | SubnestField | undefined = undefined,
        align: number | undefined = undefined
    ) {
        this.type = type;
        this.endian = endian;
        this.unsigned = unsigned;
        this.modifier = modifier;
        this.structure = structure;
        this.length = length;
        this.align = align;
    }
}
