var Timeout = require('herstimeout'),
  BigCounter = require('./BigCounter'),
  DataFollower = require('./DataFollower'),
  DataUser = require('./DataUser'),
  SuperUser = require('./SuperUser'),
  HookCollection = require('./hookcollection');

var __start = Timeout.now();
var __id = 0;

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
  this.init();
}
RemoteUser.prototype = Object.create(DataUser.prototype,{constructor:{
  value:RemoteUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
RemoteUser.prototype.init = function(){
  var data = this.rc.data.element(this.path);
  if(data){
    var username = this.username, realmname = this.realmname, roles = this.roles;
    delete this.username;
    delete this.realmname;
    delete this.roles;
    DataUser.call(this,data,undefined,undefined,username,realmname,roles);
  }else{
    this.setStatus('LATER');
    var t = this;
    var df = new DataFollower(rc.data,function(stts){
      switch(stts){
        case 'OK':
          t.init();
          this.destroy();
          break;
      }
    },null,this.rc.superuser,path);
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
  this.rc.slaveSays.fire(item);
};

function RemoteFollowerSlave(rc,localfollower){
  localfollower.remotelink = this;
  this.rc = rc;
  rc.counter.inc();
  this._id = rc.counter.toString();
  if(!rc.senders){
    rc.senders = {};
  }
  rc.senders[this._id] = this;
  this.follower=localfollower;
  if(localfollower.remotepath){
    this.remotepath = JSON.parse(JSON.stringify(localfollower.remotepath));
  }
  if(localfollower.remotepath){
    localfollower.remotepath.push(localfollower.remotetail);
  }else{
    localfollower.remotepath = localfollower.remotetail;
  }
  //create
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
  if(stts==='RETREATING'){
    this.destroy();
    return;
  }
  this.follower.setStatus(stts);
};
RemoteFollowerSlave.prototype.say = function(item){
  if(item==='DISCARD_THIS'){
    this.destroy();
    return;
  }
  if(!this.follower.pathtocommunication){
    //console.log('follower ded?',this.follower);
    return;
  }
  this.follower.say([this.follower.pathtocommunication.concat(item[0]),item[1]]); 
};
RemoteFollowerSlave.prototype.destroy = function(){
  if(!this.follower){return;}
  console.log(this._id,'dying');
  this.follower.remotepath = this.remotepath;
  delete this.follower.remotelink;
  delete this.rc.senders[this._id];
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
  var cb = this.cbs[cbid];
  if(typeof cb === 'function'){
    delete this.cbs[cbid];
    cb.apply(null,args);
  }
};

var _instanceCount = new BigCounter();

function ReplicatorCommunication(data){
  _instanceCount.inc();
  this._id = _instanceCount.toString();
  if(!data){return;}
  __id++;
  this.counter = new BigCounter();
  this.cbs = {};
  this.sayers = {};
  this.__id = __id;
  this.data = data;
}
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
  if (this.destroyables) {
    for (var i in this.destroyables) {
      if(this.destroyables[i]){
        this.destroyables[i].destroy();
      }
    }
  }
  for(var i in this.cbs){
    this.cbs[i] = null;
    delete this.cbs[i];
  }
  if(this.users){
    for(var i in this.users){
      this.users[i].destroy();
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
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,1),false);
  this.sendobj(sendobj);
};
ReplicatorCommunication.prototype.addToSenders1 = function(user,replicationid,pathtome){
  if(!user.replicators){
    user.replicators = {};
  }
  if(!user.replicatorcbs){
    user.replicatorcbs = {};
  }
  if(!user.replicators[this._id]){
    if(typeof replicationid === 'undefined'){
      this.counter.inc();
      replicationid = this.counter.toString();
    }
    user.replicators[this._id] = replicationid;
    user.replicatorcbs[this._id] = [];
    this.sayers[replicationid] = user;
    user.destroyed.attach((function(t,replicationid,user){
      var _t = t, _cnt = replicationid,_u = user; 
      return function(){
        //console.trace();
        //console.log(_u.fullname(),'destroyed on',_cnt);
        var mycbrefs = _u.replicatorcbs[_t._id];
        if(mycbrefs){
          delete _u.replicatorcbs[_t._id];
          for(var i in mycbrefs){
            var mcbr = mycbrefs[i];
            //console.log('clearing cbref',mcbr);
            delete _t.cbs[mcbr];
            delete _t.persist[mcbr];
          }
        }
        _t.sendobj({destroy:_cnt});
        delete _t.sayers[_cnt];
        //console.log(Object.keys(t.sayers).length,'sayers');
      };
    })(this,replicationid,user));
  }
};
ReplicatorCommunication.prototype.usersend1 = function(user,pathtome,remotepath,code){
  if(!(user.username()&&user.realmname())){
    return;
    console.trace();
    console.log('user no good',user);
    process.exit(0);
  }
  if(typeof pathtome !== 'object'){
    return;
    console.trace();
    console.log('pathtome is missing');
    process.exit(0);
  }
  this.counter.inc();
  this.addToSenders(user,undefined,pathtome);
  var cnt = this.counter.toString();
  if(!user.replicators[this._id]){
    console.trace();
    console.log('no replicationid on the sending side');
    process.exit(0);
  }
  var sendobj = {counter:cnt,user:{_id:user.replicators[this._id],username:user.username(),realmname:user.realmname(),remotepath:remotepath?JSON.parse(JSON.stringify(remotepath)):remotepath}};
  if(!(this.users && this.users[user.fullname()])){
    sendobj.user.roles = user.roles();
  }
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,4),false,user);
  Timeout.next(this,'sendobj',sendobj);
  var t = this;
  return {
    destroy:function(){
      delete t.cbs[cnt];
      delete t.persist[cnt];
      t.sendobj({destroy:cnt});
    }
  }
};
ReplicatorCommunication.prototype.prepareCallParams = function(ca,persist,user){
  if(ca[ca.length-1]==='__persistmycb'){
    ca.pop();
    return this.prepareCallParams(ca,true,user);
  }
  for(var i in ca){
    cb = ca[i];
    var tocb = typeof cb;
    if(tocb === 'function'){
      this.counter.inc();
      var cts = this.counter.toString();
      var cs = '#FunctionRef:'+cts;
      this.cbs[cts] = cb;
      if(persist){
        if(!this.persist){
          this.persist = {};
        }
        this.persist[cts] = 1;
        user.replicatorcbs[this._id].push(cts);
      }
      ca[i] = cs;
    }
  }
  return ca;
};
ReplicatorCommunication.prototype.execute = function(commandresult){
  if(commandresult.length){
    rid = commandresult.shift();
    var r = this.senders[rid];
    if(!r){
      this.sendobj({destroy:rid});
      return;
    }
    cbref = commandresult.shift();
    r.docb(cbref,commandresult);
  }
};
ReplicatorCommunication.prototype.parseAndSubstitute= function(params){
  //console.log('should parse and subst',params);
  var ret = '';
  for(var i in params){
    var p = params[i];
    if(typeof p === 'string'){
      if(p.indexOf('#FunctionRef:')===0){
        var fnref = p.slice(13);
        //console.log('#FunctionRef',fnref);
        if(ret){
          ret += ',';
        }
        ret += fnref;
        params[i] = (function(_t,fr){
          var t = _t, fnref = fr;
          return function(){
            var args = Array.prototype.slice.call(arguments);
            args.unshift(fnref);
            //console.log('sending commandresult',args);
            args.unshift('commandresult');
            t.send.apply(t,args);
          };
        })(this,fnref);
      }
    }
  }
  return ret;
};
ReplicatorCommunication.prototype.remoteLink = function(follower){
  new RemoteFollowerSlave(this,follower);
};
ReplicatorCommunication.prototype.createSuperUser = function(token,slaveside){
  if(!this.users){
    this.users = {};
  }
  var u;
  if(slaveside){
    var ms = new HookCollection();
    this.masterSays = ms;
    u = new SuperUser(this.data,function(){},function(item){ms.fire(item);},token.name,token.realmname);
  }else{
    this.slaveSays = new HookCollection();
    u =  new RCSuperUser(this,token.name,token.realmname);
  }
  u.replicators = {};
  var fullname = u.fullname();
  this.users[fullname] = u;
  u.destroyed.attach((function(_us,_fn){
    var us=_us,fn=_fn
    return function(){
      delete us[fn];
    }
  })(this.users,fullname));
  this._fullname = u.fullname();
  return u;
};
ReplicatorCommunication.prototype.createUser = function(username,realmname,roles,id,path){
  new RemoteUser(this,username,realmname,roles,id,path);
};
ReplicatorCommunication.prototype.createFollower = function(parentid,id,path){
  var p = this.remotes[parentid];
  if(!p){
    this.sendobj({destroy:parentid});
    return;
  }
  this.inputcounter=id;
  p.follow(path);
};
ReplicatorCommunication.prototype.perform = function(id,code,path,paramobj,cbid){
  var r = this.remotes[id];
  if(!r){
    this.sendobj({destroy:id});
    return;
  }
  var m = r[code];
  //console.log('perform',id,code,path,paramobj,cbid);
  if(typeof m === 'function'){
    m.call(r,path,paramobj,(function(t,arry){
      return function(){
        for(var i in arguments){
          arry.push(arguments[i]);
        }
        //console.log('commandresult',arry);
        t.sendobj({commandresult:arry});
      };
    }(this,[id,cbid])));
  }else{
    this.sendobj({commandresult:[id,cbid,'NO_METHOD',[code]]});
  }
};
ReplicatorCommunication.prototype.handOver = function(input){
/*
  console.log(
    'users',this.users ? Object.keys(this.users).length : 0,
    'cbs',this.cbs ? Object.keys(this.cbs).length : 0,
    'persist',this.persist ? Object.keys(this.persist).length : 0,
    'destroyables',this.destroyables ? Object.keys(this.destroyables).length : 0,
    'sayers',this.sayers ? Object.keys(this.sayers).length : 0,
    'statii',this.statii ? Object.keys(this.statii).length : 0
  );
  */
  var counter = input.counter;
  this.inputcounter = counter;
  var cbrefs = '';
  delete input.counter;
  for(var i in input){
    var _cbrefs = this.parseAndSubstitute(input[i]);
    if(_cbrefs){
      if(cbrefs){
        cbrefs += ',';
      }
      cbrefs += _cbrefs;
    }
  }
  var commandresult = input.commandresult;
  if(commandresult){
    delete input.commandresult;
    this.execute(commandresult);
    return;
  }
  if(input.destroy){
    var di = input.destroy;
    var d = this.destroyables ? this.destroyables[di] : null;
    if(d){
      //console.log('destroying',di);
      d.destroy();
      //delete this.destroyables[di];
    }else{
      console.log('no destroyable on',di);
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
    if(this.senders){
      var s = this.senders[us[0]];
      if(s){
        s.setStatus(us[1]);
      }else{
        console.log('no status for',us[0],'to userstatus',us[1]);
      }
    }
    return;
  }
  if(input.usersay){
    var us = input.usersay;
    if(this.senders){
      var s = this.senders[us[0]];
      if(s){
        s.say(us[1]);
      }else{
        //console.log('no sayer for',us[0],'to usersay',us[1], input);
        this.send({destroy:us[0]});
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
    /*
    var username = input.user.username, realmname = input.user.realmname, fullname = username+'@'+realmname, u;
    if (!this.users) this.users = {};

    if(!this.users[fullname]){
      var ut, uc;
      if(this.replicaToken.name+'@'+this.replicaToken.realmname===fullname){
        console.trace();
        console.log('superuser cannot be automatically created');
        process.exit(0);
      }
      u =  new RemoteUser(this,username,realmname,input.user.roles,input.user._id);
      u.user().server = this.replicaToken.name;
      u.destroyed.attach((function(_us,_fn){
        var us=_us,fn=_fn
        return function(){
          delete us[fn];
        }
      })(this.users,fullname));
      this.users[fullname] = u;
    }else{
      u = this.users[fullname];
    }
    var remotepath = input.user.remotepath;
    if(remotepath){
      if(typeof remotepath[0] === 'object'){
        while(remotepath.length){
          u = u.follow(remotepath.shift());
        }
      }else{
        u = u.follow(remotepath);
      }
    }
    //console.log('on remotepath',input.user.remotepath);
    delete input.user;
    for(var i in input){
      var method = u[i];
      if(method){
        //console.log(u.username(),'applies',i);//,input[i]);
        this.handleDestroyable(counter,cbrefs,method.apply(u,input[i]));
      }
    }
    */
    return;
  }
  this.handleDestroyable(counter,cbrefs,this.data.processInput(this,input));
};

ReplicatorCommunication.prototype.handleDestroyable = function(counter,cbrefs,obj){
  if (obj && ('function' === typeof(obj.destroy))) {
    //console.log('putting destroyable to',counter);
    if (!this.destroyables){
      this.destroyables = {};
      this.destroyablecount = 0;
    }
    this.destroyables[counter] = obj;
    this.destroyablecount++;
    //console.log('desctcnt',this.destroyablecount);
    if(obj.destroyed){
      obj.destroyed.attach((function(t,cnt){
        return function(){
          t.destroyablecount--;
          //console.log('desctcnt',t.destroyablecount);
          //console.log('removing destroyable',cnt);
          delete t.destroyables[cnt];
        }
      })(this,counter));
    }
  }
};

ReplicatorCommunication.prototype.purge = function () {
  var old_cbs = this.cbs;
  this.cbs = {};
  for (var i in old_cbs) {
    try{
    old_cbs[i].call(null, 'DISCARD_THIS');
    }
    catch(e){
      console.log(e.stack);
      console.log(old_cbs[i].toString());
    }
  }
  console.log('discard this sent ....');
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
