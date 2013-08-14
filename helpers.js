function reset(path, val) {
	return [
		['remove', path],
	['set', path, val]
		]
};


//TODO...
function public_hash_txn (hash, path_prefix, do_not_remove_path_prefix) {
	path_prefix = path_prefix || [];
	var txn = [];

	for (var i in hash) {
		txn.push (['remove', path_prefix.concat([i])]);
		if ('object' == typeof(hash[i])) {
			txn.push(['set', path_prefix.concat([i])]);
			txn = txn.concat(public_hash_txn(hash[i], path_prefix.concat(i)));
		}else{
			txn.push(['set', path_prefix.concat([i]), [hash[i]]]);
		}
	}

	if (do_not_remove_path_prefix) {
		for (var i in txn) {
			txn[i][1] = do_not_remove_path_prefix.concat(txn[i][1]);
		}
	}

	return txn;
}
module.exports = {
	reset:reset,
	public_hash_txn:public_hash_txn
}
