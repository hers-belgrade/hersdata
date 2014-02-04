/// we should use portable version of HookCollection?
var utils = require('util');
var Path = require('path');
var net = require('net');
var BigCounter = require('./BigCounter');
var child_process = require('child_process');
var KeyRing = require('./keyring');
var ReplicatorCommunication = require('./replicatorcommunication');
var HookCollection = require('./hookcollection');
var SessionUser = require('./SessionUser');

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

function equals(a,b){
  if(typeof a === 'undefined' && typeof b === 'undefined'){
    return true;
  }
  return a===b;
}

function nullconversion(a){
  return (a===null) ? undefined : a;
}

function Scalar(res_val,pub_val, access_lvl) {

  var public_value = nullconversion(pub_val);
  var restricted_value = nullconversion(res_val);
  var access_level = nullconversion(access_lvl);

  this.changed = new HookCollection();
  this.destroyed = new HookCollection();

  function set_from_vals (ra,pa,al,path) {
    ra = nullconversion(ra);
    pa = nullconversion(pa);
    al = nullconversion(al);
    throw_if_any_invalid(ra,pa,al);
    if(equals(ra,restricted_value)&&equals(pa,public_value)&&equals(al,access_level)){
      return;
    }
    //console.trace();
    //console.log('[',public_value,restricted_value,access_level,'] changed to [',pa,ra,al,']');
    restricted_value = ra;
    public_value = pa;
    access_level = al;
    //console.log(this.changed.counter);
    this.changed.fire(this);
  }

  this.subscribeToValue = function(cb){
    if(typeof cb !== 'function'){return;}
    cb(this);
    var hook = this.changed.attach(cb);
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
  this.public_value = function(){
    return public_value;
  };
  this.debugValue = function(){
    return restricted_value+'/'+access_level+'/'+public_value;
  };
  this.toMasterPrimitives = function(path){
    return [['set',path,[restricted_value,public_value,access_level]]];
  }

  this.destroy = function  () {
    this.destroyed.fire();
    public_value = undefined;
    restricted_value = undefined;
    access_level = undefined;
    this.changed.destruct();
    this.destroyed.destruct();
  }
};
Scalar.prototype.type = function(){
  return 'Scalar';
};

function onChildTxn(name,onntxn,txnc,txnb,txne){
  return function _onChildTxn(chldcollectionpath,txnalias,txnprimitives,txnid){
    var tp = deeparraycopy(txnprimitives);
    for(var i = 0; i<tp.length; i++){
      augmentpath(name,tp[i]);
    }
    txnc.inc();
    //console.log(txnalias,'firing on child',txnc.toString());
    txnb.fire(txnalias);
    txne.fire(txnalias);
    onntxn.fire([],txnalias,tp,txnc.clone());
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

  this.newElement = new HookCollection();
  this.elementDestroyed = new HookCollection();

  this.onNewTransaction = new HookCollection();
  this.onNewFunctionality = new HookCollection();
  this.accessLevelChanged = new HookCollection();
  this.txnBegins = new HookCollection();
  this.txnEnds = new HookCollection();
  this.newReplica = new HookCollection();
  this.replicationInitiated = new HookCollection();
  this.newUser = new HookCollection();
  this.userOut = new HookCollection();
  this.destroyed = new HookCollection();

  this.setAccessLevel = function(a_l,path){
    if(a_l===null){a_l=undefined;}
    if(access_level!==a_l){
      access_level = a_l;
      this.accessLevelChanged.fire(access_level);
    }
  };

  this.remove = function(name){
    if(typeof data[name] !== 'undefined'){
      this.elementDestroyed.fire(name);
      data[name].destroy();
      delete data[name];
    }
  };

  this.traverseElements = function(cb){
    for(var i in data){
      var cbr = cb(i,data[i]);
      if(typeof cbr !== 'undefined'){
        return cbr;
      }
    }
  };

  this.subscribeToElements = function(cb){
    if(typeof cb !== 'function'){return;}
    this.traverseElements(cb);
    var onel = this.newElement.attach(cb);
    var ondel = this.elementDestroyed.attach(cb);
    var t = this;
    return {destroy:function(){
      t.newElement.detach(onel);
      t.elementDestroyed.detach(ondel);
    }};
  };

  this.destroy = function(){
    this.destroyed.fire();
    for(var i in data){
      this.remove(i);
      //data[i].destroy();
    }
    data = null;
    this.onNewTransaction.destruct();
    this.onNewFunctionality.destruct();
    this.accessLevelChanged.destruct();
    this.txnBegins.destruct();
    this.txnEnds.destruct();
    this.newReplica.destruct();
    this.replicationInitiated.destruct();
    this.newUser.destruct();
    this.userOut.destruct();
    this.destroyed.destruct();
    this.newElement.destruct();
    this.elementDestroyed.destruct();
    for(var i in this.functionalities){
      this.functionalities[i].f.__DESTROY__();
    }
    delete this.functionalities;
    for(var i in this){
      delete this[i];
    }
  };

  this.element = function(name){
    if(!data){return;}
    if(utils.isArray(name)){
      if(name.length<1){
        return this;
      }
      if(!data){
        return undefined;
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
    this.newElement.fire(key,entity);
    var toe = entity.type();
    if(toe==='Collection'){
      entity.onNewTransaction.attach(onChildTxn(name,this.onNewTransaction,txnCounter,this.txnBegins,this.txnEnds));
      entity.onNewFunctionality.attach(onChildFunctionality(name,this.onNewFunctionality));
    }
  };

  this._commit = (function(t,txnc){
    return function (txnalias,txnprimitives) {
      if(t.__commitunderway){
        if(!t.__commitstodo){
          t.__commitstodo=[[txnalias,txnprimitives]];
        }else{
          t.__commitstodo.push([txnalias,txnprimitives]);
        }
        return;
      }
      t.__commitunderway = true;
      //console.log('performing',txnalias,txnprimitives);
      t.txnBegins.fire(txnalias);
      for (var i in txnprimitives) {
        var it = txnprimitives[i];
        //console.log('should perform',it);
        if (utils.isArray(it) && it.length) {
          //console.log('performing',it);
          t['perform_'+it[0]](it[1], it[2], txnc);
        }
      }
      t.txnEnds.fire(txnalias);
      txnc.inc();
      //console.log(txnalias,'firing on self',txnc.toString());
      t.onNewTransaction.fire([],txnalias,txnprimitives,txnc.clone());
      delete t.__commitunderway;
      if(t.__commitstodo){
        if(t.__commitstodo.length){
          t._commit.apply(t,t.__commitstodo.shift());
        }else{
          delete t.__commitstodo;
        }
      }
      //console.log(txnc.toString(),'fire done');
    };
  })(this,txnCounter);

  this.userFactory = KeyRing;
  //console.log('created',process.memoryUsage().rss);
};

Collection.prototype.commit = function(txnalias,txnprimitives){
  this._commit(txnalias,txnprimitives);
};

Collection.prototype.type = function(){
  return 'Collection';
};

Collection.prototype.keys = function (){
  var ret = [];
  this.traverseElements(function(name){
    ret.push(name);
  });
  return ret;
};

Collection.prototype.pathToElement = function(name,path){
  path = path || [];
  return this.traverseElements(function(n,e){
    var tp = path.concat([n]);
    if(n===name){
      return tp;
    }else{
      var t = e.pathToElement ? e.pathToElement(name,tp) : undefined;
      if(t){
        return t;
      }
    }
  });
};

Collection.prototype.pathToScalar = function(name,value,path){
  path = path || [];
  var scalarsearch = this.traverseElements(function(n,e){
    var tp = path.concat([n]);
    if(e.type() === 'Scalar' && n===name && e.value()===value){
      return tp;
    }
  });
  if(scalarsearch){
    return scalarsearch;
  }
  return this.traverseElements(function(n,e){
    var tp = path.concat([n]);
    if(e.type()==='Collection'){
      var t = e.pathToScalar(name,value,tp);
      if(t){
        return t;
      }
    }
  });
};

Collection.prototype.pathToScalars = function(name,value,path){
  path = path || [];
  var ret = [];
  this.traverseElements(function(n,e){
    var tp = path.concat([n]);
    if(e.type() === 'Scalar' && n===name && e.value()===value){
      ret.push(tp);
    }
  });
  this.traverseElements(function(n,e){
    var tp = path.concat([n]);
    if(e.type()==='Collection'){
      var t = e.pathToScalars(name,value,tp);
      if(t.length){
        ret.push.apply(ret,t);
      }
    }
  });
  return ret;
};

Collection.prototype.resetTxns = function(){
  var ret = [];
  this.traverseElements(function(name){
    ret.push(['remove',[name]]);
  });
  return ret;
};

Collection.prototype.dump = function(forreplicatoken){
  var ret = {
    data:this.toMasterPrimitives(),
  };
  if(this.realms){
    var us = {};
    if(typeof forreplicatoken !== 'undefined' && typeof forreplicatoken.realmname !== 'undefined'){
      var r = this.realms[forreplicatoken.realmname];
      var rus = {};
      for(var _u in r){
        var __u = r[_u];
        if(__u.replicatorName===forreplicatoken.name){
          rus[_u] = __u.dump();
        }
      }
      us[forreplicatoken.realmname] = rus;
    }else{
      for(var _r in this.realms){
        var r = this.realms[_r];
        var rus = {};
        for(var _u in r){
          rus[_u] = r[_u].dump();
        }
        us[_r] = rus;
      }
    }
    ret.users = us;
  }
  return ret;
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
  if(!target){
    console.log(path.slice(0,-1),'gives no element');
    return;
  }
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
      return;
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
      return;
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
    target.remove(path[path.length-1]);
    return [[this.access_level(),undefined,['remove',path]]];
  }
};

Collection.prototype.setUser = function(username,realmname,roles,cb){
  if(typeof realmname === 'undefined'){
    console.log('cannot set user without a realmname');
    console.trace();
    return cb();
  }
  if(typeof username === 'undefined'){
    console.log('cannot set user without a username');
    console.trace();
    return cb();
  }
  if(!this.realms){
    console.log('cannot set user',username,realmname,'because there is no realms hash');
    cb();
    return;
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
    u = (this.userFactory.create)(this,username,realmname,roles);
    realm[username] = u;
    //console.log('firing newUser',u.username,u.realmname);
    this.newUser.fire(u);
    var t = this;
    u.destroyed.attach(function(){
      t.handleUserDestruction(u);
      delete realm[username];
    });
  }
  if(typeof cb === 'function'){
    cb(u);
  }
};

Collection.prototype.findUser = function(username,realmname,cb){
  if(!(this.realms&&this.realms[realmname])){
    cb();
    return;
  }
  var kr = this.realms[realmname][username];
  if(!kr){
    cb();
    return;
  }
  cb(kr);
};

Collection.prototype.removeUser = function(username,realmname){
  var rs = this.realms;
  if(!rs){return;}
  var realm = rs[realmname];
  if(!realm){return;}
  this.findUser(username,realmname,function(user){
    if(!user){return;}
    delete realm[username];
    user.destroy();
  });
};

Collection.prototype.handleUserDestruction = function(u){
  this.userOut.fire(u);
};

Collection.prototype.invoke = function(path,paramobj,username,realmname,roles,cb) {
  function exit(code,params,message){
    if(cb){
      cb(code,params,message);
    }else{
      console.log('invoke exited with',code,'for',path,paramobj);
    }
  }
  if(!path){return exit('NO_FUNCTIONALITY');}
  if(path.charAt(0)==='/'){
    path = path.substring(1);
  }
  path = path.split('/');
  if(!path.length){return exit('NO_FUNCTIONALITY');}
  var methodname = path[path.length-1];
  var functionalityname = path[path.length-2];
  //console.log(methodname);
	if (methodname.charAt(0) === '_' && username!=='*'){return exit('ACCESS_FORBIDDEN',[methodname],'You are not allowed to invoke '+methodname);}
  var targetpath = path.slice(0,-2);
  var target = this;
  while(targetpath.length){
    var tph = targetpath.splice(0,1);
    var _target = target.element(tph);
    if(_target){
      target = _target;
      if(target.realms){
        return target.invoke(path.slice(-(targetpath.length+2)).join('/'),paramobj,username,realmname,roles,cb);
      }else{
        //console.log(tph[0],'has no realms');
      }
    }else{
      break;
    }
  }
  if(target){
    if (username==='*'){
      if(this.replicatingClients && typeof this.replicatingClients[realmname] !== 'undefined'){
        username = realmname;
        realmname = '_dcp_';
      }else{
        return exit('ACCESS_FORBIDDEN',[realmname],'User * may come only from a replica');
      }
    }
    this.setUser(username,realmname,roles,function(u){
      if(!u){
        return exit('NO_USER',[username,realmname],'No user '+username+'@'+realmname+' found');
      }
      var f = target.functionalities[functionalityname];
      if(f){
        var key = f.key;
        if((typeof key !== 'undefined')&&(!u.contains(key))){
          return exit('ACCESS_FORBIDDEN',[key],'Functionality '+functionalityname+' is locked by '+key+' which you do not have');
        }
        f = f.f;
        var m = f[methodname];
        if(typeof m === 'function'){
          //console.log('invoking',path,paramobj,username,realmname,roles);
          //console.log('invoking',methodname,'for',username,'@',realmname,cb); 
          m(paramobj,cb,username,realmname);
        }else{
          return exit('NO_METHOD',[methodname,functionalityname],'Method '+methodname+' not found on '+functionalityname);
        }
      }else{
        console.log(functionalityname,'is not a functionalityname while processing',path);
        return exit('NO_FUNCTIONALITY',[functionalityname],'Functionality '+functionalityname+' does not exist here');
      }
    });
  }else{
    return exit('NO_DATA',path,'No data found');
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
    if(keyring.replicatorName && t.replicatingClients && t.replicatingClients[keyring.replicatorName]){
      console.log('broadcasting setKey for',username,realmname,'on key',key);
      t.replicatingClients[keyring.replicatorName].send({rpc:['setKey',username,realmname,key]});
    }
  });
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
    if(keyring.replicatorName && t.replicatingClients && t.replicatingClients[keyring.replicatorName]){
      console.log('broadcasting removeKey for',username,realmname,'on key',key);
      t.replicatingClients[keyring.replicatorName].send({rpc:['removeKey',username,realmname,key]});
    }
  });
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
    var ecb = (typeof originalerrcb !== 'function') ? function(errkey,errparams,errmess){if(errkey){console.log('('+errkey+'): '+errmess);}} : originalerrcb, _m=m;
    return function(errorkey){
      if(!errorkey){
        ecb(0,'ok');
        return;
      }
      var errorparams = Array.prototype.slice.call(arguments,1);
      if(typeof _m.errors[errorkey] !== 'object'){
        console.trace();
        throw 'Error key '+errorkey+' not specified in the error map';
      }
      var eo = _m.errors[errorkey];
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
                    if(errcb){
                      errcb('MISSING_PARAMETER',[mname,_ps[i]],'Paramobj for '+mname+' needs a value for '+_ps[i]);
                    }else{
                      console.log('paramobj provided to',mname,'is missing the value for',_ps[i]);
                    }
                    return;
                  }else{
                    __p = __pd;
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
  }
  ret['__DESTROY__'] = function(){
    delete self.functionalities[fqnname];
    self = null;
    for(var i in ret){
      delete ret[i];
    }
    m = undefined;
    ret = undefined;
  };

  if ('function' === typeof(ret.init)) { ret.init(); }
  this.functionalities[fqnname] = {f:ret,key:key};
  this.onNewFunctionality.fire([fqnname],ret,key);
  return ret;
};

Collection.prototype.getReplicatingUser = function(cb){
  if(this.replicatingUser){
    cb(this.replicatingUser);
    return;
  }
  var t=this,rul = this.replicationInitiated.attach(function(user){
    t.replicationInitiated.detach(rul);
    cb(user);
  });
};

Collection.prototype.createRemoteReplica = function(localname,name,realmname,url){
  if(!url){
    console.trace();
    throw "createRemoteReplica expects 4 params now";
  }
  this.add(localname,new (require('./RemoteCollectionReplica'))(name,realmname,url));
  //skipping the txn mechanism, it will be fired when the communication is established
};

Collection.prototype.closeReplicatingClient = function(replicatorname){
  if(!this.replicatingClients){return;}
  var rc = this.replicatingClients[replicatorname];
  if(!rc){
    console.log('no replicatingClient named',replicatorname,'to close');//'in',this.replicatingClients);
    return;
  }
  console.log('closing replicatingClient',replicatorname,'and detaching',rc.listener);
  delete this.replicatingClients[replicatorname];
  this.onNewTransaction.detach(rc.listener);
  rc.socket && rc.socket.destroy();
  for(var i in rc){
    delete rc[i];
  }
  rc = null;
};

Collection.prototype.openReplication = function(port){
  if(!this.realms){
    this.realms = {};
  }
  if(!this.functionalities.system){
    this.attach('./system',{});
  }
  var t = this;
  if(!this.replicatingOnPorts){
    this.replicatingOnPorts = [];
  }
  if(this.replicatingOnPorts.indexOf(port)>=0){
    return;
  }
  this.replicatingOnPorts.push(port);
  var server = net.createServer(function(c){
    var collection = t;
    var rc = new ReplicatorCommunication(t);
    rc.listenTo(c);
    function finalize(){
      c.removeAllListeners();
      c = null;
      if(rc.replicaToken){
        console.log('connection broke on',rc.replicaToken.name);
        collection.closeReplicatingClient(rc.replicaToken.name);
      }else{
        console.log('connection broke on',rc);
      }
    }
    c.on('error',finalize);
    c.on('end',finalize);
    c.on('close',finalize);
  });
  server.listen(port);
};

Collection.prototype.killAllProcesses = function () {
  while(this.processes && this.processes.length) {
    var p = this.processes.shift();
    p.send('die_right_now');
  }
};

Collection.prototype.setSessionUserFactory = function(){
  this.userFactory = {create:function(data,username,realmname,roles){
    return new SessionUser(data,username,realmname,roles);
  }};
  if(!this.realms){
    this.realms = {};
  }
};

Collection.prototype.startHTTP = function(port,root,name){
  name = name || 'local';
  if(!this.realms){
    this.realms = {};
  }
  if(!this.functionalities.system){
    this.attach('./system',{});
  }
  var cp = child_process.fork(__dirname+'/webserver.js',[port,root,name]);
  if (!this.processes) this.processes = [];
  this.processes.push (cp);

  var t = this;
  cp.on('message',function(input){
    //console.log('Web server says',input);
    t.processInput(this,input);
  });
  this.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
    cp.send({rpc:['_commit',txnalias,txnprimitives,txnid]});
  });
  process.on('uncaughtException',function(e){
		//console.log('===========', cp);
    console.log(e.stack);
    console.log(e);
		//no need to disconnect dead process
    //cp.disconnect();
  });
};

Collection.prototype.cloneFromRemote = function(remotedump,docreatereplicator){
  if(remotedump){
    var remotedata = remotedump.data;
    if(remotedata){
      this._commit('initDCPreplica',remotedata);
    }
    if(docreatereplicator){
      var tkn = remotedump.token;
      this.replicatingUser = (this.userFactory.create)(this,'*',tkn.name,'dcp,system,'+tkn.name);
      this.replicaToken = tkn;
    }
    var remoteusers = remotedump.users;
    for(var _rn in remoteusers){
      var r = remoteusers[_rn];
      for(var _un in r){
        var _u = r[_un];
        var _keys = _u.keys;
        this.setUser(_un,_rn,_u.roles,function(user){
          user.addKeys(_keys.split(','));
        });
      }
    }
  }
};

Collection.prototype.processInput = function(sender,input){
  var internal = input.internal;
  if(internal){
    switch(internal[0]){
      case 'need_init':
        //console.log('remote replica announcing as',internal[1],internal[2]);
        if(!this.replicatingClients){
          this.replicatingClients = {};
        }
        var srt = internal[1];
        if(!(srt && typeof srt === 'object')){
          sender.socket.destroy();
        }
        sender.replicaToken = srt;
        if(this.replicatingClients[sender.replicaToken.name]){
          //console.log('but it is a duplicate of',this.replicatingClients[sender.replicaToken.name]);
          //console.log('but it is a duplicate on',this.dataDebug());
          console.log('but it is a duplicate');
          //now what??
          //this.closeReplicatingClient(sender.replicaToken.name); //sloppy, leads to ping-pong between several replicas with the same name
          sender.send({internal:'give_up'});
          sender.socket.destroy();
          return;
        }
        this.replicatingClients[sender.replicaToken.name] = sender;
        this.cloneFromRemote(internal[2]);
        this.newReplica.fire(sender);
        var ret = this.dump(sender.replicaToken);
        ret.token = sender.replicaToken;
        sender.send({internal:['initDCPreplica',ret]});
        sender.listener = this.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
          sender.send({rpc:['_commit',txnalias,txnprimitives,txnid]});
        });
        break;
      case 'initDCPreplica':
        this.cloneFromRemote(internal[1],true);
        this.replicationInitiated.fire(this.replicatingUser);
        break;
      case 'going_down':
        console.log(sender.replicaToken.name,'going down');
        this.closeReplicatingClient(sender.replicaToken.name);
        break;
      case 'give_up':
        this.destroy(); 
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
    if(methodname==='invoke'){
      var t = this;
      var username = args[2],realmname= args[3],roles=args[4];
      if(!(username&&realmname)){
        console.log('invalid user',username,realmname);
        typeof args[args.length-1] === 'function' && args[args.length-1]('NO_USER');
        return;
      }
      this.setUser(username,realmname,roles,function(user){
        //console.log('remote rpc invoke set a User',username,realmname,'now setting replicatorName',sender.replicaToken.name);
        user.replicatorName = sender.replicaToken.name;
        method.apply(t,args);
      });
    }else{
      method.apply(this,args);
    }
  }
  var commandresult = input.commandresult;
  if(commandresult){
    if(commandresult.length){
      cbref = commandresult.splice(0,1)[0];
      var cb = this.cbs[cbref];
      //console.log('cb for',cbref,'is',cb);
      if(typeof cb === 'function'){
        cb.apply(null,commandresult);
        delete this.cbs[cbref];
      }
    }
  }
};

module.exports = {
  Scalar : Scalar,
  Collection : Collection,
  HookCollection : HookCollection
}
