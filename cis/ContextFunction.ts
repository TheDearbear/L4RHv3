import ScriptContext from './ScriptContext';

export default interface ContextFunction {
    (
        context: ScriptContext,
        args: Record<string | number, any> | null
    ): any;
}
