import DisassembledChunk from '../chunks/DisassembledChunk';
import RawChunk from '../chunks/RawChunk';
import Utilities from '../Utilities';

export default class ScriptContext {
    public currentChunk: DisassembledChunk[] | Record<string, any>;
    public globalStorage: DisassembledChunk[];
    public globalRawStorage: RawChunk[];
    public backtraceRaw: number[];
    public backtrace: number[];
    public utils: Utilities;

    constructor(
        currentChunk: DisassembledChunk[] | Record<string, any>,
        globalStorage: DisassembledChunk[],
        backtrace: number[],
        globalRawStorage: RawChunk[],
        backtraceRaw: number[],
        utils: Utilities = new Utilities()
    ) {
        this.currentChunk = currentChunk;
        this.globalStorage = globalStorage;
        this.globalRawStorage = globalRawStorage;
        this.backtraceRaw = backtraceRaw;
        this.backtrace = backtrace;
        this.utils = utils;
    }
}
