export default class CommandLineArg {
	/** Command line tag */
	tag: string;

	/** Value of tag, 'null' otherwise */
	value: string | null;

	/**
	 * Constructor for command line argument
	 * @param name Command line tag
	 */
	constructor(name: string)
	{
		this.tag = name;
		this.value = null;
	}
}
