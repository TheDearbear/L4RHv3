import DisassembledChunk from '../chunks/DisassembledChunk';

export default class ScriptContext {
    public currentChunk: DisassembledChunk[] | Record<string, any>;
    public globalStorage: DisassembledChunk[];
    public backtrace: number[];

    constructor(
        currentChunk: DisassembledChunk[] | Record<string, any>,
        globalStorage: DisassembledChunk[],
        backtrace: number[]
    ) {
        this.currentChunk = currentChunk;
        this.globalStorage = globalStorage;
        this.backtrace = backtrace;
    }
}
