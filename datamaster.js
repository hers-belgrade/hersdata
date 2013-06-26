
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

function decide_structure (structorjson) {
	cs = convert_to_structure(structorjson);
}

function generate_from_json (structorjson) {
	var cs = convert_to_structure(structorjson);
	return ('object' === typeof(cs)) ? new Collection(cs) : new Scalar(cs);
}

function Scalar(value){
  var tov = typeof value;
	if (tov === 'object') {
  //if(!((tov==='string')||(tov==='number'))){
    throw 'Scalar can be nothing but a string or a number';
  }
  var data = value;
  var changed = new HookCollection();
  this.alter = function(newval){
    if(data!==newval){
      var oldval=data;
      data=newval;
      changed.fire('',oldval,newval);
    }
  }
  this.changed = changed;
  var destroyed = new HookCollection();
  this.destroy = function(){
    destroyed.fire();
    changed.destroy();
    changed = undefined;
    destroyed.destroy();
    destroyed = undefined;
  }
  this.destroyed = destroyed;
  this.value = function(){
    return data;
  };
  var stringify = function(){
    return JSON.stringify(data);
  };
  this.copy = function(){
    return new ScalarCopy(stringify());
  };
  this.stringify = stringify;
  this.parse = function(value){
    data = JSON.parse(value);
  };
}

function Collection(init){
  var data = {};
  var newElement = new HookCollection();
  var elementDestroyed = new HookCollection();
	var self = this;

	this.value = function () {
		var ret = {};
		for (var i in data) ret[i] = data[i].value();
		return ret;
	}


  this.add = function(name,value){
		var e = convert_to_structure(value);
		var te = typeof(e);
		data[name] = (te == 'object') ? new Collection(e) : new Scalar(e);
		newElement.fire(name, data[name].stringify());

		/*
		element = value; ///we should parse value ....
    data[name] = element;
    newElement.fire(name,element.stringify());
		*/
  };

  this.addScalar = function(name,value){
		if ('object' === typeof(value)) return;
    this.add(name,value);
  };

  this.destroy = function(name){
    var el = data[name];
    if(typeof el === 'undefined'){
      return;
    }
    delete data[name];
    el.destroy();
    elementDestroyed.fire(name);
  }
	;
  this.element = function(name){
		switch(typeof(name)) {
			case 'undefined': return undefined;
			case 'number':
			case 'string': return data[name];
			case 'object':{
				if (name instanceof Array) {
					var st = this.struct_tree(name);
					return st.pop();
				}else{
					return undefined;
				}
			}
		}
  };
  this.newElement = newElement;
  this.elementDestroyed = elementDestroyed;

	this.begin_transaction = new HookCollection();
	this.end_transaction = new HookCollection();

  this.stringify = function(){
    var ret = {};
    for(var i in data){
      ret[i] = data[i].value();
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

	var operations = {
		alter : function (path, val) {
			var target = struct_tree(path).pop();
			target && target.alter(val);
		},
		add: function (path, params) {
			var target = struct_tree(path).pop();
			target && target.add (params.name, params.value, params.constructor_function);
		},
		remove: function (path, params) {
			var st = struct_tree(path);
			if (st.length < 2) return;
			var el = st.pop();
			var target = st.pop();
			target && target.destroy(params.name);
		}
	};

	this.commit = function (transaction, params) {
		params = params || {};
		var t_alias = transaction.alias();
		this.begin_transaction.fire({'transaction': transaction.alias(), 'state': this.stringify(), 'params':params.begin_params});
		var ops = transaction.operations();
		for (var i in ops) {
			if (ops[i] && ops[i].action) {
				operations[ops[i].action].call(this, ops[i].path, ops[i].params);
			}
		}
		this.end_transaction.fire({'transaction':transaction.alias(), 'state': this.stringify(), 'params':params.end_params});
	}

	self.parse(init);
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
