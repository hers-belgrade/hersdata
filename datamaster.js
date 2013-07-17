/// we should use portable version of HookCollection?
var utils = require('util');
var fs = require('fs');
var BigCounter = require('./BigCounter');
var content = fs.readFileSync(__dirname+'/hookcollection.js', 'utf8');
eval(content);

function throw_if_invalid_scalar(val) {
	if ('object' === typeof(val)) throw 'Scalar can be nothing but a string or a number '+JSON.stringify(arguments);
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

function traverse(hash,path,cb){
  for(var i in hash){
    var e = hash[i];
    var p = path.concat([i]);
    var cbr = cb(p,e);
    if(cbr===true){
      return;
    }
    if(e.type()==='Collection'){
      traverse(e,p,cb);
    }
  }
}

function keyexistsintree(exists,newkey){
  if(typeof newkey === 'undefined'){
    exists.exists = false;
    return function(){
      exists.exists = false;
      return true;
    }
  }
  return function(path,element){
    if(exists.exists){return true;}//stop the traversal
    if(element.access_level()===newkey){
      exists.exists = true;
      return true;
    }
  };
};


function Scalar(res_val, pub_val, access_lvl) {
  var restricted_value = res_val;
  var public_value = pub_val;
  var access_level = access_lvl;

	function throw_if_any_invalid (ra,pa,al) {
		throw_if_invalid_scalar (ra);
		throw_if_invalid_scalar (pa);
		throw_if_invalid_scalar (al);
	}

	function set_from_vals (ra,pa,al,path) {
		throw_if_any_invalid(ra,pa, al);

    if((ra===restricted_value)&&(pa===public_value)&&(al===access_level)){
      return;
    }
		restricted_value = ra;
		public_value = pa;
		access_level = al;
    return this.toCopyPrimitives(path);
	}
	set_from_vals (res_val, pub_val, access_lvl);

  this.access_level = function(){
    return access_level;
  };
	this.alter = function (r_v,p_v,a_l,path) { 
    return set_from_vals.call(this,r_v,p_v,a_l,path);
	};
  this.toMasterPrimitives = function(path){
    return ['set',path,[restricted_value,public_value,access_level]];
  }
  this.toCopyPrimitives = function(path){
    if(typeof public_value !== 'undefined'){
      return [[access_level,['set',path,public_value],['set',path,restricted_value]]];
    }else{
      return [[access_level,undefined,['set',path,restricted_value]]];
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

function Collection(a_l){
  var access_level = a_l;
  this.access_level = function(){
    return access_level;
  };
	var data = {};

	var self = this;

	function struct_tree (path,c_al) {
    var me =  is_access_ok(access_level,c_al) ? self : new DeadCollection();
		var ret = [me];
		if (path.length == 0) return ret;
		var p = path.slice(0);
		var target = me;
		while (p.length) {
			target = target.element(p.shift());
			ret.push(target);
			if (!target) return ret;
		}
		return ret;
	}

  this.setAccessLevel = function(a_l){
    if(access_level!==a_l){
      access_level = a_l;
      return this.toCopyPrimitives();
    }
  };

	this.value = function (c_al, path) {
		if (path) {
			var t = this.element(path);
			return (t)?t.value(c_al):undefined;
		}
		var ret = {};
		for (var i in data) {
			ret[i] = data[i].value(c_al);
		}
		return ret;
	}

  this.add = function(name,entity){
		if (typeof name === 'undefined') throw ("No name in add to collection procedure ...");
    data[name+''] = entity;
  };

  this.remove = function(name){
    if(typeof data[name] !== 'undefined'){
      data[name].destroy();
    }
    delete data[name];
  };

  this.destroy = function(name){
    this.onNewTransaction.destruct();
    this.onNewFunctionality.destruct();
  };

	this.element = function(name){
		if ('object' !== typeof(name)) {
      return data[name];
		}
		return (name instanceof Array) ? struct_tree(name).pop() : undefined;
  };
  this.toMasterPrimitives = function(path){
    path = path || [];
    var ret = [['set',path,access_level]];
    for(var i in data){
      var p = path.concat(i);
      ret.push(data[i].toMasterPrimitives(p));
    }
    return ret;
  };
  this.toCopyPrimitives = function(path){
    var ret = [];
    path = path || [];
    ret.push([access_level,['remove',path],['set',path,{}]]);
    for(var i in data){
      var p = path.concat(i);
      ret = ret.concat(data[i].toCopyPrimitives(p));
    }
    return ret;
  };

	this.type = function () {return 'Collection';}

	this.attach = function(functionalityname, config, key, environmentmodulename){
		var ret = {};
		var m;
		switch(typeof functionalityname){
			case 'string':
				m = require(functionalityname);
				break;
			case 'object':
				m = functionalityname;
				break;
			default:
				return;// {};
		}
		if(typeof m.errors !== 'object'){
			throw functionalityname+" does not have the 'errors' map";
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
					return function(obj,errcb,callername){
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
            pa.push(callername);
            /*
						pa.push(function(eventname){
							var eventparams = Array.prototype.slice(arguments,1);
							var ff = feedback[eventname];
							if(typeof ff !== 'function'){
								throw mname+' raised an unhadled event '+ff+' with params '+eventparams.join(',');
							}
							ff.apply(m,eventparams);
						});
            */
						_p.apply(_env,pa);
					}
				})(i,p,self);
			}
		}

		if ('function' === typeof(ret.init)) { ret.init(config || {}); }
    this.onNewFunctionality.fire([functionalityname],ret,key);
		//return ret;
	}

	var operations = {
    set: function(path,param){
      var name = path.splice(-1);
      if(!name.length){
        throw "Cannot add without a name in the path";
      }
      name = name[0];
			var target = self.element(path);
      var e = target.element(name);
      if(utils.isArray(param)){
        //Scalar case
        if (e){
          if(e.type()==='Scalar'){
            return e.alter(param[0],param[1],param[2],path.concat([name]));
          }else{
            throw "Cannot set scalar on "+path.join('/')+'/'+name+" that is of type "+e.type();
          }
        }
        if (target && target.add) {
          var ns = new Scalar(param[0],param[2],param[1]);
          target.add(name,ns);
          return ns.toCopyPrimitives(path.concat([name]));
        }else{
          console.trace();
          throw 'No collection at path '+path;
        }
      }else{
        //Collection case
        if (e){
         if(e.type()==='Collection'){
           return e.setAccessLevel(param,path.concat([name]));
         }else{
           throw "Cannot set key on "+path.join('/')+'/'+name+" that is of type "+e.type();
         }
        }
        if (target && target.add) {
          var nc = new Collection(param);
          target.add(name,nc);
          nc.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives){
            var tp = txnprimitives.slice();
            var dcp = datacopytxnprimitives.slice();
            //console.log('before transform',tp,dcp);
            for(var i = 0; i<tp.length; i++){
              var _t = tp[i];
              if(utils.isArray(_t[1])){
                _t[1] = _t[1].unshift(name);
              }
            }
            for(var i = 0; i<dcp.length; i++){
              var _t = dcp[i];
              if(utils.isArray(_t[1])){
                _t[1] = _t[1].unshift(name);
              }
            }
            //console.log('after transform',tp,dcp);
            self.onNewTransaction.fire([],txnalias,txnprimitives,datacopytxnprimitives);
          });
          nc.onNewFunctionality.attach(function(chldcollectionpath,functionalityalias,functionality){
            var path = chldcollectionpath.slice();
            path.unshift(name);
            self.onNewTransaction.fire(path,txnalias,txnprimitives,datacopytxnprimitives);
          });
          return nc.toCopyPrimitives(path.concat([name]));
        }else{
          console.trace();
          throw 'No collection at path '+path;
        }
      }
    },
		remove: function (path) {
      var name = path.splice(-1);
      if(!name.length){
        console.trace();
        throw "Cannot remove without a name in the path";
      }
      name = name[0];
			var target = self.element(path);
      if(target){
        target.remove(name);
        return [[access_level,undefined,['remove',path.concat([name])]]];
      }
      return [];
		}
	};

  var txnCounter = new BigCounter();

	this.commit = function (txnalias,txnprimitives) {
    var datacopytxnprimitives = [];
    //console.log('performing',txnalias,txnprimitives);
		for (var i in txnprimitives) {
			var it = txnprimitives[i];
			if (utils.isArray(it) && it.length) {
        //console.log('performing',it);
        var cpp = operations[it[0]].call(this, it[1], it[2]);
        if(utils.isArray(cpp)){
          for(var i in cpp){
            var _cp = cpp[i];
            if(utils.isArray(_cp)){
              datacopytxnprimitives.push(_cp);
            }
          }
        }
			}
		}
    txnCounter.inc();
    this.onNewTransaction.fire([],txnalias,txnprimitives,datacopytxnprimitives,txnCounter.clone());
	};

  this.dump = function(){
    return ['init',self.toMasterPrimitives(),self.toCopyPrimitives(),txnCounter.clone()];
  };

	this.onNewTransaction = new HookCollection();
	this.onNewFunctionality = new HookCollection();
}

Collection.fromString = function (json) {
	try {
		return Collection.fromObj(JSON.parse(json));
	}catch (e) {return undefined;}
}

function DeadCollection(){
  Collection.apply(this);
  this.add = function(){
  };
  this.remove = function(){
  };
  this.value = function(){
    return new DeadCollection();
  };
  this.element = function(){
    return new DeadCollection();
  }
}


module.exports = {
	Scalar : Scalar,
	Collection : Collection,
	HookCollection : HookCollection
}
