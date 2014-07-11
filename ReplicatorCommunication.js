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
  if(!(this.rc && this.rc.counter)){return;}
  this.rc.send('userstatus',this._replicationid,stts);
};

function remoteSayer(item){
  if(!(this.rc && this.rc.counter)){return;}
  this.rc.send('usersay',this._replicationid,item[1]);
}

function RemoteFollower(data,createcb,saycb,user,path,rc){
  this._replicationid = rc.inputcounter;
  this.rc = rc;
  if(!this.rc.remotes){
    this.rc.remotes = {};
  }
  this.rc.remotes[this._replicationid] = this;
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
  delete this.rc.remotes[this._replicationid];
  DataFollower.prototype.destroy.call(this);
};
RemoteFollower.prototype.setStatus = statusSetter;
RemoteFollower.prototype.say = remoteSayer;
RemoteFollower.prototype.follow = function(path,statuscb,saycb){
  return DataFollower.prototype.follow.call(this,path,statuscb,saycb,RemoteFollower,this.rc);
}

function RemoteUser(rc,username,realmname,roles,replicationid,path){
  this.rc = rc;
  this._replicationid=replicationid;
  if(!this.rc.remotes){
    this.rc.remotes = {};
  }
  this.rc.remotes[this._replicationid] = this;
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
  if(!this.rc){return;}
  delete this.rc.remotes[this._replicationid];
  DataUser.prototype.destroy.call(this);
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
RemoteUser.prototype.follow = function(path,statuscb,saycb){
  return DataUser.prototype.follow.call(this,path,statuscb,saycb,RemoteFollower,this.rc);
  //
  if(statuscb){
    return DataUser.prototype.follow.call(this,path,statuscb,saycb,RemoteFollower,this.rc);
  }else{
    return DataUser.prototype.follow.call(this,path,statuscb,saycb);
  }
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
RCSuperUser.prototype.follow = function(path,statuscb,saycb){
  return SuperUser.prototype.follow.call(this,path,statuscb,saycb,RemoteFollower,this.rc);
  //
  if(statuscb){
    return SuperUser.prototype.follow.call(this,path,statuscb,saycb,RemoteFollower,this.rc);
  }else{
    return SuperUser.prototype.follow.call(this,path,statuscb,saycb);
  }
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
  //this._id = rc.counter.toString();
  if(!rc.senders){
    rc.senders = new ArrayMap();
  }
  this._id = rc.senders.add(this);
  this.follower=localfollower;
  this.dataforremote = localfollower.dataforremote;
  delete localfollower.dataforremote;
  var _parent = localfollower._parent.remotelink;
  if(_parent){
    this.send('createFollower',_parent._id,this._id,localfollower.remotetail);
  }else{
    this.send('createUser',localfollower.username(),localfollower.realmname(),localfollower.roles(),this._id,localfollower.remotetail);
  }
}
RemoteFollowerSlave.prototype.send = function(code){
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
  this.follower.setStatus(stts);
  if(stts==='RETREATING'){
    Timeout.next(this,'destroy');
  }
};
RemoteFollowerSlave.prototype.say = function(item){
  if(item==='DISCARD_THIS'){
    this.destroy();
    return;
  }
  if(!this.follower.remotetail){
    //console.log('follower ded?',this.follower);
    return;
  }
  this.follower.say([this.follower.path,item]);
};
RemoteFollowerSlave.prototype.destroy = function(quiet){
  if(!this.follower){return;}
  delete this.follower.remotelink;
  Timeout.next(this.follower,'huntTarget',this.dataforremote);
  if(!quiet){
    this.rc.sendobj({destroy:this._id});
  }
  this.rc.senders.remove(this._id);
  for(var i in this){
    delete this[i];
  }
}
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
  this.send('perform',this._id,code,path,paramobj,rcs);
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
  this.data = data;
}
function senderDestroyer(sender,senderindex){
  if(sender){
    sender.destroy();
  }
  this.remove(senderindex);
};
ReplicatorCommunication.prototype.destroy = function(){
  if(this.slaveSays){
    this.slaveSays.destruct();
  }
  if(this.masterSays){
    this.masterSays.destruct();
  }
  if(this.data && this.data.communication){
    delete this.data.communication;
  }
  if (this.senders) {
    this.senders.traverse([this.senders,senderDestroyer]);
  }
  if (this.remotes) {
    for (var i in this.remotes) {
      if(this.remotes[i]){
        this.remotes[i].destroy();
      }
    }
  }
  for(var i in this){
    delete this[i];
  }
};
ReplicatorCommunication.prototype.send = function(code){
  this.counter.inc();
  var cnt = this.counter.toString();
  var sendobj = {counter:cnt};
  sendobj[code] = Array.prototype.slice.call(arguments,1);
  this.sendobj(sendobj);
};
ReplicatorCommunication.prototype.execute = function(commandresult){
  if(commandresult.length){
    rid = commandresult.shift();
    var r = this.senders.elementAt(rid);
    if(!r){
      //this.sendobj({destroy:rid});
      return;
    }
    cbref = commandresult.shift();
    r.docb(cbref,commandresult);
  }
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
ReplicatorCommunication.prototype.createUser = function(username,realmname,roles,id,path){
  new RemoteUser(this,username,realmname,roles,id,path);
};
ReplicatorCommunication.prototype.createFollower = function(parentid,id,path){
  var p = this.remotes[parentid];
  if(!p){
    //this.sendobj({destroy:parentid});
    return;
  }
  this.inputcounter=id;
  if(typeof p.username==='function'){
    p.follow(path);
  }else{
    Timeout.set(this,100,'createFollower',parentid,id,path);
  }
};
ReplicatorCommunication.prototype.perform = function(id,code,path,paramobj,cbid){
  var r = this.remotes[id];
  if(!r){
    //this.sendobj({destroy:id});
    return;
  }
  var m = r[code];
  //console.log('perform',id,code,path,paramobj,cbid);
  if(typeof m === 'function'){
    m.call(r,path,paramobj,[this,'reportResult',[[id,cbid]]]);
  }else{
    this.sendobj({commandresult:[id,cbid,'NO_METHOD',[code]]});
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
  this.sendobj({commandresult:arry});
};
ReplicatorCommunication.prototype.handOver = function(input){
  var counter = input.counter;
  this.inputcounter = counter;
  var cbrefs = '';
  delete input.counter;
  var commandresult = input.commandresult;
  if(commandresult){
    delete input.commandresult;
    this.execute(commandresult);
    return;
  }
  /*
  if(input.destroy){
    var di = input.destroy;
    var d = this.masterSays ? this.senders.elementAt(di) : this.remotes[di];
    if(d){
      d.destroy(true);
    }
    return;
  }
  */
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
    if(this.senders){
      var s = this.senders.elementAt(us[0]);
      if(s){
        s.setStatus(us[1]);
      }else{
        //console.log('no status for',us[0],'to userstatus',us[1]);
        //this.send({destroy:us[0]});
      }
    }
    return;
  }
  if(input.usersay){
    var us = input.usersay;
    if(this.senders){
      var s = this.senders.elementAt(us[0]);
      if(s){
        s.say(us[1]);
      }else{
        //console.log('no sayer for',us[0],'to usersay',us[1], input);
        //this.send({destroy:us[0]});
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

ReplicatorCommunication.prototype.purge = function () {
  if(this.senders){
    this.senders.traverse([this.senders,senderDestroyer]);
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
