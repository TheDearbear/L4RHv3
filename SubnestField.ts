import BitfieldEntry from "./BitfieldEntry";

export default class SubnestField {
    public type: string;
    public endian: string;
    public unsigned: Boolean;
    public modifier: string | undefined;
    public structure: Record<string, SubnestField> | undefined;
    public length: number | string | undefined;
    public align: number | undefined;
    public default_value: number | string | undefined;
    public bitfield: Record<string, BitfieldEntry> | undefined;

    constructor(
        type: string,
        endian: string,
        unsigned: Boolean = false,
        modifier: string | undefined = undefined,
        structure: Record<string, SubnestField> | undefined = undefined,
        length: number | undefined = undefined,
        align: number | undefined = undefined,
        defaultValue: number | string | undefined = undefined,
        bitfield: Record<string, BitfieldEntry> | undefined = undefined
    ) {
        this.type = type;
        this.endian = endian;
        this.unsigned = unsigned;
        this.modifier = modifier;
        this.structure = structure;
        this.length = length;
        this.align = align;
        this.default_value = defaultValue;
        this.bitfield = bitfield;
    }
}
