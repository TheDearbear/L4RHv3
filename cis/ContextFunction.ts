import DisassembledChunk from '../chunks/DisassembledChunk';

export default interface ContextFunction {
    (
        current: DisassembledChunk[] | Record<string, any>,
        global: DisassembledChunk[],
        backtrace: number[],
        args: Record<string | number, any> | null
    ): any;
}
