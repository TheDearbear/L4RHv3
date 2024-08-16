import CommandLineArg from "./CommandLineArg";

export default class CommandLineArgs {
    /** Arguments without tag */
    extras: string[] = [];

    /** Arguments with tag */
    args: CommandLineArg[] = [];

    /**
     * Returns last found tag by name
     * @param tag Tag name
     */
    getTag(tag: string): CommandLineArg | undefined {
        return this.args.find(e => e.tag == tag);
    }

    /**
     * Returns all found tags by name
     * @param tag Tag name
     * @returns All found arguments
     */
    getTags(tag: string): CommandLineArg[] {
        return this.args.filter(e => e.tag == tag);
    }

    /**
     * Parses arguments from command line
     * @param args Command line arguments
     * @returns Parsed arguments
     */
    public static parse(args: string[]): CommandLineArgs {
        var cmd = new CommandLineArgs();
        var previous: CommandLineArg | null = null;
    
        for (var i = 0; i < args.length; i++) {
            if (previous) {
                if (args[i].startsWith("--")) {
                    cmd.args.push(previous);
                    previous = null;
                    i--;
                    continue;
                }
    
                previous.value = args[i];
                cmd.args.push(previous);
                previous = null;
            } else if (args[i].startsWith("--")) {
                var valueIndex = args[i].indexOf("=");
                var name = valueIndex < 0 ? args[i].slice(2) : args[i].slice(2, valueIndex);
                var current = new CommandLineArg(name);
    
                if (valueIndex < 0) {
                    previous = current;
                } else {
                    current.value = args[i].slice(valueIndex + 1);
                    cmd.args.push(current);
                    previous = null;
                }
            }
            else {
                cmd.extras.push(args[i]);
            }
        }
    
        if (previous) {
            cmd.args.push(previous);
        }
    
        return cmd;
    }
}
