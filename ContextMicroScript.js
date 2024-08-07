function rfind(current, global, id, maxBacktrace) {
    var backtrace = btc(global, current);
    if (!backtrace) {
        throw new Error("Unable to backtrace current chunk!");
    }

    global = { data: global };

    var toFollow = backtrace.slice(0, maxBacktrace);
    while (toFollow.length > 0) {
        global = global.data[toFollow[0]];
    }

    //backtrace = backtrace.slice(backtrace.length - maxBacktrace);

    function findChunk(ctx, id) {
        if (Array.isArray(ctx.data)) {
            for (var i = ctx.data.length - 1; i >= 0; i--) {
                if (ctx.data[i].id == id) {
                    return ctx.data[i];
                }

                var chunk = findChunk(ctx.data[i], id);
                if (chunk) {
                    return chunk;
                }
            }
        }

        return null;
    }

    return findChunk(global, id);
}

function find(current, global, id, maxBacktrace) {
    var backtrace = btc(global, current);
    if (!backtrace) {
        throw new Error("Unable to backtrace current chunk!");
    }

    //
}

function ctx(current, global, id, maxBacktrace) {
    return current;
}

function global(current, global, id, maxBacktrace) {
    return global;
}

/**
 * Returns backtrace of `current` chunk relative to `global`
 * @param {object[]} global Global Context
 * @param {object} current Current Chunk
 * @returns {int[]|null} Backtrace if it was found, null otherwise
 */
function btc(global, current) {
    for (var i = 0; i < global.length; i++) {
        var ctx = global[i];

        if (ctx == current) {
            return [i];
        }

        if (Array.isArray(ctx.data)) {
            var backtrace = btc(ctx.data, current);
            if (backtrace) {
                return [i, ...backtrace];
            }
        }
    }

    return null;
}

module.exports = Object.freeze({
    /**
     * Executes expression and returns value if it is correct
     * @param {string} expression 
     * @param {object} currentCtx 
     * @param {object} globalCtx 
     * @returns {any|null}
     */
    execute: function (expression, currentCtx, globalCtx) {
        if (!expression || expression[0] != "$") {
            return;
        }

        var funcNames = Object.getOwnPropertyNames(this.functions);
        var invokeIndex = expression.indexOf(":");

        if (invokeIndex == -1) {
            throw new Error("Expression contains no invokation! (" + expression + ")");
        }

        expression = expression.slice(1);

        var backtraceMax = 0;
        while (expression[backtraceMax++] == "<");

        expression = expression.slice(--backtraceMax);
        invokeIndex -= 1 + backtraceMax;

        var funcName = expression.slice(0, invokeIndex);
        if (!funcNames.includes(funcName)) {
            throw new Error("Expression tries to invoke unknown function! (" + funcName + ")");
        }

        var previousAccessorIndex = expression.indexOf(".", invokeIndex + 1),
            accessorIndex,
            dataBetween = expression.slice(invokeIndex + 1, previousAccessorIndex),
            currentObject;
        
        var id = Number.parseInt(dataBetween);
        currentObject = this.functions[funcName](currentCtx, globalCtx, id, backtraceMax);
        if (!currentObject) {
            return null;
        }
        
        do {
            accessorIndex = expression.indexOf(".", previousAccessorIndex + 1);
            if (accessorIndex == -1) {
                accessorIndex = expression.length;
            }
            dataBetween = expression.slice(previousAccessorIndex + 1, accessorIndex);
            var actuallyPrevious = previousAccessorIndex;
            previousAccessorIndex = accessorIndex;

            var properties = Object.getOwnPropertyNames(currentObject);
            if (!properties.includes(dataBetween)) {
                console.log(funcName, actuallyPrevious, accessorIndex, dataBetween, currentObject, backtraceMax);
                throw new Error("Expression tried to access unknown property! (" + dataBetween + ")");
            }

            currentObject = currentObject[dataBetween];
        } while (previousAccessorIndex != expression.length);

        return currentObject;
    },

    /** Dictionary with all available functions to execute */
    functions: {
        rfind: rfind,
        find: find,
        ctx: ctx,
        global: global
    }
});
