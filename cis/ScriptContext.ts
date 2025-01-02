import DisassembledChunk from '../chunks/DisassembledChunk';
import RawChunk from '../chunks/RawChunk';
import Utilities from '../Utilities';

export default class ScriptContext {
    public static readonly PROPERTY_INDEX: string = "index";
    public static readonly PROPERTY_ROOT: string = "root";

    public currentChunk: DisassembledChunk[] | Record<string, any>;
    public globalStorage: DisassembledChunk[];
    public globalRawStorage: RawChunk[];
    public backtraceRaw: number[];
    public backtrace: number[];
    public extraProperties: Record<string | number, any>;
    public utils: Utilities;

    constructor(
        currentChunk: DisassembledChunk[] | Record<string, any>,
        globalStorage: DisassembledChunk[],
        backtrace: number[],
        globalRawStorage: RawChunk[],
        backtraceRaw: number[],
        extraProperties: Record<string | number, any> = {},
        utils: Utilities = new Utilities()
    ) {
        this.currentChunk = currentChunk;
        this.globalStorage = globalStorage;
        this.globalRawStorage = globalRawStorage;
        this.backtraceRaw = backtraceRaw;
        this.backtrace = backtrace;
        this.extraProperties = extraProperties;
        this.utils = utils;
    }
}
