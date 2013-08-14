var M = require('../datamaster');
var H = require('../helpers');
setTimeout (function () {
var c = new (M.Collection)();
c.debug('INIT');


var txns = H.public_hash_txn({
	'winners': {
		'i1' : 1,
		'i2' : 2, 
		'i3' : {
			'ii1': 1,
			'ii2': 2,
		},
		'i4': 4
	}
}, undefined, ['dupe', 'glava']);

console.log(JSON.stringify(txns));
},1);
