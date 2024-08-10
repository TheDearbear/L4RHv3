const CommandLineArg = require("./CommandLineArg");

class CommandLineArgs {
	/**
	 * Arguments without tag
	 * @type {string[]}
	 */
	extras = [];

	/**
	 * Arguments with tag
	 * @type {CommandLineArg[]}
	 */
	args = [];

	/**
	 * Returns last found tag by name
	 * @param {string} tag Tag name
	 * @returns {CommandLineArg?}
	 */
	getTag(tag) {
		return this.args.find(e => e.tag == tag);
	}

	/**
	 * Returns all found tags by name
	 * @param {string} tag Tag name
	 * @returns {CommandLineArg[]} All found arguments
	 */
	getTags(tag) {
		return this.args.filter(e => e.tag == tag);
	}
}

/**
 * Parses arguments from command line
 * @param {string[]} args Command line arguments
 * @returns {CommandLineArgs} Parsed arguments
 */
CommandLineArgs.parse = function (args) {
	var cmd = new CommandLineArgs();

	/**
	 * @type {CommandLineArg}
	 */
	var previous = null;

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
};

module.exports = CommandLineArgs;
