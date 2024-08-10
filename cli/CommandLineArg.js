class CommandLineArg
{
	/**
     * Command line tag
     * @type {string}
     */
	tag;

	/**
	 * Value of tag, 'null' otherwise
	 * @type {string}
	 */
	value;

	/**
	 * Constructor for command line argument
	 * @param {string} name Command line tag
	 */
	constructor(name)
	{
		this.tag = name;
		this.value = null;
	}
}

module.exports = CommandLineArg;
