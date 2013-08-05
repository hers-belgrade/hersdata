module.exports = {
	reset: function(path, val) {
		return [
			['remove', path],
			['set', path, val]
		]
	}
}
