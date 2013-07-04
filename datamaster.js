/// we should use portable version of HookCollection?
var utils = require('util');
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
function Scalar(res_val, pub_val, access_lvl) {
  var restricted_value = res_val;
  var public_value = pub_val;
  var access_level = access_lvl;

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
	set_from_vals (res_val, pub_val, access_lvl);

	var self = this;
	this.alter = function (r_v,p_v,a_l) { 
    set_from_vals(r_v,p_v,a_l);
	}
	this.stringify = function (al) {
		return {
			type: this.type(),
			value:this.value(al)
		}
	}

	//use this for serialization
	this.json = function () { return JSON.stringify(this.dump()); }

	this.dump = function () {
		return [
			this.type(),
      {
        restricted_value : restricted_value,
        public_value : public_value,
        access_level : access_level
      }
		];
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

function Collection(){
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
			var t = this.element(path);
			return (t)?t.value(c_al):undefined;
		}
    return this;
	}

  this.add = function(name,entity){
		if (!name) throw ("No name in add to collection procedure ...");
    data[name] = entity;
  };

	/// TODO: struct review missing ....
  this.destroy = function(name){
		if ('string' === typeof(name)) {
			delete data[name];
			return;
		}
		if (!(name instanceof Array)) return undefined;

		var p = name.slice();
		var target = this.element(name, c_al);
		if (p.length) {
			var nnn = p.pop();
			var prnt = this.element(p, c_al);
			prnt.destroy(nnn);
		}
		if (target) target.destroy();
  };

	this.element = function(name){
		if ('object' !== typeof(name)) {
      return data[name];
		}
		return (name instanceof Array) ? struct_tree(name).pop() : undefined;
  };
	this.dump = function() {
    var ent = {};
		for (var i in data) {
      ent[i] = data[i].dump();
		}
		return [this.type(),ent];
	}

	this.type = function () {return 'Collection';}

	this.json = function () { return JSON.stringify(this.dump()); }

	this.attach = function(objorname, config){
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

		if ('function' === typeof(ret.init)) { ret.init(config || {}); }
		return ret;
	}

	var operations = {
		alter : function (params){
			var target = self.element(params.path, params.access_level);
			target && target.alter(params.value);
			return { 
				target:target,
				path:params.path
			}
		},
		addcollection: function (path) {
      var name = path.splice(-1);
      if(!name.length){
        throw "Cannot add without a name in the path";
      }
      name = name[0];
			var target = self.element(path);
			if (target && target.add) {
				target.add(name,new Collection());
			}else{
        console.trace();
        throw 'No collection at path '+params.path;
      }
		},
		setscalar: function (path,valaccessarry) {
      var name = path.splice(-1);
      if(!name.length){
        throw "Cannot add without a name in the path";
      }
      name = name[0];
			var target = self.element(path);
      var e = target.element(name);
      if (e){
       if(e.type()==='Scalar'){
        e.alter(valaccessarry[0],valaccessarry[1],valaccessarry[2]);
        return;
        }else{
          throw "Cannot set scalar on "+path.join('/')+name+" that is of type "+e.type();
        }
      }
			if (target && target.add) {
				target.add(name,new Scalar(valaccessarry[0],valaccessarry[1],valaccessarry[2]));
			}else{
        console.trace();
        throw 'No collection at path '+params.path;
      }
		},
		remove: function (path) {
      self.destroy(self.element(path));
		}
	};

	this.commit = function (txnalias,txnprimitives) {
		for (var i in txnprimitives) {
			var it = txnprimitives[i];
			if (utils.isArray(it) && it.length) {
        console.log('performing',it);
				operations[it[0]].call(this, it[1], it[2]);
			}
		}
    this.onNewTransaction.fire(txnalias,txnprimitives);
	}

	this.onNewTransaction = new HookCollection();
}

Collection.fromString = function (json) {
	try {
		return Collection.fromObj(JSON.parse(json));
	}catch (e) {return undefined;}
}


module.exports = {
	Scalar : Scalar,
	Collection : Collection,
	HookCollection : HookCollection,
	Factory: Factory
}
