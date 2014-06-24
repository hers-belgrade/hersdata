var utils = require('util');
var throw_if_invalid_scalar = require('./helpers').throw_if_invalid_scalar;
var Path = require('path');
var net = require('net');
var BigCounter = require('./BigCounter');
var child_process = require('child_process');
var ReplicatorSocketCommunication = require('./ReplicatorSocketCommunication');
var HookCollection = require('./hookcollection');
var Waiter = require('./bridge').Data_CollectionElementWaiter;
var SuperUser = require('./SuperUser');
var Scalar = require('./Scalar');
var User = require('./User');
var __CollectionCount = 0;

function onChildTxn(name,onntxn,txnc,txnb,txne){
  return function _onChildTxn(chldcollectionpath,txnalias,txnprimitives,txnid){
    txnc.inc();
    //txnb.fire(txnalias); //don't report txns that are not yours
    //txne.fire(txnalias);
    onntxn.fire([name].concat(chldcollectionpath),txnalias,txnprimitives,txnc.clone());
  };
};

function Collection(a_l){
  __CollectionCount++;
  var access_level = a_l;
  this.access_level = function(){
    return access_level;
  };
  var data = {};
  //this.functionalities = {};

  this.debug = function(caption){
    console.log(caption,utils.inspect(data,false,null,true));
  };

  this.access_level = function(){
    return access_level;
  };

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
      this.handleAccessLevelChanged(access_level);
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

  this._destroyData = function(){
    for(var i in data){
      this.remove(i);
    }
    data = null;
  };

  this.elementRaw = function(elemname){
    return data[elemname];
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
    this.handleNewElement(key,entity);
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
      //console.log('txnBegins',txnalias);
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
      //console.log('txnEnds',txnalias);
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

Collection.prototype.destroy = function(){
  if(!this._destroyData){return;}
  this._destroyData();
  this.destroyed.fire(this);
  this.destroyed.destruct();
  this.replicationInitiated.destruct();
  this.newReplica.destruct();
  this.txnEnds.destruct();
  this.txnBegins.destruct();
  this.accessLevelChanged.destruct();
  this.onNewTransaction.destruct();
  this.newElement.destruct();
  for(var i in this.functionalities){
    //console.log('__DESTROY__ing',i);
    this.functionalities[i].f.__DESTROY__();
  }
  for(var i in this){
    delete this[i];
  }
  __CollectionCount--;
};

Collection.prototype.commit = function(txnalias,txnprimitives){
  this._commit(txnalias,txnprimitives);
};

Collection.prototype.type = function(){
  return 'Collection';
};

Collection.prototype.dataDebug = function () {
  var ret = {_key:this.access_level()};
  this.traverseElements(function(name,el){
    ret[name] = (el.type() === 'Scalar') ? el.debugValue() : el.dataDebug();
  });
  return ret;
};

Collection.prototype.toMasterPrimitives = function(path){
  path = path || [];
  var ret = [['set',path,access_level]];
  this.traverseElements(function(name,el){
    var p = path.concat(name);
    Array.prototype.push.apply(ret,el.toMasterPrimitives(p));
  })
  return ret;
};

Collection.prototype.element = function(path,startindex,endindex){
  if(!this.destroyed){return;}
  if(utils.isArray(path)){
    if(typeof startindex === 'undefined'){startindex=0;}
    if(typeof endindex === 'undefined'){endindex=path.length-1;}
    if(startindex>endindex){
      return this;
    }
    var d = this.elementRaw(path[startindex]);
    if(startindex===endindex){
      return d;
    }
    if(d){
      return d.element(path,startindex+1,endindex);
    }
  }else{
    console.trace();
    console.log('invalid path',path);
    throw "Path has to be an array";
  }
};

Collection.prototype.handleAccessLevelChanged = function(access_level){
  this.accessLevelChanged.fire(access_level);
};

Collection.prototype.handleNewElement = function(elname,el){
  this.newElement.fire(elname,el);
};

Collection.prototype.instanceCounts = function(){
  return {scalars:Scalar.__instanceCount, collections: __CollectionCount};
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
    if(name==='__requirements'){return;}
    ret.push(['remove',[name]]);
  });
  return ret;
};

Collection.prototype.dump = function(forreplicatoken){
  var ret = {
    //data:this.toMasterPrimitives(),
  };
  /*
  if(typeof forreplicatoken !== 'undefined'){
    ret.users = this.usersFromRealm(forreplicatoken);
  }
  */
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
    console.trace();
    console.log(path,path.slice(0,-1),'gives no element');
    throw 'no element'
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
        console.trace();
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

Collection.prototype.run = function(path,paramobj,cb,user){
  var methodname = path[path.length-1];
  var functionalityname = path[path.length-2];
  //console.log(methodname);
	if (methodname.charAt(0) === '_' && user.username().charAt(0)!=='*'){
    cb && cb('ACCESS_FORBIDDEN',[methodname],'You are not allowed to invoke '+methodname);
    return;
  }
  var f = this.functionalities && this.functionalities[functionalityname];
  if(f){
    var key = f.key;
    if((typeof key !== 'undefined')&&(!user.contains(key))){
      cb && cb('ACCESS_FORBIDDEN',[key],'Functionality '+functionalityname+' is locked by '+key+' which you do not have');
      return;
    }
    f = f.f;
    var m = f[methodname];
    if(typeof m === 'function'){
      //console.log('invoking',methodname,'for',user.fullname(),cb); 
      m(paramobj,cb,user);
    }else{
      cb && cb('NO_METHOD',[methodname,functionalityname],'Method '+methodname+' not found on '+functionalityname);
      return;
    }
  }else{
    //console.trace();
    console.log(functionalityname,'is not a functionalityname while processing',path);
    //console.log(this.dataDebug());
    cb && cb('NO_FUNCTIONALITY',[functionalityname],'Functionality '+functionalityname+' does not exist here');
    return;
  }
};

Collection.prototype.takeBid = function(path,paramobj,cb,user){
  if(!path.length){
    cb && cb('VOID_REQUIREMENT');
    return;
  }
  var rn = path[path.length-1];
  var re = this.element(['__requirements',rn]);
  if(!(re && re.functionalities && re.functionalities.requirement.f)){
    console.log('no requirement',rn,'on',this.dataDebug(),'=>',re?re.dataDebug():'','with',path);
    cb && cb('NO_REQUIREMENT',[rn],'Requirement '+rn+' does not exist');
    return;
  }
  re.functionalities.requirement.f.bid(paramobj,cb,user);
};

Collection.prototype.takeOffer = function(path,paramobj,cb,user){
  if(!path.length){
    cb && cb('VOID_REQUIREMENT');
    return;
  }
  var rn = path[path.length-1];
  var re = this.element(['__requirements',rn]);
  if(!(re && re.functionalities.requirement.f)){
    console.log('no requirement',rn,'on',this.dataDebug());
    cb && cb('NO_REQUIREMENT',[rn],'Requirement '+rn+' does not exist');
    return;
  }
  re.functionalities.requirement.f.offer(paramobj,cb,user);
};

function __doParams(mname,_p,localerrorhandler,obj,errcb,caller){
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
        console.trace();
        throw 'First parameter to '+mname+' has to be an object with the following keys: '+_ps.join(',')
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
    pa.push(localerrorhandler(errcb),caller);
  }else{
    pa.push(localerrorhandler(errcb),caller);
  }
  return pa;
};

Collection.prototype.attach = function(functionalityname, config, key){
  var self = this;
  if(!key){key=undefined;}
  var ret = config||{};
  var m;
  var fqnname;
  switch(typeof functionalityname){
    case 'string':
      m = require(functionalityname);
      fqnname = Path.basename(functionalityname);
      break;
    case 'object':
      if(functionalityname.functionalityname && functionalityname.instancename){
        fqnname = functionalityname.instancename;
        m = require(functionalityname.functionalityname);
      }else{
        m = functionalityname;
        fqnname = 'object';
      }
      break;
    default:
      return;// {};
  }
  if(typeof m.errors !== 'object'){
    throw functionalityname+" does not have the 'errors' map";
  }
  
  function localerrorhandler(originalerrcb){
    var ecb = (typeof originalerrcb !== 'function') ? function(errkey,errparams,errmess){return;if(errkey){console.log('('+errkey+'): '+errmess);}} : originalerrcb, _m=m;
    var ret =  function(errorkey){
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
    return ret;
  };

  if ('function' === typeof(m.validate_config)) {
    if (!m.validate_config(config)) {
      console.log('Configuration validation failed, functionality: '+functionalityname, config);
      return null;
    }
  } 

  var req,off,reqs, close;
  if (m.requirements) {
    if(!self.element(['__requirements'])){
      self.commit('requirements_create',[
        ['set',['__requirements']]
      ]);
    }
    var re = self.element(['__requirements']);
    reqs = {}; 
    re.attach('./requirements',{requirements:reqs});
    var rf = re.functionalities.requirements.f;
    req = rf.start;
    off = rf.startwoffer;
    close = rf._close;
  }
  var SELF = (function(s,r,su,rq,off,close){var _close = close,_s=s,_r=r,_su=su, _req=rq, _offer=off;return function(){return {data:_s, self:_r, superUser:_su, openBid:_req, closeBid:close, offer:_offer};}})(self,ret,new SuperUser(self,null,null,fqnname,'dcp'),req,off, close);
  if(req){
    for(var i in m.requirements){
      var r = m.requirements[i];
      var myr = {};
      for(var f in r){
        myr[f] = (function(_f){
          var f = _f;
          return function(){f.apply(SELF(),arguments);};
        })(r[f]);
      }
      reqs[i] = myr;
    }
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
        return function(obj,errcb,caller){
          _p.apply(SELF(),__doParams(mname,_p,localerrorhandler,obj,errcb,caller));
        };
      }else{
        return function(errcb,caller){
          _p.call(SELF(),localerrorhandler(errcb),caller);
        };
      }
    })(i,p);
  }
  ret['__DESTROY__'] = function(){
    var f = self.functionalities[fqnname];
    if(f){
      var ret = f.ret;
      delete f.ret;
      delete f.key;
      delete self.functionalities[fqnname];
      for(var i in ret){
        delete ret[i];
      }
    }
    self = null;
    SELF = null;
  };

  if ('function' === typeof(ret.init)) { ret.init(); }
  if(!this.functionalities){
    this.functionalities = {};
  }
  this.functionalities[fqnname] = {f:ret,key:key};
  return ret;
};

Collection.prototype.setSessionUserFunctionality = function(config,requirements){
  this.attach('./sessionuserfunctionality',config,'dcp',requirements);
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
  if(this.element([localname])){return;}
  if(!url){
    console.trace();
    throw "createRemoteReplica expects 4 params now";
  }
  if(url==='local'){
    this.add(localname,new (require('./ChildProcessCollectionReplica'))(realmname,skipdcp));
  }else{
    this.add(localname,new (require('./RemoteCollectionReplica'))(name,realmname,url,skipdcp));
  }
};

Collection.prototype.closeReplicatingClient = function(replicatorname){
  if(!this.replicatingClients){return;}
  var rc = this.replicatingClients[replicatorname];
  if(!rc){
    console.log('no replicatingClient named',replicatorname,'to close');//'in',this.replicatingClients);
    return;
  }

  console.log('closing replicatingClient',replicatorname);
  rc.destroy();
  delete this.replicatingClients[replicatorname];
  rc = null;
  var rcc = 0;
  for(var i in this.replicatingClients){
    rcc++;
  }
};

Collection.prototype.openReplication = function(port){
  if(!(this.functionalities && this.functionalities.system)){
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
    var rc = new ReplicatorSocketCommunication(t);
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

Collection.prototype.startHTTP = function(port,root,name,modulename){
  name = name || 'local';
  if(!(this.functionalities && this.functionalities.system)){
    this.attach('./system',{});
  }
  var cp = new (require('./ReplicatorChildProcessCommunication').Parent)(this);
  cp.listenTo(child_process.fork(__dirname+'/WebServer.js',[port,root,name,modulename]));
  if (!this.processes) this.processes = [];
  this.processes.push (cp);
};

Collection.prototype.cloneFromRemote = function(remotedump,docreatereplicator){
  if(remotedump){
    var remotedata = remotedump.data;
    if(remotedata){
      //this._commit('initDCPreplica',remotedata);
    }
    if(docreatereplicator){
      var tkn = remotedump.token;
      console.log('cloned from remote',tkn);
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
        console.log('remote replica announcing as',internal[1],internal[2]);
        if(!this.replicatingClients){
          this.replicatingClients = {};
        }
        var srt = internal[1];
        if(!(srt && typeof srt === 'object')){
          sender.socket.destroy();
        }
        sender.replicaToken = srt;
        if(this.replicatingClients[sender.replicaToken.name]){
          console.log('but it is a duplicate, I already have');
          for(var i in this.replicatingClients){
            console.log(i);
          }
          //now what??
          //this.closeReplicatingClient(sender.replicaToken.name); //sloppy, leads to ping-pong between several replicas with the same name
          sender.send('internal','give_up');
          sender.socket && sender.socket.destroy();
          return;
        }
        this.replicatingClients[sender.replicaToken.name] = sender;
        var dodcp = !sender.replicaToken.skipdcp;
        if(dodcp){
          this.cloneFromRemote(internal[2]);
        }
        sender.createSuperUser(sender.replicaToken);
        var ret = dodcp ? this.dump(sender.replicaToken) : {};
        var rtn = sender.replicaToken.name;
        ret.token = sender.replicaToken;
        var reviv = [];
        User.Traverse(function(u){
          if(u.server === rtn){
            var ud = {username:u.username(),realmname:u.realmname(),roles:u.roles()};
            var engs = [];
            for(var i in u.engagements){
              engs.push(u.engagements[i].dumpEngagementInfo());
            }
            ud.engagements = engs;
            reviv.push(ud);
          }
        });
        ret.revive = reviv;
        sender.send('internal','initDCPreplica',ret);
        if(dodcp){
          sender.createListener('dataTxn',function(chldcollectionpath,txnalias,txnprimitives,datacopytxnprimitives,txnid){
            sender.send('rpc','_commit',txnalias,txnprimitives,txnid,chldcollectionpath);
          },this.onNewTransaction);
        }
        this.newReplica.fire(sender);
        break;
      case 'initDCPreplica':
        this.cloneFromRemote(internal[1],true);
        this.replicatingUser = sender.createSuperUser(this.replicaToken,true);
        if(internal[1].revive){
          this.replicatingUser.revive = internal[1].revive;
        }
        console.log('superuser replicationid',this.replicatingUser._replicationid);
        this.replicationInitiated.fire(this.replicatingUser);
        break;
      case 'going_down':
        console.log(sender.replicaToken.name,'going down');
        this.closeReplicatingClient(sender.replicaToken.name);
        break;
      case 'give_up':
        this.destroy(); 
        break;
      case 'remoteDestroy':{
        var dest = sender.destroyables && sender.destroyables[internal[1]];
        if (dest) {
          delete sender.destroyables[internal[1]];
          dest.destroy();
        }
        break;
      }
    }
  }
  var targetrpc = input.targetrpc;
  if(targetrpc){
    var path = targetrpc.shift();
    if(!path){return;}
    var targetel = this.element(path);
    if(targetel){
      input.rpc = input.targetrpc;
      delete input.targetrpc;
      return targetel.processInput(sender,input);
    }
    return;
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
    return method.apply(this,args);
  }
};

Collection.prototype.startFifo = function(size,idfieldname){
  this.attach('./fifofunctionality',{size:size||10,idname:idfieldname});
};

Collection.prototype.addToFifo = function(item){
  var f = this.functionalities.fifofunctionality.f;
  if(!f){
    this.startFifo();
    f = this.functionalities.fifofunctionality.f;
  }
  f.add(item);
};

module.exports = Collection;
