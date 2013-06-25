function Scalar(value){
  var tov = typeof value;
  if(!((tov==='string')||(tov==='number'))){
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

function Collection(defaultelementconstructor){
  var data = {};
  var defaultconstuctor = defaultelementconstructor || function(){
    throw 'No default constructor provided';
  };
  var newElement = new HookCollection();
  var elementDestroyed = new HookCollection();


  var add = function(name,value,constructor){
    if(typeof constructor !== 'function'){
			constructor = defaultelementconstructor;
    }
    var element = new constructor(value);
    data[name] = element;
    newElement.fire(name,element.stringify());
  };
  this.addScalar = function(name,value){
    add(name,value,Scalar);
  };
  this.add = add;
  this.destroy = function(name){
    var el = data[name];
    if(typeof el === 'undefined'){
      return;
    }
    delete data[name];
    el.destroy();
    elementDestroyed.fire(name);
  };
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

  var stringify = function(){
    var ret = {};
    for(var i in data){
      ret[i] = data[i].stringify();
    }
    return JSON.stringify(ret);
  };
  this.copy = function(){
    return new CollectionCopy(defaultelementconstructor,stringify());
  };
  this.stringify = stringify;
  this.parse = function(value){
    var vj = JSON.parse(value);
    for(var i in vj){
      if(data[i]){
        data[i].parse(vj[i]);
      }else{
        add(i,vj[i],defaultconstuctor);
      }
    }
  };

	var self = this;

	this.attach = function(objorname){
		/*
		 *
		 *
		*/ 
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
}

function Series(defaultelementconstructor,capacity){
  Collection.apply(this,[defaultelementconstructor]);
  this.addScalar('capacity',0);
  var t = this;
  this.copy = function(){
    return new SeriesCopy(defaultelementconstructor,t.stringify());
  };
  this.setCapacity = function(cap){
    if(!(cap>0)){
      return;
    }
    var curcap = t.element('capacity').value();
    if(curcap===cap){
      return;
    }
    if(curcap>cap){
      for(var i=curcap; i<cap; i++){
        t.destroy(i);
      }
    }
    if(curcap<cap){
      for(var i=curcap; i<cap; i++){
        t.add(i,undefined,Player);
      }
    }
		this.element('capacity').alter(capacity);
  }
  if(capacity){
		this.setCapacity(capacity);
  }
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

