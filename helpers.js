function readScalar (coll, path) {
	if (!coll || !path) return undefined;
	var el = coll.element(path);
	if (!el) return undefined;
	return el.value();
}
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

function throw_if_invalid_scalar(val) {
  var tov = typeof val;
  if (('string' !== tov)&&('number' !== tov)){
    console.trace();
    throw val+' can be nothing but a string or a number (found '+tov+')' ;
  }
}

function throw_if_invalid_scalar_or_undefined(val){
  var tov = typeof val;
  if (('undefined' !== tov)&&('string' !== tov)&&('number' !== tov)&&('boolean' !== tov)){
    console.trace();
    throw val+' can be nothing but a string or a number ';
  }
}

function throw_if_any_invalid (rv,pv,al) {
  throw_if_invalid_scalar_or_undefined (rv);
  throw_if_invalid_scalar_or_undefined (pv);
  throw_if_invalid_scalar_or_undefined (al);
}

function equals(a,b){
  if(typeof a === 'undefined' && typeof b === 'undefined'){
    return true;
  }
  return a===b;
}

function nullconversion(a){
  return (a===null) ? undefined : a;
}


module.exports = {
	reset:reset,
	public_hash_txn:public_hash_txn,
	readScalar : readScalar,
  throw_if_invalid_scalar: throw_if_invalid_scalar
}
