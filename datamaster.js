/// we should use portable version of HookCollection?
var utils = require('util');
var Path = require('path');
var net = require('net');
var BigCounter = require('./BigCounter');
var child_process = require('child_process');
var KeyRing = require('./keyring');
var ReplicatorCommunication = require('./replicatorcommunication');
var HookCollection = require('./hookcollection');

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

function throw_if_any_invalid (ra,pa,al) {
  throw_if_invalid_scalar_or_undefined (ra);
  throw_if_invalid_scalar_or_undefined (pa);
  throw_if_invalid_scalar_or_undefined (al);
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

  this.changed = new HookCollection();
  destroyed = new HookCollection();

	function set_from_vals (ra,pa,al,path) {
    ra = (ra===null) ? undefined : ra;
    pa = (pa===null) ? undefined : pa;
    al = (al===null) ? undefined : al;
		throw_if_any_invalid(ra,pa,al);
    if((ra===restricted_value)&&(pa===public_value)&&(al===access_level)){
      return;
    }
		restricted_value = ra;
		public_value = pa;
		access_level = al;
    this.changed.fire();
    return this.toCopyPrimitives(path);
	}

  this.subscribeToValue = function(cb){
    if(typeof cb !== 'function'){return;}
    cb(this);
    var t = this;
    var hook = this.changed.attach(function(){cb(t);});
    return {destroy:function(){this.changed&&this.changed.detach(hook);}};
  };

	set_from_vals.call(this,res_val, pub_val, access_lvl);

  this.access_level = function(){
    return access_level;
  };
	this.alter = function (r_v,p_v,a_l,path) { 
    r_v = (r_v===null) ? undefined : r_v;
    p_v = (p_v===null) ? undefined : p_v;
    a_l = (a_l===null) ? undefined : a_l;
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

	this.destroy = function  () {
		public_value = undefined;
		restricted_value = undefined;
		access_level = undefined;
    destroyed.fire();
    this.changed.destruct();
    destroyed.destruct();
	}
};
Scalar.prototype.type = function(){
  return 'Scalar';
};

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
  this.functionalities = {};

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

  var onNewElement = new HookCollection();

	this.onNewTransaction = new HookCollection();
	this.onNewFunctionality = new HookCollection();

  this.setAccessLevel = function(a_l,path){
    if(a_l===null){a_l=undefined;}
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

  this.traverseElements = function(cb){
    for(var i in data){
      cb(i,data[i]);
    }
  };

  this.subscribeToElements = function(cb){
    if(typeof cb !== 'function'){return;}
    this.traverseElements(cb);
    var onel = onNewElement.attach(cb);
    return {destroy:function(){
      onNewElement.detach(onel);
    }};
  };

  this.destroy = function(name){
    for(var i in data){
      data[i].destroy();
    }
    data = null;
    this.onNewTransaction.destruct();
    this.onNewFunctionality.destruct();
    onNewElement.destruct();
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
      console.log('invalid path',name);
      throw "Path has to be an array";
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

  var txnCounter = new BigCounter();
  this.txnCounterValue = function(){
    return txnCounter.value();
  };

  this.add = function(name,entity){
    throw_if_invalid_scalar(name);
    var key = name+'';
    if(data[key]){
      data[key].destroy();
    }
    data[key] = entity;
    onNewElement.fire(key,entity);
    var toe = entity.type();
    if(toe==='Collection'){
      entity.onNewTransaction.attach(onChildTxn(name,this.onNewTransaction,txnCounter));
      entity.onNewFunctionality.attach(onChildFunctionality(name,this.onNewFunctionality));
    }
  };

  this._commit = (function(t,txnc){
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
  this.userFactory = KeyRing;
};

Collection.prototype.commit = function(txnalias,txnprimitives){
  this._commit(txnalias,txnprimitives);
};

Collection.prototype.type = function(){
	return 'Collection';
};

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
      if(param===null){param = undefined;}
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
};

Collection.prototype.setUser = function(username,realmname,roles,cb){
  if(!this.realms){
    this.realms = {};
  }
  var realm = this.realms[realmname];
  if(!realm){
    realm = {};
    this.realms[realmname] = realm;
  }
  var u = realm[username];
  if(!u){
    //console.log(username+'@'+realmname,'not found');
    var kr = (this.userFactory.create)(this,username,realmname);
    roles = roles||'';
    kr.addKeys(roles.split(','));
    u = kr;
    realm[username] = u;
  }
  if(typeof cb === 'function'){
    cb(u);
  }
};

Collection.prototype.findUser = function(username,realmname,cb){
  if(!(this.realms&&this.realms[realmname])){
    throw "User "+username+"@"+realmname+" cannot be found because the corresponding Collection has no realm named "+realmname;
  }
  //console.log(this.realms[realmname]);
  var kr = this.realms[realmname][username];
  if(!kr){
    throw "Username "+username+"@"+realmname+" cannot be found because the corresponding Collection's realm "+realmname+" has no user named "+username;
  }
  cb(kr);
};

Collection.prototype.removeUser = function(username,realmname){
  if(!this.realms){return;}
  var realm = this.realms[realmname];
  if(!realm){return;}
  realm[username].destroy();
  delete realm[username];
};

Collection.prototype.invoke = function(path,paramobj,username,realmname,roles,cb) {
  path = path.split('/');
  if(!path.length){return cb('NO_FUNCTIONALITY');}
  var methodname = path[path.length-1];
  //console.log(methodname);
	if (methodname.charAt(0) === '_'){return cb('ACCESS_FORBIDDEN');}
  var target = this.element(path.slice(0,-2));
  if(target){
    this.setUser(username,realmname,roles,function(u){
      if(!u){return cb('NO_USER');}
      var f = target.functionalities[path[path.length-2]];
      if(f){
        var key = f.key;
        if((typeof key !== 'undefined')&&(!u.contains(key))){
          return cb('ACCESS_FORBIDDEN');
        }
        f = f.f;
        var m = f[methodname];
        if(typeof m === 'function'){
          //console.log('invoking',methodname,'for',username,'@',realmname,this.realms); 
          m(paramobj,cb,username,realmname);
        }
      }else{
        return cb('NO_FUNCTIONALITY');
      }
    });
  }else{
    return cb('NO_FUNCTIONALITY');
  }
};

Collection.prototype.setKey = function(username,realmname,key){
  if(!key){
    throw "realmname problem?";
  }
  //console.trace();
  //console.log('setting key',key,'for',username+'@'+realmname);
  var t = this;
  this.findUser(username,realmname,function(keyring){
    //console.log('setting key',key,'for',username+'@'+realmname,keyring);
    keyring && keyring.addKey(key,t);
  });
  if(this.replicatingClients){
    for(var i in this.replicatingClients){
      var rc = this.replicatingClients[i];
      if(rc._realmname === realmname){
        //console.log('sending',key,'to set for',realmname);
        rc.send({rpc:['setKey',username,realmname,key]});
      }
    }
  }
};

Collection.prototype.removeKey = function(username,realmname,key){
  if(!key){
    throw "realmname problem?";
  }
  var t = this;
  //console.trace();
  //console.log('removing key',key,'for',username+'@'+realmname);
  this.findUser(username,realmname,function(keyring){
    keyring && keyring.removeKey(key,t);
  });
  if(this.replicatingClients){
    for(var i in this.replicatingClients){
      var rc = this.replicatingClients[i];
      if(rc._realmname === realmname){
        //console.log('sending',key,'to remove for',realmname);
        rc.send({rpc:['removeKey',username,realmname,key]});
      }
    }
  }
};

Collection.prototype.attach = function(functionalityname, config, key, environment, consumeritf){
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
    var ecb = (typeof originalerrcb !== 'function') ? function(errkey,errparams,errmess){if(errkey){console.log('('+errkey+'): '+errmess);}} : originalerrcb;
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
	var SELF = (function(s,r,m,ci){var _s=s,_r=r,_m=m,_ci=ci;return function(){return {data:_s, self:_r, cbs: _m, consumeritf:_ci};}})(self,ret,my_mod,consumeritf||self);
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
				};
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
				return function(obj,errcb,callername,realmname){
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
            pa.push(localerrorhandler(errcb),callername,realmname);
					}else{
            pa.push(localerrorhandler(errcb),callername,realmname);
          }
					_p.apply(SELF(),pa);
				};
			}else{
				return function(errcb,callername,realmname){
					_p.call(SELF(),localerrorhandler(errcb),callername,realmname);
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
  this.functionalities[fqnname] = {f:ret,key:key};
  this.onNewFunctionality.fire([fqnname],ret,key);
  return ret;
};

Collection.prototype.createRemoteReplica = function(localname,realmname,url){
  this.add(localname,new (require('./RemoteCollectionReplica'))(realmname,url));
  //skipping the txn mechanism, it will be fired when the communication is established
};

Collection.prototype.openReplication = function(port){
  var t = this;
  var server = net.createServer(function(c){
    var rp = c.remotePort;
    var collection = t;
    var rc = new ReplicatorCommunication(t);
    rc.listenTo(c);
    c.on('error',function(){
      delete collection.replicatingClients[rp];
    });
    c.on('end',function(){
      delete collection.replicatingClients[rp];
    });
    collection.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
      rc.send({rpc:['_commit',txnalias,txnprimitives,txnid]});
    });
  });
  server.listen(port);
};

Collection.prototype.startHTTP = function(port,root,name){
  name = name || 'local';
  var cp = child_process.fork(__dirname+'/webserver.js',[port,root,name]);
  var t = this;
  cp.on('message',function(input){
    //console.log('Web server says',input);
    var _t = t,sender=this;
    setTimeout(function(){_t.processInput(sender,input);},1);
  });
  this.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
    cp.send({rpc:['_commit',txnalias,txnprimitives,txnid]});
  });
  process.on('uncaughtException',function(e){
    console.log(e.stack);
    console.log(e);
    cp.disconnect();
  });
  //return this.attach('./consumer',{port:port,root:root},'system');
};

Collection.prototype.processInput = function(sender,input){
  var internal = input.internal;
  if(internal){
    switch(internal[0]){
      case 'need_init':
        if(!this.replicatingClients){
          this.replicatingClients = {};
        }
        sender._realmname = internal[1];
        this.replicatingClients[sender._realmname] = sender;
        sender.send({rpc:['_commit','init',this.toMasterPrimitives()]});
        break;
    }
  }
  var rpc = input.rpc;
  if(rpc){
    var methodname = rpc[0];
    var method = this[methodname];
    if(typeof method !=='function'){
      console.log(methodname,'does not exist');
      return;
    }
    var args = rpc.slice(1);
    var lastparam = rpc[rpc.length-1];
    if(typeof lastparam === 'string' && lastparam.indexOf('#FunctionRef:')===0){
      var fnref = lastparam.slice(13);
      //console.log('#FunctionRef',fnref);
      args[args.length-1] = function(){
        var args = Array.prototype.slice.call(arguments);
        args.unshift(fnref);
        //console.log('sending commandresult',args);
        sender.send({commandresult:args});
      };
    }
    //console.log('invoking',methodname,args,method);
    method.apply(this,args);
  }
  var commandresult = input.commandresult;
  if(commandresult){
    if(commandresult.length){
      cbref = commandresult.splice(0,1)[0];
      var cb = this.cbs[cbref];
      if(typeof cb === 'function'){
        cb(commandresult);
        delete this.cbs[cbref];
      }
    }
  }
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
