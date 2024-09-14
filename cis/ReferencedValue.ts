export default class ReferencedValue {
    private obj: Record<string | number, any> | any[];
    private accessors: (string | number)[] | null;

    constructor(obj: Record<string | number, any>, accessors: (string | number)[] | null) {
        this.obj = obj;
        this.accessors = accessors;
    }

    public type(): string {
        return typeof this.get<any>();
    }

    public get<T>(): T {
        if (this.accessors == null) {
            return this.obj as T;
        }

        var obj: any = this.obj;
        this.accessors.forEach((v, i, a) => {
            let value = obj[v];

            if (value == null && i < a.length - 1) {
                throw new Error('Null reference error at index ' + i + '. Object accessors list: ' + a);
            }

            if (typeof v === 'number' && !Array.isArray(obj)) {
                throw new Error('Invalid type of accessor specified');
            }

            if (v in obj === false) {
                throw new Error('Unknown property accessed: ' + v);
            }

            obj = value;
        });

        return obj;
    }

    public set<T>(value: T) {
        if (this.accessors == null || this.accessors.length === 0) {
            if (typeof this.obj !== 'object') {
                throw new Error('Cannot set new value by current reference');
            }

            if (typeof value !== 'object' || value == null) {
                throw new Error('Cannot set value of given type for this reference');
            }

            this.replaceInsidesWith(value);

            return;
        }

        function isReferenceType(value: any) {
            return typeof value === 'function' || typeof value === 'object';
        }

        var accessors = this.accessors.slice(0);
        var obj = this.obj;
        while (isReferenceType(obj) && accessors.length > 1) {
            let accessor = accessors.shift()!!;

            obj = (obj as Record<string | number, any>)[accessor];
        }

        if (accessors.length > 1) {
            throw new Error('Cannot set value as some objects in chain are not reference values');
        }

        (obj as Record<string | number, any>)[accessors[0]] = value;
    }

    private replaceInsidesWith(value: Record<string, any> | any[]) {
        var dstArray = Array.isArray(this.obj);
        var srcArray = Array.isArray(value);

        if (dstArray && srcArray) {
            let srcArr = value as any[];

            while (this.obj.length > 0) {
                this.obj.pop();
            }

            srcArr.forEach(v => {
                this.obj.push(v);
            });
        }
        else if (!dstArray && !srcArray) {
            for (const name in this.obj) {
                delete this.obj[name];
            }

            for (const name in value as object) {
                (this.obj as Record<string, any>)[name] = (value as Record<string, any>)[name];
            }
        }
        else {
            throw new Error('Cannot replace object with array and vice versa');
        }
    }
}
