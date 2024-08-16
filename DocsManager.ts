import SubnestField from "./SubnestField";
import Utilities from "./Utilities";

export class Subnest {
    public description_entry: string;
    public ignore: Boolean;
    public align: number | undefined;
    public data_align: number | undefined;
    public schema: Record<string, SubnestField>;

    constructor(
        description: string = "",
        ignore: Boolean = false,
        align: number | undefined = undefined,
        dataAlign: number | undefined = undefined,
        schema: Record<string, SubnestField> = {}
    ) {
        this.description_entry = description;
        this.ignore = ignore;
        this.align = align;
        this.data_align = dataAlign;
        this.schema = schema;
    }
}

export default class DocsManager {
    public header: Record<string, any>;
    public table: Record<string, Subnest>;

    constructor() {
        this.header = {};
        this.table = {};
    }

    /**
     * Returns json entry for chunk
     * @param {number} id 
     */
    lookup(id: number) {
        if (id < 0) id = Math.abs(id) + 0x80000000;

        return this.table[Utilities.uint32AsHex(id)];
    }

    /**
     * Returns header's value by name
     * @param {string} name Name of header
     * @returns Value of header
     */
    getHeader(name: string) {
        return this.header[name];
    }

    public static parse(json: string): DocsManager {
        var docs = new DocsManager();
        var data = JSON.parse(json) as Record<string, any>;

        docs.header = data.header as Record<string, any>;
        docs.table = data.subnests as Record<string, Subnest>;
    
        return docs;
    };
}
