var DataMaster = require ('../datamaster.js');

var scalar = {type:'Scalar', restricted_value: 2, public_value : 3, access_level : ['']};

var s = DataMaster.Factory(scalar);
console.log(s);
console.log(s.dump());
console.log(s.value());
console.log(s.value(''));
console.log(s.value(['']));
console.log(s.value(['bla']));
console.log(DataMaster.Factory(s.dump()));
console.log(DataMaster.Factory(s.json()));
console.log(s.json());


var collection = {
	type: 'Collection', 
	'vrednost1':{ 
		restricted_value : { 
			type:'Scalar', 
			restricted_value: 6, 
			public_value: 8, 
			access_level: ['bla'] 
		},
		public_value : { 
			type:'Scalar', 
			restricted_value: 6, 
			public_value: 8, 
			access_level:['bla'] 
		},
	},
	'vrednost2': {
		restricted_value: {
			type : 'Collection',
			'vreadnost2-': {
				public_value: {
					type: 'Scalar', 
					restricted_value: 'bla', 
					public_value:'truc',
					access_level : ['bb']
				},
				restricted_value : {
					type: 'Scalar', 
					restricted_value: 'bla_bb', 
					public_value:'truc_bb',
					access_level : ['bb']
				},
			}
		}
	},
	access_level: ['test1']
}

var c = DataMaster.Factory(collection);
console.log(c.dump());
console.log(DataMaster.Factory(c.dump()));

console.log(c.value(['bla']));
console.log(c.value(['test1']));

console.log(c.element([]).dump());
console.log(c.element(['vrednost1']).dump());
console.log(c.element(['vrednost2']));
/*
console.log(c);
console.log(c.dump());
*/
