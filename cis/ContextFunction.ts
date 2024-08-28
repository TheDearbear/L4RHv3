export default interface ContextFunction {
    (current: object, global: object[], args: Record<string | number, any> | null): any;
}
