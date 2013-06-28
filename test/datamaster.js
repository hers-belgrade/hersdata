var DataMaster = require ('../datamaster.js');

var scalar = {type:'Scalar', restricted_value: 2, public_value : 3, access_level : ['']};
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
			restricted_value: 7, 
			public_value: 9, 
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


function check_on_procedures () {
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



	var c = DataMaster.Factory(collection);
	console.log(c.dump());
	console.log(DataMaster.Factory(c.dump()));

	console.log(c.value(['bla']));
	console.log(c.value(['test1']));

	console.log(c.element([]).dump());
	console.log(c.element(['vrednost1']).dump());
	console.log(c.element(['vrednost2']));
	console.log(c);
	console.log(c.dump());
}

function check_on_transaction_primitives () {
	var t = new DataMaster.Transaction ();
	var s = DataMaster.Factory(scalar);
	var c = DataMaster.Factory(collection);

	c.onNewTransaction.attach (function (data) {
		if (!data.batch) return;
		for (var i in data.batch) {
			var d = data.batch[i].target;
			if (d) {
				console.log(' BATCH INDEX '+i+' ',data.batch[i].target.dump());
			}else{
				console.log(' REMOVED ');
			}
		}
		console.log('transaction event :' , data);
	});
	t.append ({ action : 'alter', params : { path : ['vrednost1'], access_level : ['test1'], value : {
		type: 'Scalar',
		restricted_value: 10,
		public_value : 11,
		access_level : ['nema_veze']
	}	} });
	t.append({action : 'remove', params : {path : ['vrednost1'], access_level: ['test1']}});
	t.append({action : 'add', params: {path:['vrednost2'], access_level: ['test1'],name:'byte_me', value : {
		restricted_value: {
			type : 'Scalar',
			restricted_value : 200,
			public_value : 150,
		},
	}}});
	c.commit(t);
}

check_on_transaction_primitives();
