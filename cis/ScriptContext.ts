import DisassembledChunk from '../chunks/DisassembledChunk';
import Utilities from '../Utilities';

export default class ScriptContext {
    public currentChunk: DisassembledChunk[] | Record<string, any>;
    public globalStorage: DisassembledChunk[];
    public backtrace: number[];
    public utils: Utilities;

    constructor(
        currentChunk: DisassembledChunk[] | Record<string, any>,
        globalStorage: DisassembledChunk[],
        backtrace: number[],
        utils: Utilities = new Utilities()
    ) {
        this.currentChunk = currentChunk;
        this.globalStorage = globalStorage;
        this.backtrace = backtrace;
        this.utils = utils;
    }
}
