var utils = require('util'),
  throw_if_invalid_scalar = require('./helpers').throw_if_invalid_scalar,
  net = require('net'),
  BigCounter = require('./BigCounter'),
  child_process = require('child_process'),
  ReplicatorSocketCommunication = require('./ReplicatorSocketCommunication'),
  executable = require('hersexecutable'),
  isExecutable = executable.isA,
  execCall=executable.call,
  execApply=executable.apply,
  HookCollection = executable.HookCollection,
  Scalar = require('./Scalar'),
  User = require('./User'),
  attachedfunctionalityprototyper = require('./attachedfunctionalityprototyper');
var __CollectionCount = 0;

function childTxnHandler(name,txnc,chldcollectionpath,txnalias,txnprimitives,txnid){
  txnc.inc();
  this.onNewTransaction.fire([name].concat(chldcollectionpath),txnalias,txnprimitives,txnc.clone());
};

function itemPerformer(txnc,it){
  //console.log('should perform',it);
  if (utils.isArray(it) && it.length) {
    //console.log('performing',it);
    this['perform_'+it[0]](it[1], it[2], txnc);
  }
};

function collectionCommiter(txnc,txnalias,txnprimitives,_txnc,targetpath) {
  if(targetpath && typeof targetpath === 'object' && targetpath instanceof Array){
    var el = this.element(targetpath);
    if(!el){
      return;
      console.log('no element to _commit on');
      process.exit(0);
    }
    execApply(el._commit,[txnalias,txnprimitives]);
    return;
  }
  if(this.__commitunderway){
    if(!this.__commitstodo){
      this.__commitstodo=[[txnalias,txnprimitives]];
    }else{
      this.__commitstodo.push([txnalias,txnprimitives]);
      console.log(this.__commitstodo.length,'pending');
    }
    return;
  }
  this.__commitunderway = true;
  //console.log('txnBegins',txnalias);
  this.txnBegins.fire(txnalias);
  for (var i in txnprimitives) {
    itemPerformer.call(this,txnc,txnprimitives[i]);
  }
  this.txnEnds.fire(txnalias);
  //console.log('txnEnds',txnalias);
  txnc.inc();
  //console.log(txnalias,'firing on self',txnc.toString());
  this.onNewTransaction.fire([],txnalias,txnprimitives,txnc.clone());
  this.__commitunderway = false;
  if(this.__commitstodo){
    if(this.__commitstodo.length){
      //this._commit.apply(this,this.__commitstodo.shift());
      execApply(this._commit,this.__commitstodo.shift());
    }else{
      this.__commitstodo = null;
    }
  }
  //console.log(txnc.toString(),'fire done');
}

function Collection(a_l){
  __CollectionCount++;
  var access_level = a_l;
  this.access_level = function(){
    return access_level;
  };
  var data = {};
  this.functionalities = {};

  this.debug = function(caption){
    console.log(caption,utils.inspect(data,false,null,true));
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
    if(!isExecutable(cb)){return;}
    for(var i in data){
      var cbr = execApply(cb,[i,data[i]]);
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

  this._addEntity = function(name,entity){
    data[name] = entity;
  };

  this._attachToChildTxn = function(name,entity){
    entity.onNewTransaction.attach([this,childTxnHandler,[name,txnCounter]]);
  };

  this._commit = [this,collectionCommiter,[txnCounter]];
  this.__commitunderway = false;
  this.__commitstodo = null;
  this.communication = null;
  this.replicatingClients = {};
};

Collection.prototype.destroy = function(){
  if(!this._destroyData){return;}
  var dd = this._destroyData;
  this._destroyData = null;
  dd.call(this);
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
    this.functionalities[i].__DESTROY__();
  }
  for(var i in this){
    this[i] = null;
  }
  __CollectionCount--;
};

Collection.prototype.add = function(name,entity){
  throw_if_invalid_scalar(name);
  var key = name+'';
  var d = this.elementRaw(key);
  if(d){
    d.destroy();
  }
  this._addEntity(key,entity);
  this.handleNewElement(key,entity);
  var toe = entity.type();
  if(toe==='Collection'){
    this._attachToChildTxn(name,entity);
  }
};

Collection.prototype.commit = function(txnalias,txnprimitives){
  try {
    execApply(this._commit,[txnalias,txnprimitives]);
  }catch (e) {
    console.log('ERROR:', txnalias, txnprimitives);
    throw e;
  }
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
  var ret = [['set',path]];
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
    if(isExecutable(cb)){
      execApply(cb,['ACCESS_FORBIDDEN',[methodname],'You are not allowed to invoke '+methodname]);
    }
    return;
  }
  var f = this.functionalities && this.functionalities[functionalityname];
  if(f){
    var key = f.key;
    if((typeof key !== 'undefined')&&(!user.contains(key))){
      if(isExecutable(cb)){
        execApply(cb,['ACCESS_FORBIDDEN',[key],'Functionality '+functionalityname+' is locked by '+key+' which you do not have']);
      }
      return;
    }
    var m = f[methodname];
    if(typeof m === 'function'){
      //console.log('invoking',methodname,'for',user.fullname(),cb); 
      m.call(f,paramobj,cb,user);
    }else{
      if(isExecutable(cb)){
        execApply(cb,['NO_METHOD',[methodname,functionalityname],'Method '+methodname+' not found on '+functionalityname]);
      }
      return;
    }
  }else{
    //console.trace();
    console.log(functionalityname,'is not a functionalityname while processing',path);
    //console.log(this.dataDebug());
    if(isExecutable(cb)){
      execApply(cb,['NO_FUNCTIONALITY',[functionalityname],'Functionality '+functionalityname+' does not exist here']);
    }
    return;
  }
};

Collection.prototype.takeBid = function(path,paramobj,cb,user){
  if(!path.length){
    if(isExecutable(cb)){
      execCall(cb,'VOID_REQUIREMENT');
    }
    return;
  }
  var rn = path[path.length-1];
  var re = this.element(['__requirements',rn]);
  if(!(re && re.functionalities && re.functionalities.requirement)){
    console.log('no requirement',rn,'on',this.dataDebug(),'=>',re?re.dataDebug():'','with',path);
    if(isExecutable(cb)){
      execApply(cb,['NO_REQUIREMENT',[rn],'Requirement '+rn+' does not exist']);
    }
    return;
  }
  re.functionalities.requirement.bid(paramobj,cb,user);
};

Collection.prototype.takeOffer = function(path,paramobj,cb,user){
  if(!path.length){
    if(isExecutable(cb)){
      execCall(cb,'VOID_REQUIREMENT');
    }
    return;
  }
  var rn = path[path.length-1];
  var re = this.element(['__requirements',rn]);
  if(!(re && re.functionalities.requirement)){
    console.log('no requirement',rn,'on',this.dataDebug());
    if(isExecutable(cb)){
      execApply(cb,['NO_REQUIREMENT',[rn],'Requirement '+rn+' does not exist']);
    }
    return;
  }
  re.functionalities.requirement.offer(paramobj,cb,user);
};

Collection.prototype.attach = function(functionalityname, config, key){
  return attachedfunctionalityprototyper(functionalityname,this,config,key);
};

Collection.prototype.setSessionUserFunctionality = function(config,requirements){
  this.attach('./sessionuserfunctionality',config,'dcp',requirements);
};

Collection.prototype.getReplicatingUser = function(cb){
  if(this.replicatingUser){
    if(isExecutable(cb)){
      execCall(cb,this.replicatingUser);
    }
    return;
  }
  var t=this,rul = this.replicationInitiated.attach(function(user){
    t.replicationInitiated.detach(rul);
    if(isExecutable(cb)){
      execCall(cb,user);
    }
  });
};

Collection.prototype.removeRemoteReplica = function(replicaname){
  if(!this._destroyData){return;}
  this.commit('remote_replica_gone',[
    ['remove',[replicaname]]
  ]);
};

Collection.prototype.handleRemoteReplicaUser = function(replicaname,user){
  user.destroyed.attach([this,this.removeRemoteReplica,[replicaname]]);
};

Collection.prototype.createRemoteReplica = function(localname,name,realmname,url,skipdcp){
  if(this.element([localname])){return;}
  if(!url){
    console.trace();
    throw "createRemoteReplica expects 4 params now";
  }
  var rr = url==='local' ?  new (require('./ChildProcessCollectionReplica'))(realmname,skipdcp) : new (require('./RemoteCollectionReplica'))(name,realmname,url,skipdcp);
  rr.getReplicatingUser([this,this.handleRemoteReplicaUser,[localname]]);
  this.add(localname,rr);
};

Collection.prototype.closeReplicatingClient = function(replicatorname){
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

Collection.prototype.openReplication = function(port,cb){
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
  server.on('error',function(){
    console.log('server error',arguments);
    port++;
    this.listen(port);
  });
  if(isExecutable(cb)){
    console.log('yes');
    server.on('listening',function(){
      console.log('listening',port);
      execCall(cb,port);
    });
  }
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

Collection.prototype.initRemoteReplica = function(sender,srt,data){
  console.log('remote replica announcing as',srt,data);
  if(typeof srt !== 'object'){
    sender.socket && sender.socket.destroy();
  }
  sender.replicaToken = srt;
  if(this.replicatingClients[sender.replicaToken.name]){
    console.log('but it is a duplicate, I already have');
    for(var i in this.replicatingClients){
      console.log(i);
    }
    //now what??
    //this.closeReplicatingClient(sender.replicaToken.name); //sloppy, leads to ping-pong between several replicas with the same name
    sender.send('giveUp');
    sender.socket && sender.socket.destroy();
    return;
  }
  this.replicatingClients[sender.replicaToken.name] = sender;
  var dodcp = !sender.replicaToken.skipdcp;
  if(dodcp){
    this.cloneFromRemote(data);
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
  this.newReplica.fire(sender);
  sender.send('initDCPReplica',ret);
};

Collection.prototype.initDCPReplica = function(sender,data){
  this.cloneFromRemote(data,true);
  this.replicatingUser = sender.createSuperUser(this.replicaToken,true);
  if(data.revive){
    this.replicatingUser.revive = data.revive;
  }
  console.log('superuser replicationid',this.replicatingUser._replicationid);
  this.replicationInitiated.fire(this.replicatingUser);
};

Collection.prototype.replicaGoingDown = function(sender){
  this.closeReplicatingClient(sender.replicaToken.name);
};

Collection.prototype.processInput = function(sender,input){
  var internal = input.internal;
  if(internal){
    switch(internal[0]){
      case 'need_init':
        console.log('remote replica announcing as',internal[1],internal[2]);
        var srt = internal[1];
        if(!(srt && typeof srt === 'object')){
          sender.socket && sender.socket.destroy();
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
        this.newReplica.fire(sender);
        sender.send('internal','initDCPreplica',ret);
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

Collection.prototype.startFifo = function(size,idfieldname,jsonize){
  this.attach('./fifofunctionality',{size:size||10,idname:idfieldname,jsonize:jsonize});
};

Collection.prototype.addToFifo = function(item){
  var f = this.functionalities.fifofunctionality;
  if(!f){
    this.startFifo();
    f = this.functionalities.fifofunctionality;
  }
  f.add(item);
};

module.exports = Collection;
