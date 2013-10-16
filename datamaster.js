/// we should use portable version of HookCollection?
var utils = require('util');
var fs = require('fs');
var Path = require('path');
var BigCounter = require('./BigCounter');
var content = fs.readFileSync(__dirname+'/hookcollection.js', 'utf8');
eval(content);

function deeparraycopy(array){
  var ret = [];
  for(var i in array){
    if(utils.isArray(array[i])){
      ret.push(deeparraycopy(array[i]));
    }else{
      ret.push(array[i]);
    }
  }
  return ret;
}

function augmentpath(pathelem,txn){
  if(utils.isArray(txn)&&utils.isArray(txn[1])){
    var p = txn[1].slice();
    p.unshift(pathelem);
    txn[1] = p;
  }
}

function throw_if_invalid_scalar(val) {
  var tov = typeof val;
	if (('string' !== tov)&&('number' !== tov)){
    console.trace();
    throw val+' can be nothing but a string or a number (found '+tov+')' ;
  }
}

function throw_if_invalid_scalar_or_undefined(val){
  var tov = typeof val;
	if (('undefined' !== tov)&&('string' !== tov)&&('number' !== tov)&&('boolean' !== tov)){
    console.trace();
    throw val+' can be nothing but a string or a number ';
  }
}

function Scalar(res_val,pub_val, access_lvl) {

  var public_value = pub_val;
  var restricted_value = res_val;
  var access_level = access_lvl;

  this.toCopyPrimitives = function(path){
    if(typeof public_value !== 'undefined'){
      return [[access_level,['set',path,public_value],['set',path,restricted_value]]];
    }else{
      return [[access_level,undefined,['set',path,restricted_value]]];
    }
  }

	function throw_if_any_invalid (ra,pa,al) {
		throw_if_invalid_scalar_or_undefined (ra);
		throw_if_invalid_scalar_or_undefined (pa);
		throw_if_invalid_scalar_or_undefined (al);
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

	set_from_vals.call(this,res_val, pub_val, access_lvl);

  this.access_level = function(){
    return access_level;
  };
	this.alter = function (r_v,p_v,a_l,path) { 
    return set_from_vals.call(this,r_v,p_v,a_l,path);
	};
  this.value = function(){
    return restricted_value;
  };
  this.debugValue = function(){
    return restricted_value+'/'+access_level+'/'+public_value;
  };
  this.toMasterPrimitives = function(path){
    return [['set',path,[restricted_value,public_value,access_level]]];
  }

	this.type = function () { return 'Scalar'; }
	this.destroy = function  () {
		public_value = undefined;
		restricted_value = undefined;
		access_level = undefined;
	}
}

function onChildTxn(name,onntxn,txnc){
  return function _onChildTxn(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
    var tp = deeparraycopy(txnprimitives);
    var dcp = deeparraycopy(datacopytxnprimitives);
    for(var i = 0; i<tp.length; i++){
      augmentpath(name,tp[i]);
    }
    for(var i = 0; i<dcp.length; i++){
      var _t = dcp[i];
      augmentpath(name,_t[1]);
      augmentpath(name,_t[2]);
    }
    txnc.inc();
    //console.log(txnalias,'firing on child',txnc.toString());
    onntxn.fire([],txnalias,tp,dcp,txnc.clone());
    //console.log(txnc.toString(),'fire done');
  };
};

function onChildFunctionality(name,onnf){
  return function(chldcollectionpath,functionalityalias,functionality){
    var path = chldcollectionpath.slice();
    path.unshift(name);
    //console.log('new Functionality',path,functionalityalias);
    onnf.fire(path,functionalityalias,functionality);
  };
}

function Collection(a_l){
  var access_level = a_l;
  this.access_level = function(){
    return access_level;
  };
	var data = {};

  this.debug = function(caption){
    console.log(caption,utils.inspect(data,false,null,true));
  };

	this.dataDebug = function () {
    var ret = {_key:access_level};
    for(var i in data){
      var _d = data[i];
      ret[i] = (_d.type() === 'Scalar') ? _d.debugValue() : _d.dataDebug();
    }
    return ret;
	}

	this.keys = function () {
		return Object.keys(data);
	}

	this.onNewTransaction = new HookCollection();
	this.onNewFunctionality = new HookCollection();

  this.setAccessLevel = function(a_l,path){
    if(access_level!==a_l){
      access_level = a_l;
      return this.toCopyPrimitives(path);
    }
  };

  this.remove = function(name){
    if(typeof data[name] !== 'undefined'){
      data[name].destroy();
      delete data[name];
    }
  };

  this.resetTxns = function(){
    var ret = [];
    for(var i in data){
      ret.push(['remove',[i]]);
    }
    return ret;
  };

  this.destroy = function(name){
    this.onNewTransaction.destruct();
    this.onNewFunctionality.destruct();
  };

	this.element = function(name){
    if(utils.isArray(name)){
      if(name.length<1){
        return this;
      }
      if(name.length===1){
        return data[name[0]];
      }
      if(data[name[0]]){
        return (data[name[0]]).element(name.slice(1));
      }
    }else{
      console.trace();
      throw "Path has to be an array "+JSON.stringify(name);
    }
  };
  this.toMasterPrimitives = function(path){
    path = path || [];
    var ret = [['set',path,access_level]];
    for(var i in data){
      var p = path.concat(i);
      Array.prototype.push.apply(ret,data[i].toMasterPrimitives(p));
    }
    return ret;
  };
  this.toCopyPrimitives = function(path){
    var ret = [];
    path = path || [];
    ret.push([access_level,['remove',path],['set',path,{}]]);
    for(var i in data){
      var p = path.concat(i);
      //ret = ret.concat(data[i].toCopyPrimitives(p));
      Array.prototype.push.apply(ret,data[i].toCopyPrimitives(p));
    }
    //console.log('copyPrimitives',utils.inspect(ret,false,null,false));
    return ret;
  };

	this.type = function () {return 'Collection';}

  var txnCounter = new BigCounter();
  this.txnCounterValue = function(){
    return txnCounter.value();
  };

  this.add = function(name,entity){
    throw_if_invalid_scalar(name);
    data[name+''] = entity;
    var toe = entity.type();
    if(toe==='Collection'){
      entity.onNewTransaction.attach(onChildTxn(name,this.onNewTransaction,txnCounter));
      entity.onNewFunctionality.attach(onChildFunctionality(name,this.onNewFunctionality));
    }
  };


  this.commit = (function(t,txnc){
    return function (txnalias,txnprimitives) {
      var datacopytxnprimitives = [];
      //console.log('performing',txnalias,txnprimitives);
      for (var i in txnprimitives) {
        var it = txnprimitives[i];
        //console.log('should perform',it);
        if (utils.isArray(it) && it.length) {
          //console.log('performing',it);
          var cpp = t['perform_'+it[0]](it[1], it[2], txnc);
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
      txnc.inc();
      //console.log(txnalias,'firing on self',txnc.toString());
      t.onNewTransaction.fire([],txnalias,txnprimitives,datacopytxnprimitives,txnc.clone());
      //console.log(txnc.toString(),'fire done');
    };
  })(this,txnCounter);

  this.dump = function(){
    return ['init',this.toMasterPrimitives(),this.toCopyPrimitives(),txnCounter.clone()];
  };
}

Collection.prototype.perform_set = function(path,param,txnc){
  var name = path.slice(-1);
  if(!name.length){
    if(param===null){
      param = undefined;
    }
    var to_p = typeof param;
    switch(to_p){
      case 'undefined':
      case 'string':
      case 'number':
        this.setAccessLevel(param);
        break;
      default:
        throw "Cannot add without a name in the path because "+to_p;
    }
  }
  //name = name[0];
  var target = this.element(path.slice(0,-1));
  var e = target.element(name);
  name = name[0];
  if(utils.isArray(param)){
    //Scalar case
    if (e){
      if(e.type()==='Scalar'){
        return e.alter(param[0],param[1],param[2],path);
      }else{
        throw "Cannot set scalar on "+path.join('/')+'/'+name+" that is of type "+e.type();
      }
    }
    if (target && target.add) {
      var ns = new Scalar(param[0],param[1],param[2]);
      target.add(name,ns);
      return ns.toCopyPrimitives(path);
    }else{
      console.trace();
      throw 'No collection at path '+path;
    }
  }else{
    //Collection case
    if (e){
     if(e.type()==='Collection'){
       return e.setAccessLevel(param,path);
     }else{
       throw "Cannot set key on "+path.join('/')+'/'+name+" that is of type "+e.type();
     }
    }
    if (target && target.add) {
      var nc = new Collection(param);
      target.add(name,nc);
      return nc.toCopyPrimitives(path);
    }else{
      console.trace();
      throw 'No collection at path '+path;
    }
  }
};

Collection.prototype.perform_remove = function (path) {
  if(!path.length){
    console.trace();
    throw "Cannot remove without a name in the path";
  }
  var target = this.element(path.slice(0,-1));
  if(target){
    target.remove(path.slice(-1));
    return [[this.access_level(),undefined,['remove',path]]];
  }
}

Collection.prototype.attach = function(functionalityname, config, key, environment){
  var self = this;
  var ret = config||{};
  var m;
  var fqnname;
  switch(typeof functionalityname){
    case 'string':
      m = require(functionalityname);
      fqnname = Path.basename(functionalityname);
      break;
    case 'object':
      m = functionalityname;
      fqnname = 'object';
      break;
    default:
      return;// {};
  }
  if(typeof m.errors !== 'object'){
    throw functionalityname+" does not have the 'errors' map";
  }
  var env;
	if ('string' === environment) {
		try{
			env= require(environment);
		}
		catch(e){}
	}else{
		env= environment;
	}
  
  function localerrorhandler(originalerrcb){
    var ecb = (typeof originalerrcb !== 'function') ? function(errkey,errparams,errmess){console.log('('+errkey+'): '+errmess)} : originalerrcb;
    return function(errorkey){
      if(!errorkey){
        ecb(0,'ok');
        return;
      }
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
      ecb(errorkey,errorparams,errmess);
    };
  };

	if ('function' === typeof(m.validate_config)) {
		if (!m.validate_config(config)) {
			console.log('Configuration validation failed, functionality: '+functionalityname, config);
			return null;
		}
	}	

	var my_mod = {};
	var SELF = (function(s,r,m){var _s=s,_r=r,_m=m;return function(){return {data:_s, self:_r, cbs: _m, consumeritf:ret.consumeritf};}})(self,ret,my_mod);
	if (m.requirements) {
		if (!env) {
			//console.log('NO environment, use defaults');
			env = m.requirements;
		}
		for (var j in m.requirements) {
			(function (_j) {
        var _e = env;
				if ('function' != typeof(env[_j]))  throw 'Requirements not met, missing '+j;
				//console.log('setting requirement '+j+' to '+functionalityname);
				my_mod[_j] = function () {
					return _e[_j].apply(SELF(), arguments);
				}
			})(j);
		}
		//console.log('Reqirement successfully set on: '+functionalityname);
	}

	for(var i in m){
		var p = m[i];
		if((typeof p !== 'function')) continue;
		ret[i] = (function(mname,_p){
			if (mname.charAt(0) == '_') {
				return function () {
					return _p.apply(SELF(), arguments);
				}
			}

			if(mname!=='init'){
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
										errcb('MISSING_PARAMETER',[mname,_ps[i]],'Paramobj for '+mname+' needs a value for '+_ps[i]);
                    return;
									}
								}
								pa.push(__p);
							}
						}
            pa.push(localerrorhandler(errcb),callername);
					}else{
            pa.push(localerrorhandler(errcb),callername);
          }
					_p.apply(SELF(),pa);
				};
			}else{
				return function(errcb,callername){
					_p.call(SELF(),localerrorhandler(errcb),callername);
				};
			}
		})(i,p);
		ret['__DESTROY__'] = function(){
			for(var i in ret){
				delete ret[i];
			}
			m = undefined;
			ret = undefined;
		};
	}

  if ('function' === typeof(ret.init)) { ret.init(); }
  this.onNewFunctionality.fire([fqnname],ret,key);
  return ret;
};

Collection.prototype.startHTTP = function(port,root){
  return this.attach('./consumer',{port:port,root:root},'system');
};

Collection.prototype.startReplicator = function(port){
  return this.attach(__dirname+'/replicator',{port:port});
};

function isInArray(elem,array){
  for(var i in array){
    if(array[i]===elem){
      return true;
    }
  }
  return false;
};

function filterDataCopyPrimitive(p,keys){
  //console.log(_p);
  var myp = p[(p[0] ? (isInArray(p[0],keys) ? 2 : 1) : 2)];
  /*
  if(_p[0]){
    console.log('private data for key',_p[0],'is',myp,'because',k);
  }
  if(typeof myp === 'undefined'){
    console.log(_p,k,myp);
  }
  console.log(p,keys,myp);
  */
  return myp;
}

Collection.prototype.maintainDataCopy = function(keys,datacopy){
  var cf = (function commitFn(dc,ks){
    return function(txnalias,txnid,datacopytxns){
      dc.commit(['start',txnalias,txnid]);
      for(var i in datacopytxns){
        var myp = filterDataCopyPrimitive(datacopytxns[i],ks);
        if(myp && myp.length){
          dc.commit(myp.slice());
        }else{
          //console.log(_p,k,myp);
        }
      }
      dc.commit(['end',txnalias]);
    };
  })(datacopy,keys.slice());
  var d = this.dump();
  cf('init',this.txnCounterValue(),d[2]);
  return this.onNewTransaction.attach(function(){
    cf(arguments[1],arguments[4],arguments[3].slice());
  });
};

function DeadCollection(){
  Collection.apply(this);
  this.add = function(){
  };
  this.remove = function(){
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
