/// we should use portable version of HookCollection?
var utils = require('util');
var Path = require('path');
var net = require('net');
var BigCounter = require('./BigCounter');
var child_process = require('child_process');
var ReplicatorCommunication = require('./replicatorcommunication');
var HookCollection = require('./hookcollection');
var UserBase = require('./userbase');
var Waiter = require('./bridge').Data_CollectionElementWaiter;

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
    txnc.inc();
    //txnb.fire(txnalias); //don't report txns that are not yours
    //txne.fire(txnalias);
    onntxn.fire([name].concat(chldcollectionpath),txnalias,txnprimitives,txnc.clone());
  };
};

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

  this.onNewTransaction = new HookCollection();
  this.accessLevelChanged = new HookCollection();
  this.txnBegins = new HookCollection();
  this.txnEnds = new HookCollection();
  this.newReplica = new HookCollection();
  this.replicationInitiated = new HookCollection();
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

  this.destroy = function(){
    this.destroyed.fire();
    for(var i in data){
      this.remove(i);
      //data[i].destroy();
    }
    data = null;
    this.onNewTransaction.destruct();
    this.accessLevelChanged.destruct();
    this.txnBegins.destruct();
    this.txnEnds.destruct();
    this.newReplica.destruct();
    this.replicationInitiated.destruct();
    this.destroyed.destruct();
    this.newElement.destruct();
    for(var i in this.functionalities){
      this.functionalities[i].f.__DESTROY__();
    }
    delete this.functionalities;
    for(var i in this){
      delete this[i];
    }
  };

  this.element = function(path,startindex,endindex){
    if(!data){return;}
    if(utils.isArray(path)){
      if(typeof startindex === 'undefined'){startindex=0;}
      if(typeof endindex === 'undefined'){endindex=path.length-1;}
      if(startindex>endindex){
        return this;
      }
      if(startindex===endindex){
        return data[path[startindex]];
      }
      if(data[path[startindex]]){
        return (data[path[startindex]]).element(path,startindex+1,endindex);
      }
    }else{
      console.trace();
      console.log('invalid path',path);
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
    }
  };

  this._commit = (function(t,txnc){
    return function (txnalias,txnprimitives,_txnc,targetpath) {
      if(targetpath && typeof targetpath === 'object' && targetpath instanceof Array){
        var el = this.element(targetpath);
        if(!el){
          return;
          console.log('no element to _commit on');
          process.exit(0);
        }
        el._commit(txnalias,txnprimitives);
        return;
      }
      if(t.__commitunderway){
        if(!t.__commitstodo){
          t.__commitstodo=[[txnalias,txnprimitives]];
        }else{
          t.__commitstodo.push([txnalias,txnprimitives]);
          console.log(t.__commitstodo.length,'pending');
        }
        return;
      }
      t.__commitunderway = true;
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
};

Collection.prototype.commit = function(txnalias,txnprimitives){
  this._commit(txnalias,txnprimitives);
};

Collection.prototype.type = function(){
  return 'Collection';
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
  if(typeof forreplicatoken !== 'undefined'){
    ret.users = UserBase.usersFromRealm(forreplicatoken);
  }
  return ret;
};

Collection.prototype.perform_set = function(path,param,txnc){
  if(!path.length){
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
    return;
  }
  //name = name[0];
  var target = this.element(path,0,path.length-2);
  if(!target){
    console.log(path,path.slice(0,-1),'gives no element');
    return;
  }
  var e = target.element(path,path.length-1,path.length-1);
  var name = path[path.length-1];
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
  var target = this.element(path,0,path.length-2);
  if(target){
    target.remove(path[path.length-1]);
    return [[this.access_level(),undefined,['remove',path]]];
  }
};

Collection.prototype.invoke = function(path,paramobj,username,realmname,roles,cb) {
  function exit(code,params,message){
    if(cb){
      cb(code,params,message);
    }else{
      console.log('invoke exited with',code,'for',path,paramobj);
    }
  }
  if(typeof path === 'string'){
    if(!path){return exit('NO_FUNCTIONALITY');}
    if(path.charAt(0)==='/'){
      path = path.substring(1);
    }
    path = path.split('/');
  }
  if(!path.length){return exit('NO_FUNCTIONALITY');}
  if(path.length>2){
    var targetpath = path.splice(0,1);
    var target = this.element(targetpath);
    if(!target){
      return exit('NO_TARGET',targetpath,'Path not found to invoke functionality');
    }else{
      return target.invoke(path,paramobj,username,realmname,roles,cb);
    }
  }
  var methodname = path[path.length-1];
  var functionalityname = path[path.length-2];
  //console.log(methodname);
	if (methodname.charAt(0) === '_' && username!=='*'){return exit('ACCESS_FORBIDDEN',[methodname],'You are not allowed to invoke '+methodname);}
  if (username==='*'){
    if(this.replicatingClients && typeof this.replicatingClients[realmname] !== 'undefined'){
      username = realmname;
      realmname = '_dcp_';
    }else{
      return exit('ACCESS_FORBIDDEN',[realmname],'User * may come only from a replica');
    }
  }
  var u = UserBase.setUser(username,realmname,roles);
  if(!u){
    return exit('NO_USER',[username,realmname],'No user '+username+'@'+realmname+' found');
  }
  var f = this.functionalities[functionalityname];
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
};

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
  var SELF = (function(s,r,m){var _s=s,_r=r,_m=m;return function(){return {data:_s, self:_r, cbs: _m, consumeritf:UserBase};}})(self,ret,my_mod);
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

Collection.prototype.createRemoteReplica = function(localname,name,realmname,url,skipdcp){
  if(!url){
    console.trace();
    throw "createRemoteReplica expects 4 params now";
  }
  this.add(localname,new (require('./RemoteCollectionReplica'))(name,realmname,url,skipdcp));
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
  var rcc = 0;
  for(var i in this.replicatingClients){
    rcc++;
  }
  if(!rcc){
    UserBase.keySet.detach(this.userBaseKeySet);
    UserBase.keyRemoved.detach(this.userBaseKeyRemoved);
  }
};

Collection.prototype.openReplication = function(port){
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

Collection.prototype.startHTTP = function(port,root,name){
  name = name || 'local';
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
    cp.send({rpc:['_commit',txnalias,txnprimitives,txnid,chldcollectionpath]});
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
      this.replicatingUser = UserBase.setUser('*',tkn.name,'dcp,system,'+tkn.name);
      this.replicaToken = tkn;
    }
    var remoteusers = remotedump.users;
    for(var _rn in remoteusers){
      var r = remoteusers[_rn];
      for(var _un in r){
        var _u = r[_un];
        var _keys = _u.keys;
        (UserBase.setUser(_un,_rn,_u.roles)).addKeys(_keys.split(','));
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
        var t = this;
        this.userBaseKeySet = UserBase.keySet.attach(function(user,key){
          if(user.replicator){
            try{
              replicator.send({internal:['setKey',user.username,user.realmname,key]});
            }
            catch(e){
              delete user.replicator;
            }
          }
        });
        this.userBaseKeyRemoved = UserBase.keyRemoved.attach(function(user,key){
          if(user.replicator){
            try{
              replicator.send({internal:['removeKey',user.username,user.realmname,key]});
            }
            catch(e){
              delete user.replicator;
            }
          }
        });
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
        var dodcp = !sender.replicaToken.skipdcp;
        if(dodcp){
          this.cloneFromRemote(internal[2]);
        }
        this.newReplica.fire(sender);
        var ret = dodcp ? this.dump(sender.replicaToken) : {};
        ret.token = sender.replicaToken;
        sender.send({internal:['initDCPreplica',ret]});
        if(dodcp){
          sender.listener = this.onNewTransaction.attach(function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
            sender.send({rpc:['_commit',txnalias,txnprimitives,txnid,chldcollectionpath]});
          });
        }
        break;
      case 'initDCPreplica':
        this.cloneFromRemote(internal[1],true);
        this.replicationInitiated.fire(this.replicatingUser);
        break;
      case 'setKey':
        UserBase.setKey(internal[1],internal[2],internal[3]);
        break;
      case 'removeKey':
        UserBase.removeKey(internal[1],internal[2],internal[3]);
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
      (UserBase.setUser(username,realmname,roles)).replicator= sender;
      method.apply(t,args);
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
        if(!(this.persist && this.persist[cbref])){
          delete this.cbs[cbref];
        }
      }
    }
  }
};

Collection.prototype.waitFor = function(querypath,cb,waiter,startindex){
  waiter = waiter||this;
  startindex = startindex||0;
  var el = this.element([querypath[startindex]]);
  if(el && el.type() === 'Collection'){
    el.waitFor(querypath,cb,waiter,startindex+1);
    return;
  }
  new Waiter(waiter,this,startindex ? querypath.splice(startindex) : querypath,cb);
};

Collection.prototype.setFollower = function(username,realmname,roles){
  if(!this.consumer){
    this.consumer = new(require('./dataconsuming'))(this,[]);
  }
  var u = UserBase.setUser(username,realmname,roles);
  if(u){
    this.consumer.upgradeUserToConsumer(u);
  }
};

module.exports = {
  Scalar : Scalar,
  Collection : Collection,
  HookCollection : HookCollection
}
