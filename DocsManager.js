const L4RHUtils = require("./L4RHUtils");

class DocsManager {
	header;
	table;

	constructor() {
		this.header = {};
		this.table = {};
	}

	/**
	 * Returns json entry for chunk
	 * @param {number} id 
	 */
	lookup(id) {
		if (id < 0) id = Math.abs(id) + 0x80000000;

		return this.table[L4RHUtils.getUInt32Hex(id)];
	}

	/**
	 * Returns header's value by name
	 * @param {string} name Name of header
	 * @returns Value of header
	 */
	getHeader(name) {
		return this.header[name];
	}
}

DocsManager.from = function (jsonPath) {
	const text = require("fs").readFileSync(jsonPath);

	var docs = new DocsManager();
	var data = JSON.parse(text);
	docs.header = data.header;
	docs.table = data.subnests;

	return docs;
};

module.exports = DocsManager;
