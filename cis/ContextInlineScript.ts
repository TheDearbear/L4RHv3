import Utilities from '../Utilities';
import ContextFunction from './ContextFunction';
import ReferencedValue from './ReferencedValue';
import ScriptContext from './ScriptContext';
import * as CISFunctions from './functions';

class SeekingResult<T> {
    public result: T;
    public seeked: number;

    constructor(result: T, seeked: number) {
        this.result = result;
        this.seeked = seeked;
    }
}

export default class ContextInlineScript {
    public static readonly FUNCTIONS: Record<string, ContextFunction> = {
        rfind: CISFunctions.rfind,
        find: CISFunctions.find,
        current: CISFunctions.current,
        global: CISFunctions.global,
        rawsize: CISFunctions.rawsize,
        newobject: CISFunctions.newobject,
        strjoin: CISFunctions.strjoin,
        math: CISFunctions.math,
        index: CISFunctions.index,
        root: CISFunctions.root
    };

    public static readonly SYMBOL_START = '$';
    public static readonly SYMBOL_ARGS_START = ':';
    public static readonly SYMBOL_INVOKE = '/';
    public static readonly SYMBOL_NEXT_ARG = ',';
    public static readonly SYMBOL_ACCESSOR = '.';
    public static readonly SYMBOL_KEY_VALUE_SEPARATOR = '=';

    public static readonly SYMBOL_STRING_QUOTE = '"';

    public static readonly FUNCTION_NAME_REGEXP = /[a-z0-9_]+/i;

    public static execute(
        script: string,
        context: ScriptContext
    ): ReferencedValue | string {
        var lastPeek: SeekingResult<ReferencedValue> | null = null;
        var result: string = script;
        
        for (var startIndex: number = 0; (startIndex = result.indexOf(this.SYMBOL_START, startIndex)) !== -1;) {
            try {
                lastPeek = this.peekCIS(script.substring(startIndex), context);

                result = Utilities.replaceRange(result, startIndex, startIndex + lastPeek.seeked, String(lastPeek.result.get()));
            } catch (error: any) {
                context.utils.behaviour.logger.error('Unable to parse Context Inline Script:', error);
            }

            startIndex += this.SYMBOL_START.length;
        }

        if (lastPeek != null && lastPeek.seeked === script.length) {
            return lastPeek.result;
        }

        return result;
    }

    /**
     * Finds bounds of CIS
     * @param input String that starts with Context Inline Script
     * @returns Result of CIS with length of CIS string
     */
    private static peekCIS(
        input: string,
        context: ScriptContext
    ): SeekingResult<ReferencedValue> {
        var script = input;

        if (!script.startsWith(this.SYMBOL_START)) {
            throw new Error('Invalid syntax. SYMBOL_START not found');
        }

        var length = this.SYMBOL_START.length;
        script = script.substring(length);

        let functionNameRegExp = script.match(this.FUNCTION_NAME_REGEXP);
        if (functionNameRegExp == null) {
            throw new Error('Invalid function name');
        }

        var functionName = functionNameRegExp[0];
        var args: Record<string, any> | null = null;

        length += functionName.length;
        script = script.substring(functionName.length);

        if (!script.startsWith(this.SYMBOL_ARGS_START) && !script.startsWith(this.SYMBOL_INVOKE)) {
            throw new Error('Invalid function name');
        }

        if (script.startsWith(this.SYMBOL_ARGS_START)) {
            let argsStr = script.substring(this.SYMBOL_ARGS_START.length);
            let argsPeek = this.peekArgs(argsStr, context);
            args = argsPeek.result;

            length += argsPeek.seeked + this.SYMBOL_ARGS_START.length;
            script = script.substring(argsPeek.seeked + this.SYMBOL_ARGS_START.length);
        }

        length += this.SYMBOL_INVOKE.length;
        script = script.substring(this.SYMBOL_INVOKE.length);

        // Execute
        if (functionName in this.FUNCTIONS === false) {
            throw new Error('Unknown function');
        }

        var obj = this.FUNCTIONS[functionName](context, args);
        var accessors: (string | number)[] | null = null;

        // Validate accessors
        let value = obj;
        while (script.startsWith(this.SYMBOL_ACCESSOR)) {
            if (accessors == null) {
                accessors = [];
            }

            length += this.SYMBOL_ACCESSOR.length;
            script = script.substring(this.SYMBOL_ACCESSOR.length);

            let fieldNameStr = this.peekString(script, true, [this.SYMBOL_ACCESSOR, this.SYMBOL_INVOKE, this.SYMBOL_NEXT_ARG]);
            let fieldNameNumber = this.peekNumber(script);
            
            let fieldName = fieldNameNumber?.result != null && fieldNameNumber.seeked === fieldNameStr.seeked ?
                fieldNameNumber.result :
                fieldNameStr.result;
            
            let fancyFieldName = typeof fieldName === 'string' ? '"' + fieldName + '"' : fieldName;
            
            if (value == null) {
                throw new Error('Cannot access field ' + fancyFieldName + ' due to null value');
            }
            
            if (fieldName in value === false) {
                throw new Error('Tried to access unknown field ' + fancyFieldName);
            }

            value = (value as Record<string | number, any>)[fieldName];
            accessors.push(fieldName);

            length += fieldNameStr.seeked;
            script = script.substring(fieldNameStr.seeked);
        }

        return new SeekingResult(new ReferencedValue(obj, accessors), length);
    }

    /**
     * Parses args as key=value pairs separated by SYMBOL_NEXT_ARG
     * @param input 
     * @returns 
     */
    private static peekArgs(
        input: string,
        context: ScriptContext
    ): SeekingResult<Record<string | number, any>> {
        if (input.startsWith(this.SYMBOL_INVOKE)) {
            throw new Error('Input must contain at least one argument');
        }
        
        var result: Record<string | number, any> = {};
        var length = 0;

        do {
            if (input.startsWith(this.SYMBOL_NEXT_ARG)) {
                if (length === 0) {
                    throw new Error('Invalid args syntax');
                }

                let substrStart = this.SYMBOL_NEXT_ARG.length;

                length += substrStart;
                input = input.substring(substrStart);
            }

            var name: string | number;

            // Parse key
            {
                // Try as number
                let nameNumber = this.peekNumber(input);
                if (nameNumber?.result != null && input.startsWith(this.SYMBOL_KEY_VALUE_SEPARATOR, nameNumber.seeked)) {
                    name = nameNumber.result;
                    length += nameNumber.seeked;
                    input = input.substring(nameNumber.seeked);
                } else {
                    // Try as string
                    let nameStr = this.peekString(input, true, [this.SYMBOL_KEY_VALUE_SEPARATOR]);

                    if (input.length <= nameStr.seeked) {
                        throw new Error('Unexpected end of string');
                    }

                    name = nameStr.result;
                    length += nameStr.seeked;
                    input = input.substring(nameStr.seeked);

                    if (!input.startsWith(this.SYMBOL_KEY_VALUE_SEPARATOR)) {
                        throw new Error('Invalid key name. Did you forget to add quotes?');
                    }
                }
            }

            length += this.SYMBOL_KEY_VALUE_SEPARATOR.length;
            input = input.substring(this.SYMBOL_KEY_VALUE_SEPARATOR.length);

            if (input.length === 0) {
                throw new Error('Unexpected end of string');
            }

            var value: any = null;
            
            // Parse value
            {
                // Parse value as number
                if (input.charCodeAt(0) >= 0x30 && input.charCodeAt(0) <= 0x39) {
                    let valueNumber = this.peekNumber(input);

                    length += valueNumber.seeked;
                    input = input.substring(valueNumber.seeked);

                    if (input.length > 0 && !input.startsWith(this.SYMBOL_NEXT_ARG) && !input.startsWith(this.SYMBOL_INVOKE)) {
                        throw new Error('Unknown data after number value. Did you forget to add quotes?');
                    }

                    value = valueNumber.result;
                }
                // Parse value as string
                else if (input.startsWith(this.SYMBOL_STRING_QUOTE)) {
                    let valueStr = this.peekString(input);

                    length += valueStr.seeked;
                    input = input.substring(valueStr.seeked);

                    if (input.length > 0 && !input.startsWith(this.SYMBOL_NEXT_ARG) && !input.startsWith(this.SYMBOL_INVOKE)) {
                        throw new Error('Unknown data after string value. Did you forget to add quotes?');
                    }

                    value = valueStr.result;
                }
                // Parse value as Context Inline Script
                else if (input.startsWith(this.SYMBOL_START)) {
                    let valueCis = this.peekCIS(input, context);

                    length += valueCis.seeked;
                    input = input.substring(valueCis.seeked);

                    if (input.length > 0 && !input.startsWith(this.SYMBOL_NEXT_ARG) && !input.startsWith(this.SYMBOL_INVOKE)) {
                        throw new Error('Unknown data after script string. Did you forget to add quotes?');
                    }

                    value = valueCis.result.get();
                }
                // Something unknown
                else {
                    throw new Error('Unknown data passed to argument ' +
                        (typeof name === 'string' ? '"' + name + '"' : name) +
                        '. Did you forget to add quotes?');
                }
            }

            if (name in result) {
                throw new Error('Duplicate argument');
            }

            result[name] = value;
        } while (input.startsWith(this.SYMBOL_NEXT_ARG));

        return new SeekingResult(result, length);
    }

    private static peekNumber(input: string): SeekingResult<number | null> {
        if (input.length == 0 || input.charCodeAt(0) < 0x30 || input.charCodeAt(0) > 0x39) {
            return new SeekingResult(null, 0);
        }

        let numberRegExp = /(0x[0-9A-Fa-f]+)|(0o[0-7]+)|(0b[01])|(\d+)/;
        let result = numberRegExp.exec(input)!;

        return new SeekingResult(Number(result[0]), result[0].length);
    }

    private static peekString(
        input: string,
        allowQuoteOmit: Boolean = false,
        endOfString: string[] = []
    ): SeekingResult<string> {
        if (input.length == 0) {
            throw new Error('Cannot peek empty input string');
        }

        if (!allowQuoteOmit) {
            if (!input.startsWith(this.SYMBOL_STRING_QUOTE)) {
                throw new Error('String quote missing');
            }

            let end = input.indexOf(this.SYMBOL_STRING_QUOTE, this.SYMBOL_STRING_QUOTE.length);
            if (end === -1) {
                throw new Error('The end of peeking string does not exist');
            }

            let string = input.substring(this.SYMBOL_STRING_QUOTE.length, end);
            return new SeekingResult(string, string.length + this.SYMBOL_STRING_QUOTE.length * 2);
        }

        if (!endOfString.includes(' ')) {
            endOfString.push(' ');
        }

        let charIndex = 0;
        let string = '';
        var char = '';

        function readChar(): Boolean {
            char = input[charIndex++];

            let atIterEnd = string + char;

            return !endOfString.some(value => atIterEnd.endsWith(value));
        }

        while (charIndex < input.length && readChar()) {
            string += char;
        }

        return new SeekingResult(string, charIndex == string.length ? charIndex : charIndex - 1);
    }
}
