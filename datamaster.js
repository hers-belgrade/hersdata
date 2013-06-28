/// we should use portable version of HookCollection?
var fs = require('fs');
var content = fs.readFileSync(__dirname+'/hookcollection.js', 'utf8');
eval(content);

function convert_to_structure  (structorjson) {
	var s;
	if (typeof(structorjson) == 'string') {
		try {
			///  check if this is a valid json ....
			s = JSON.parse(structorjson);
		}catch (e) {
			s = structorjson; //consider it as a scalar, string ....
		}
	}else{
		s = structorjson;
	}
	return s;
}

function generate_from_json (structorjson) {
	var cs = convert_to_structure(structorjson);
	return (Scalar.isScalarable(cs)) ? new Scalar(cs) : new Collection(cs);
}

function Scalar(public_value, private_value, key){
	if (Scalar.isScalarable(public_value)) {
		if (public_value instanceof Array) {
			var t = public_value;
			public_value = t[0];
			private_value= t[1];
			key = t[2];
		}
	}else{
    throw 'Scalar can be nothing but a string or a number '+JSON.stringify(arguments);
	}
	var self = this;
  this.alter = function(public_data_a, private_data_a, key_a){
		public_data = public_data_a;
		private_data = private_data_a;
		key = key_a;
  }

  this.value = function(key_a){
		if (!key) return public_value;
    return (key_a == key ? private_value : public_value);
  };

  this.stringify = function(key_a){
    return this.value(key_a);
  };

  this.copy = function(key_a){
    return new ScalarCopy(self.stringify(key_a));
  };

  this.parse = function(value){
		var tov = typeof(value);
		if ('object' != tov) {
			if ('string' == tov) {
				try {
					value = JSON.parse(value);
				}catch (e) {
					///invalid json => just string
					public_data = value;
					return;
				}
			}else{
				public_data = value;
				return;
			}
		}
		if (value instanceof Array) {
			public_data = value[0];
			private_data= value[1];
			key = value[2];
		}
  };
	this.parse(public_value, private_value, key);

	this.print_debug = function (){
		console.log(public_value,private_value, key);
	}
}

Scalar.isScalarable = function (obj) {
	return (('object' != typeof(obj)) || (obj instanceof Array));
}

function Collection(init){
  var data = {};
	var self = this;

	function struct_tree (path) {
		var ret = [self];
		if (path.length == 0) return ret;
		var p = path.slice(0);
		var target = self;
		while (p.length) {
			target = target.element(p.shift());
			ret.push(target);
		}
		return ret;
	}
	this.value = function (key, path) {
		if (path) {
			var t = this.element(path);
			return (t)?t.value(key):undefined;
		}
		var ret = {};
		for (var i in data) ret[i] = data[i].value(key);
		return ret;
	}

  this.add = function(name,value){
		var e = convert_to_structure(value);
		data[name] = (Scalar.isScalarable(e))? new Scalar(e):new Collection(e);
		return e;
  };

  this.addScalar = function(name,value){
		if (!Scalar.isScalarable(value)) return;
    this.add(name,value);
  };

  this.destroy = function(name){
    var el = data[name];
    if(typeof el === 'undefined'){
      return;
    }
    delete data[name];
    el.destroy();
  };

	this.element = function(name){
		/// return a clean Collection reference, not a value which is struct copy  ....
		if ('string' === typeof(name)) {
			return data[name];
		}
		return (name instanceof Array) ? struct_tree(name).pop() : undefined;
  };
  this.stringify = function(key){
    var ret = {};
    for(var i in data){
      ret[i] = data[i].value(key);
    }
    return JSON.stringify(ret);
  };

  this.copy = function(){
    return new CollectionCopy(defaultelementconstructor,self.stringify());
  };

  this.parse = function(value){
		var s = convert_to_structure(value);
		///forget, I can't create Collection from a scalar !!!
		if ('object' != typeof(s)) return;
		for (var i in s) { 
			this.add(i, s[i]); 
		}
  };


	this.attach = function(objorname){
		var data = self;
		var ret = {};
		var m;
		switch(typeof objorname){
			case 'string':
				m = require(objorname);
				break;
			case 'object':
				m = objorname;
				break;
			default:
				return {};
		}
		if(typeof m.errors !== 'object'){
			throw objorname+" does not have the 'errors' map";
		}
		function localerrorhandler(originalerrcb){
			var ecb = (typeof originalerrcb !== 'function') ? function(errkey,errmess){console.log('('+errkey+'): '+errmess)} : originalerrcb;
			return function(errorkey){
				var errorparams = Array.prototype.slice.call(arguments,1);
				if(typeof m.errors[errorkey] !== 'object'){
					throw 'Error key '+errorkey+' not specified in the error map';
				}
				var eo = m.errors[errorkey];
				var errmess = eo.message;
				var eop = eo.params;
				if(eop && eop.length){
					if(arguments.length!==eo.params.length+1){
						throw 'Improper number of error parameters provided for '+errorkey;
					}
					var eopl = eop.length;
					for(var i=0; i<eopl; i++){
						errmess = errmess.replace(new RegExp('\\['+eop[i]+'\\]','g'),arguments[i+1]);
					}
				}
				ecb(errorkey,errmess);
			};
		};
		for(var i in m){
			var p = m[i];
			if((typeof p === 'function')){
				ret[i] = (function(mname,_p,_env){
					return function(obj,errcb,feedback){
						var pa = [];
						if(_p.params){
							if(_p.params==='originalobj'){
								if(typeof obj !== 'object'){
									throw 'First parameter to '+mname+' has to be an object';
								}
								pa.push(obj);
							}else{
								var pd = _p.defaults||{};
								var _ps = _p.params;
								if(typeof obj !== 'object'){
									throw 'First parameter to '+mname+' has to be an object with the following keys: '+_ps.join(',');
								}
								for(var i=0; i<_ps.length; i++){
									var __p = obj[_ps[i]];
									if(typeof __p === 'undefined'){
										var __pd = pd[_ps[i]];
										if(typeof __pd === 'undefined'){
											throw 'Paramobj for '+mname+' needs a value for '+_ps[i];
										}
									}
									pa.push(__p);
								}
							}
						}
						pa.push(localerrorhandler(errcb));
						pa.push(function(eventname){
							var eventparams = Array.prototype.slice(arguments,1);
							var ff = feedback[eventname];
							if(typeof ff !== 'function'){
								throw mname+' raised an unhadled event '+ff+' with params '+eventparams.join(',');
							}
							ff.apply(m,eventparams);
						});
						_p.apply(_env,pa);
					}
				})(i,p,data);
			}
		}
		return ret;
	}


	var operations = {
		alter : function (path, val) {
			var target = self.element(path);
			if (!target) return undefined;
			target.alter(val);
			return {
				target:target
			};
		},
		add: function (path, params) {
			var target = self.element(path);
			if (!target) return undefined;
			target.add (params.name, params.value);
			return {
				name: params.name,
				target:target.element(params.name)
			}
		},
		remove: function (path, params) {
			var st = struct_tree(path);
			if (st.length < 2) return undefined;
			var el = st.pop();
			var target = st.pop();
			if (!target) return undefined;
			target.destroy(params.name);
			return {
				target: target.element(params.name),
				name: params.name
			};
		}
	};

	this.commit = function (transaction) {
		var ops = transaction.operations();
		var res = [];
		for (var i in ops) {
			var it = ops[i];
			if (it && it.action) {
				var target = operations[it.action].call(this, it.path, it.params);
				res.push ({ action:it.action, target:target, path:it.path});
			}
		}
		var update_struct = { alias : transaction.alias(), batch : res };
		this.onNewTransaction.fire(update_struct);
		return update_struct;
	}

	this.onNewTransaction = new HookCollection();

	this.parse(init);
}

/*
 * alias: signature of transaction, should be populated auto by some overriden techniques ....
 * config : {
 * 	pre_commit_params: raise an alias_begins event with these params
 * 	post_commit_params:raise an alias_done event with these params
 * }
 */
function Transaction (alias) {
	var ta = [];
	this.alias = function () {return alias;} //keep alias as a private info ....

	/* append a transaction primitive: td = {
	 * 	action: [add | remove | alter]
	 * 	path:   [array of strings which will lead you to nested data element]
	 * 	args: action arguments, respect designated target arguments ...
	 * }
	 * or an array of transaction primitives
	 *
	 */
	this.append  = function (td) {
		if (!td) return;
		if (td instanceof Array) { //we got array of maps
			for (var i in td) this.append(td[i]);
			return;
		}
		if (td.path && td.action) { ///treat as a simple map ...
			ta.push (td);
			return;
		}
		return;
	}
	this.operations = function () {return ta;}
}

module.exports = {
	Transaction : Transaction,
	Scalar : Scalar,
	Collection : Collection,
	HookCollection : HookCollection,
	generate_from_json : generate_from_json 
}
