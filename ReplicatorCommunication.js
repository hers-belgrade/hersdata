var Timeout = require('herstimeout'),
  BigCounter = require('./BigCounter'),
  DataFollower = require('./DataFollower'),
  DataUser = require('./DataUser'),
  SuperUser = require('./SuperUser'),
  ArrayMap = require('./ArrayMap'),
  HookCollection = require('./hookcollection'),
  executable = require('./executable'),
  isExecutable = executable.isA,
  execRun = executable.run,
  execCall = executable.call,
  execApply = executable.apply;

var __start = Timeout.now();

function statusSetter(stts){
  /*
  if(stts==='DISCARD_THIS'){
    console.trace();
    console.log(this.username(),this.path,'will die',this._replicationid);
  }
  */
  if(!(this.rc && this.rc.counter)){return;}
  this.rc.send('userstatus',this._replicationid,this._version,stts);
};

function remoteSayer(item){
  if(!(this.rc && this.rc.counter)){return;}
  this.rc.send('usersay',this._replicationid,this._version,item[1]);
}

function RemoteFollower(data,createcb,saycb,user,path,options){
  this._replicationid = options.id;
  this._version = options.version;
  this.rc = options.rc;
  var old = this.rc._map.allocate(this._replicationid,this);
  if(old){
    console.trace();
    console.log('Slot',this._replicationid,'was already taken',this.rc._id);
    //console.log(old);
    process.exit(0);
  }/*else{
    console.log('Slot',this._replicationid,'was vacant for RemoteFollower',this.rc._id);
  }*/
  DataFollower.call(this,data,createcb,saycb,user,path);
  //console.log('new RemoteFollower',this.fullname(),this._replicationid,this.path,data.dataDebug());
};
RemoteFollower.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:RemoteFollower,
  enumerable:false,
  writable:false,
  configurable:false
}});
RemoteFollower.prototype.destroy = function(){
  if(!this.rc){return;}
  if(!this.rc._map){
    console.trace();
    console.log(this.username(),'has rc, but rc has no _map?!');
    return;
  }
  //console.log('Slot',this._replicationid,'removed as RemoteFollower');
  this.rc._map.remove(this._replicationid);
  DataFollower.prototype.destroy.call(this);
};
RemoteFollower.prototype.otherSideDied = function(){
  this.destroy();
};
RemoteFollower.prototype.setStatus = statusSetter;
RemoteFollower.prototype.say = remoteSayer;
RemoteFollower.prototype.follow = function(path,id,version){
  return DataFollower.prototype.follow.call(this,path,void 0,void 0,RemoteFollower,{rc:this.rc,id:id,version:version});
}

function RemoteUser(rc,username,realmname,roles,replicationid,version,path){
  this.rc = rc;
  this._replicationid=replicationid;
  this._version = version;
  var old = this.rc._map.allocate(this._replicationid,this);
  if(old){
    console.trace();
    console.log('Slot',this._replicationid,'was already taken',this.rc._id);
    //console.log(old);
    process.exit(0);
  }/*else{
    console.log('Slot',this._replicationid,'was vacant for RemoteUser',this.rc._id);
  }*/
  this.username = username;
  this.realmname = realmname;
  this.roles = roles;
  this.path = path;
  this.server = rc.replicaToken.name;
  this.init();
}
RemoteUser.prototype = Object.create(DataUser.prototype,{constructor:{
  value:RemoteUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
RemoteUser.prototype.destroy = function(){
  //console.log('Slot',this._replicationid,'removed as RemoteUser');
  if(!this.rc){return;}
  this.rc._map.remove(this._replicationid);
  DataUser.prototype.destroy.call(this);
};
RemoteUser.prototype.otherSideDied = function(){
  this.destroy();
};
RemoteUser.prototype.init = function(){
  var data = this.rc.data.element(this.path);
  if(data){
    var username = this.username, realmname = this.realmname, roles = this.roles, server = this.server;
    delete this.username;
    delete this.realmname;
    delete this.roles;
    DataUser.call(this,data,undefined,undefined,username,realmname,roles);
    this._parent.server = server;
  }else{
    this.setStatus('LATER');
    var t = this;
    new DataFollower(this.rc.data,function(stts){
      switch(stts){
        case 'OK':
          t.init();
          this.destroy();
          break;
      }
    },null,this.rc.superuser,this.path);
  }
};
RemoteUser.prototype.setStatus = statusSetter;
RemoteUser.prototype.say = remoteSayer;
RemoteUser.prototype.follow = function(path,id,version){
  return SuperUser.prototype.follow.call(this,path,void 0,void 0,RemoteFollower,{rc:this.rc,id:id,version:version});
};

function RCSuperUser(rc,username,realmname){
  this.rc = rc;
  this._replicationid = '0.0.0.0';
  SuperUser.call(this,rc.data,undefined,undefined,username,realmname);
}
RCSuperUser.prototype = Object.create(SuperUser.prototype,{constructor:{
  value:RCSuperUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
RCSuperUser.prototype.follow = function(path,id,version){
  return SuperUser.prototype.follow.call(this,path,void 0,void 0,RemoteFollower,{rc:this.rc,id:id,version:version});
};
RCSuperUser.prototype.say = function(item){
  if(!(this.rc && this.rc.slaveSays)){
    this.destroy();
  }else{
    this.rc.slaveSays.fire(item);
  }
};

function RemoteFollowerSlave(rc,localfollower){
  localfollower.remotelink = this;
  this.rc = rc;
  rc.counter.inc();
  this._version = rc.counter.toString();
  this._id = rc._map.add(this);
  this.follower=localfollower;
  var _parent = localfollower._parent.remotelink;
  if(_parent){
    //console.log('new RemoteFollowerSlave id',this._id,'version',this._version,'on parent id',_parent._id,'parent version',_parent._version);
    this.send('createFollower',_parent._id,_parent._version,this._id,this._version,localfollower.remotetail);
  }else{
    //console.log('new RemoteUser id',this._id,'version',this._version);
    this.send('createUser',localfollower.username(),localfollower.realmname(),localfollower.roles(),this._id,this._version,localfollower.remotetail);
  }
}
RemoteFollowerSlave.prototype.send = function(code){
  this.rc.send.apply(this.rc,arguments);
  return;
  var obj = {
    code:code
  };
  var args = Array.prototype.slice.call(arguments,1);
  if(args.length){
    obj.args = args;
  }
  this.rc.sendobj({
    user:obj
  });
};
RemoteFollowerSlave.prototype.setStatus = function(stts){
  if(stts==='DISCARD_THIS'){
    if(this._id!==null){
      console.log('removing slot',this._id);
      this.rc._map.remove(this._id);
      this._id = null;
    }
    //console.log(this.follower.username(),this.follower.path,'RemoteFollowerSlave will die because of DISCARD_THIS',this._id);
    Timeout.next(this.follower,'destroy');
  }
  this.follower.setStatus(stts);
};
RemoteFollowerSlave.prototype.say = function(item){
  if(item==='DISCARD_THIS'){
    if(this._id!==null){
      console.log('removing slot',this._id);
      this.rc._map.remove(this._id);
      this._id = null;
    }
    Timeout.next(this.follower,'destroy');
    return;
  }
  if(!this.follower.remotetail){
    //console.log('follower ded?',this.follower);
    return;
  }
  this.follower.say([this.follower.path,item]);
};
RemoteFollowerSlave.prototype.destroy = function(){
  if(!this.follower){return;}
  this.follower.remotelink = null;
  if(this._id!==null){
    /*
    console.trace();
    console.log('removing slot with report',this._id,this._version);
    */
    this.rc._map.remove(this._id);
    this.rc.send('destroyRemote',this._id,this._version);
    this._id = null;
  }
  for(var i in this){
    this[i] = null;
  }
};
RemoteFollowerSlave.prototype.otherSideDied = function(){
  if(!this.follower){return;}
  Timeout.next(this.follower,'destructListener');
  this.destroy();
};
RemoteFollowerSlave.prototype.perform = function(code,path,paramobj,cb){
  if(!this.rc.counter){
    cb('DISCARD_THIS');
    return;
  }
  this.rc.counter.inc();
  var rcs = this.rc.counter.toString();
  if(!this.cbs){
    this.cbs = {};
  }
  this.cbs[rcs] = cb;
  this.send('perform',this._id,this._version,code,path,paramobj,rcs);
};
RemoteFollowerSlave.prototype.docb = function(cbid,args){
  /*
  console.log('docb',cbid);//,args);
  for(var i in args){
    console.log(args[i]);
  }
  */
  if(!this.cbs){return;}
  var cb = this.cbs[cbid];
  if(isExecutable(cb)){
    delete this.cbs[cbid];
    switch(args.length){
      case 0:
        execRun(cb);
        break;
      case 1:
        execCall(cb,args[0]);
        break;
      default:
        execApply(cb,args);
        break;
    }
  }
};

var _instanceCount = new BigCounter();

function ReplicatorCommunication(data){
  _instanceCount.inc();
  this._id = _instanceCount.toString();
  if(!data){return;}
  this.counter = new BigCounter();
  this._map = new ArrayMap();
  this.data = data;
}
function userResetter(user,userindex){
  if(user){
    user.otherSideDied();
  }
  this.remove(userindex);
};
ReplicatorCommunication.prototype.destroy = function(){
  if(this.slaveSays){
    this.slaveSays.destruct();
  }
  if(this.masterSays){
    this.masterSays.destruct();
  }
  if(this.data && this.data.communication){
    this.data.communication = null;
  }
  if (this._map) {
    this._map.traverse([this._map,userResetter]);
  }
  for(var i in this){
    this[i] = null;
  }
};
ReplicatorCommunication.prototype.send = function(code){
  /*
  var sendobj = {};
  sendobj[code] = Array.prototype.slice.call(arguments,1);
  this.sendobj(sendobj);
  */
  this.sendobj(arguments);
};
ReplicatorCommunication.prototype.execute = function(rid,version,cbid){
  var r = this._map.elementAt(rid);
  if(!r){
    return;
  }
  if(r._version!==version){
    return;
  }
  var c = 3;
  var args = {};
  for(;c<arguments.length;c++){
    args[c-3] = arguments[c];
  }
  args.length = arguments.length-3;
  console.log('applying',args);
  r.docb(cbid,args);
};
ReplicatorCommunication.prototype.remoteLink = function(follower){
  new RemoteFollowerSlave(this,follower);
};
ReplicatorCommunication.prototype.createSuperUser = function(token,slaveside){
  var u;
  if(slaveside){
    var ms = new HookCollection();
    this.masterSays = ms;
    u = new SuperUser(this.data,function(){},function(item){ms.fire(item);},token.name,token.realmname);
  }else{
    this.slaveSays = new HookCollection();
    u =  new RCSuperUser(this,token.name,token.realmname);
  }
  this.superuser = u;
  return u;
};
ReplicatorCommunication.prototype.createUser = function(username,realmname,roles,id,version,path){
  console.log('createUser',arguments)
  new RemoteUser(this,username,realmname,roles,id,version,path);
};
ReplicatorCommunication.prototype.createFollower = function(parentid,parentversion,id,version,path){
  if(!this._map){return;}
  var p = this._map.elementAt(parentid);
  if(!(p&&p._version===parentversion)){
    return;
  }
  if(typeof p.username==='function'){
    //console.log('creating follower with id',id,'version',version,'on parent',parentid);
    p.follow(path,id,version);
  }else{
    Timeout.set(this,100,'createFollower',parentid,id,version,path);
  }
};
ReplicatorCommunication.prototype.perform = function(id,version,code,path,paramobj,cbid){
  var r = this._map.elementAt(id);
  if(!r){
    return;
  }
  var m = r[code];
  //console.log('perform',id,code,path,paramobj,cbid);
  if(typeof m === 'function'){
    m.call(r,path,paramobj,[this,'reportResult',[['execute',id,version,cbid]]]);
  }else{
    this.send('execute',id,version,cbid,'NO_METHOD',[code]);
  }
};
ReplicatorCommunication.prototype.reportResult = function(arry){
  //console.log('reporting results',arguments,'for arry',arry);
  for(var i in arguments){
    if(i==0){continue;}
    //console.log('pushing',arguments[i],'for',i);
    arry.push(arguments[i]);
  }
  //console.log('commandresult',arry);
  this.send.apply(this,arry);
};
function enLengthenArgs(args){
  var cursor = 0;
  while(cursor in args){
    cursor ++;
  }
  args.length=cursor;
};
function sliceArgs(args){
  var cursor = 1;
  while(cursor in args){
    args[cursor-1] = args[cursor];
    cursor ++;
  }
  args.length=cursor-1;
};
ReplicatorCommunication.handOver = function(instance,args){
  //console.log(args);
  var methodname = args[0];
  var method = instance[methodname];
  if(typeof method === 'function'){
    sliceArgs(args);
    //console.log('applying',methodname,'to ReplicatorCommunication');
    method.apply(instance,args);
    return;
  }
  if(instance.data){
    method = instance.data[methodname];
    if(typeof method === 'function'){
      args[0] = instance;
      enLengthenArgs(args);
      //console.log('applying',methodname,'to dcp');
      method.apply(instance.data,args);
      return;
    }
  }
  console.log(methodname,'is not a method name with',args);
  process.exit(0);
};
ReplicatorCommunication.prototype.userstatus = function(id,version,stts){
  if(this._map){
    var s = this._map.elementAt(id);
    if(s && s._version===version){
      s.setStatus(stts);
    }
  }
};
ReplicatorCommunication.prototype.usersay = function(id,version,item){
  if(this._map){
    var s = this._map.elementAt(id);
    if(s && s._version===version){
      s.say(item);
    }
  }
};
ReplicatorCommunication.prototype.destroyRemote = function(id,version){
  var d = this._map.elementAt(id);
  if(d && d._version===version){
    d.destroy(true);
  }
};
/*
ReplicatorCommunication.prototype.handOver = function(input){
  var commandresult = input.commandresult;
  if(commandresult){
    delete input.commandresult;
    this.execute(commandresult);
    return;
  }
  if(input.destroy){
    //console.log(this._id,'remote destruction',input.destroy);
    var di = input.destroy;
    var d = this._map.elementAt(di[0]);
    if(d && d._version===di[1]){
      //console.log('ok');
      d.destroy(true);
      this._map.remove(di);
    }
    return;
  }
  if(input.mastersay){
    this.masterSays.fire(input.mastersay[1]);
    return;
  }
  if(input.slavesay){
    this.slaveSays.fire(input.slavesay[1]);
    return;
  }
  if(input.userstatus) {
    var us = input.userstatus;
    if(this._map){
      var s = this._map.elementAt(us[0]);
      if(s && s._version===us[1]){
        s.setStatus(us[2]);
      }
    }
    return;
  }
  if(input.usersay){
    //console.log(input);
    var us = input.usersay;
    if(this._map){
      var s = this._map.elementAt(us[0]);
      if(s && s._version===us[1]){
        //console.log(s.follower.path,us);
        s.say(us[2]);
      }else{
        //console.log('fail for',us,s);
      }
    }
    return;
  }
  if(input.user){
    var mn = input.user.code;
    var m = this[mn];
    if(typeof m === 'function'){
      m.apply(this,input.user.args);
    }else{
      console.log('no user related method',mn,'to invoke');
      return;
    }
  }
  this.data.processInput(this,input);
};
*/

ReplicatorCommunication.prototype.purge = function () {
  if(this._map){
    this._map.traverse([this._map,userResetter]);
  }
};

ReplicatorCommunication.metrics = function(){
  var _n = Timeout.now(), elaps = _n-__start,
    st=ReplicatorCommunication.sendingTime,rt=ReplicatorCommunication.rcvingTime,et=ReplicatorCommunication.execTime,
    rb=ReplicatorCommunication.rcvBytes,sb=ReplicatorCommunication.sentBytes;
  __start = _n;
  ReplicatorCommunication.sendingTime=0;
  ReplicatorCommunication.rcvingTime=0;
  ReplicatorCommunication.execTime=0;
  ReplicatorCommunication.rcvBytes=0;
  ReplicatorCommunication.sentBytes=0;
  return {buffer:{rx:ReplicatorCommunication.input,tx:ReplicatorCommunication.output},utilization:{rx:~~(rt*100/elaps),tx:~~(st*100/elaps),exec:~~(et*100/elaps)},traffic:{tx:sb,rx:rb}};
};
ReplicatorCommunication.input = 0;
ReplicatorCommunication.output = 0;
ReplicatorCommunication.rcvingTime = 0;
ReplicatorCommunication.sendingTime = 0;
ReplicatorCommunication.execTime = 0;
ReplicatorCommunication.rcvBytes = 0;
ReplicatorCommunication.sentBytes = 0;

module.exports = ReplicatorCommunication;
