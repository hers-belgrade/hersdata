/// we should use portable version of HookCollection?
var fs = require('fs');
var content = fs.readFileSync(__dirname+'/hookcollection.js', 'utf8');
eval(content);


function Factory (json_or_obj) {
	var v;
	if ('string' === typeof(json_or_obj)) {
		try {
			v = JSON.parse(json_or_obj);
		}catch (e) {}
	}else if ('object' === typeof(json_or_obj)){
		v = (json_or_obj instanceof Array) ? undefined : json_or_obj;
	}
	if (!v) return undefined;
	switch (v.type) {
		case 'Scalar' : return Scalar.fromObj(v);
		case 'Collection':return Collection.fromObj(v);
	}
}


function throw_if_invalid_scalar(val) {
	if ('object' === typeof(val)) throw 'Scalar can be nothing but a string or a number '+JSON.stringify(arguments);
}

function throw_if_invalid_access_level (val) {
	var tov = typeof(val);
	if ('undefined' === tov) return;
	if (val instanceof Array) return;
	throw "Access can not be nothing but an array or an undefined "+JSON.stringify(arguments);
}

function is_access_ok (s_als, c_als) {
	if (!s_als) return true;
	if ('string' === typeof(c_als)) return (s_als.indexOf(c_als) > -1);
	if (c_als instanceof Array) {
		for (var i in c_als) {
			if (s_als.indexOf(c_als[i]) > -1) return true;
		}
	}
	return false;
}


//// alter, and add functions are not checked against access_level, make sure you guard them from attached functionality
function Scalar(restricted_value, public_value, access_level) {
	function throw_if_any_invalid (ra,pa,al) {
		throw_if_invalid_scalar (ra);
		throw_if_invalid_scalar (pa);
		throw_if_invalid_access_level (al);
	}

	function set_from_obj(obj) {
		if ('object' != typeof (obj)) {
			throw "Can not call set_from_obj with arg of type "+typeof(obj)+" "+JSON.stringify(arguments);
			return;
		}

		if (obj instanceof Array) {
			throw "Can not call set_from_obj with arg of type Array "+JSON.stringify(arguments);
			return;
		}

		throw_if_any_invalid(obj.restricted_value, obj.public_value, obj.access_level);
		set_from_vals(obj.restricted_value, obj.public_value, obj.access_level);
	}

	function set_from_vals (ra,pa,al) {
		if (typeof(ra) === 'object') return set_from_obj(ra);
		throw_if_any_invalid(ra,pa, al);

		restricted_value = ra;
		public_value = pa;
		access_level = al;
	}
	set_from_vals (restricted_value, public_value, access_level);

	var self = this;
	this.alter = function (ra, pa, al) { set_from_vals(ra, pa, al); }
	this.stringify = function (al) {
		return {
			type: this.type(),
			value:this.value(al)
		}
	}

	//use this for serialization
	this.json = function () { return JSON.stringify(this.dump()); }

	this.dump = function () {
		return {
			type: this.type(),
			restricted_value : restricted_value,
			public_value : public_value,
			access_level : access_level
		}
	}

	this.value = function (al) {
		return (is_access_ok(access_level, al)) ? restricted_value : public_value;
	}
	this.type = function () { return 'Scalar'; }
	this.destroy = function  () {
		public_value = undefined;
		restricted_value = undefined;
		access_level = undefined;
	}
}

//use this for deserialisation
Scalar.fromString = function(s) {
	try {
		return Scalar.fromObj(JSON.parse(s));
	}catch (e) {
		return undefined;
	}
}

Scalar.fromObj = function (v) {
	if (!v) return undefined;
	if (v instanceof Array) return undefined;
	return new Scalar (v.restricted_value, v.public_value, v.access_level);
}

function Collection(access_level){
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
			if (!target) return ret;
		}
		return ret;
	}


	this.value = function (c_al, path) {
		if (path) {
			var t = this.element(path, c_al);
			return (t)?t.value(c_al):undefined;
		}

		var ret = {};
		var choice = is_access_ok(access_level, c_al) ? 'restricted_value' : 'public_value';
		for (var i in data) {
			if (data[i][choice]) ret[i] = data[i][choice].value(c_al);
		}
		return ret;
	}

  this.add = function(name,restricted_value, public_value, access_level){
		/// todo: checks missing
		data[name] = {
			restricted_value : restricted_value,
			public_value : public_value,
			access_level : access_level
		};
  };

	/// TODO: struct review missing ....
  this.destroy = function(name){
    var rel = restricted_data[name];
		var pel = public_data[name];

		if (rel) {
			delete restricted_data[name];
			rel.destroy();
		}
		if (pel) {
			delete public_data[name];
			pel.destroy();
		}
  };

	this.element = function(name, al){
		if ('string' === typeof(name)) {
			var d = data[name] || {};
			return (is_access_ok(access_level, al)) ? d.restricted_value: d.public_value;
		}
		return (name instanceof Array) ? struct_tree(name, al).pop() : undefined;
  };
	this.dump = function() {
		var rd = {type : this.type(), access_level: access_level};

		for (var i in data) {
			var d = data[i] || {};
			rd[i] = {
				restricted_value : ('undefined' == typeof(d.restricted_value)) ? undefined : d.restricted_value.dump() ,
				public_value : ('undefined' == typeof(d.public_value)) ? undefined : d.public_value.dump()
			};
		}

		return  rd;
	}
	this.type = function () {return 'Collection';}

	this.json = function () { return JSON.stringify(this.dump()); }

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
			return target;
		},
		add: function (path, params) {
			var target = self.element(path);
			if (!target) return undefined;
			target.add (params.name, params.value);
			return target;
		},
		remove: function (path, params) {
			var st = struct_tree(path);
			if (st.length < 2) return undefined;
			var el = st.pop();
			var target = st.pop();
			if (!target) return undefined;
			target.destroy(params.name);
			return target.element(params.name);
		}
	};

	this.commit = function (transaction) {
		var ops = transaction.operations();
		var res = [];
		for (var i in ops) {
			var it = ops[i];
			if (it && it.action) {
				var target = operations[it.action].call(this, it.path, it.params);
				res.push ({ action:it.action, target:target, path:it.path });
			}
		}
		var update_struct = { alias : transaction.alias(), batch : res };
		this.onNewTransaction.fire(update_struct);
		return update_struct;
	}

	this.onNewTransaction = new HookCollection();
}

Collection.fromString = function (json) {
	try {
		return Collection.fromObj(JSON.parse(json));
	}catch (e) {return undefined;}
}

Collection.fromObj = function (obj) {
	if (!obj) return undefined;
	if (obj instanceof Array) return undefined;
	var c = new Collection(obj.access_level);
	for (var i in obj) {
		if (i == 'type' || i == 'access_level') continue;
		c.add(i, Factory(obj[i].restricted_value), Factory(obj[i].public_value));
	}
	return c;

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
	Factory: Factory
}
