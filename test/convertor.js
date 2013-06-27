var DataMaster = require('../datamaster.js');


var struct = {
	bla : {
		bla1 : {
			bla2: [1,2,3],
			bla21:3
		},
		bla11:1
	},
	bla_1 : {
	}
};

console.log('========\n',DataMaster.generate_from_json(JSON.stringify(struct)).stringify(),'\n', JSON.stringify(struct), '\n===');
