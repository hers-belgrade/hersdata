var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var Follower = require('./follower');
var BigCounter = require('./BigCounter');
var util = require('util');

scalarValue = function(keyring,scalar){
  return keyring.contains(scalar.access_level()) ? scalar.value() : scalar.public_value();
};

function SessionFollower(keyring,path,txncb){
  console.log('new follower',path);
  var scalars={};
  var collections={};
  this.followers = {};
  this.keyring = keyring;
  this.path = path;
  this._localdump = function(){
    var mydump = [];
    for(var i in scalars){
      if(typeof scalars[i].value !== 'undefined'){
        mydump.push([i,scalars[i].value]);
      }else{
        console.log('scalar',i,scalars[i],'has no value');
      }
    };
    for(var i in collections){
      mydump.push([i,null]);
    };
    console.log('mydump',mydump);
    return mydump;
  };
  var txnqueue=[];
  this.dumptxnqueue = function(){
    return txnqueue.splice(0);
  };
  function cb(name,ent){
    if(ent){
      //console.log('scalars',scalars,'collections',collections);
      switch(ent.type()){
        case 'Scalar':
          var val = {};
          if(typeof scalars[name] === 'undefined'){
            val.handler = ent.subscribeToValue(function(el){
              var sv = scalarValue(keyring,el);
              if(typeof sv !== 'undefined'){
                val.value = sv;
                console.log(path.join('.'),val);
                //console.log(path.join('.'),'pushing',name,sv);
                txnqueue.push([name,sv]);
              }
            });
            scalars[name] = val;
          }
        break;
        case 'Collection':
          collections[name] = null;
          txnqueue.push([name,null]);
        break;
      }
    }else{
      if(typeof scalars[name] !== 'undefined'){
        console.log(path.join('.'),'pushing deletion of',name);
        txnqueue.push([name]);
        scalars[name] && scalars[name].handler && scalars[name].handler.destroy();
        delete scalars[name];
      }else if(typeof collections[name] !== 'undefined'){
        console.log(path.join('.'),'pushing deletion of',name);
        txnqueue.push([name]);
        delete collections[name];
      }else{
        console.log(path.join('.'),'has no',name,'to delete');
      }
    }
  };
  Follower.call(this,keyring,path,cb);
  var superDestroy = this.destroy;
  this.destroy = function(){
    superDestroy.call();
    for(var i in followers){
      this.followers[i].destroy();
    }
    for(var i in scalars){
      scalars[i].handler.destroy();
    }
  };
  var t = this;
  if(typeof txncb==='function'){
    keyring.data.txnBegins.attach(function(_txnalias){
      t.startTxn(_txnalias);
    });
    this.doEndTxn = function(_txnalias){
      var et = t.endTxn(_txnalias);
      if(typeof et !== 'undefined'){
        txncb(_txnalias,et);
      }
    };
    keyring.data.txnEnds.attach(this.doEndTxn);
  }
  //console.log(this._localdump(),'<>',txnqueue);
};
SessionFollower.prototype.follower = function(name){
  return this.followers[name];
};
SessionFollower.prototype.startTxn = function(txnalias){
  if(this.txnalias && txnalias!==txnalias){
    throw 'Already in txn '+this.txnalias;
  }
  //console.log(this.path.join('.'),'starting txn',txnalias);
  this.txnalias=txnalias;
  for(var i in this.followers){
    this.followers[i].startTxn(txnalias);
  }
};
SessionFollower.prototype.endTxn = function(txnalias){
  if(this.txnalias!==txnalias){
    throw 'Cannot end txn '+txnalias+', already in txn '+this.txnalias;
  }
  delete this.txnalias;
  //console.log(this.path.join('.'),'ending txn',txnalias);
  var has_data = false;
  var childtxns={};
  for(var i in this.followers){
    var ce = this.followers[i].endTxn(txnalias);
    if(typeof ce !== 'undefined'){
      has_data=true;
      childtxns[i] = ce;
    }
  }
  var tq = this.dumptxnqueue();
  if(has_data || tq.length>0){
    return [tq,childtxns];
  }
};
SessionFollower.prototype.follow = function(name){
  if(!this.followers[name]){
    this.followers[name] = new SessionFollower(this.keyring,this.path.concat([name]));
    return true;
  }else{
    //console.log('follower for',name,'already exists');
  }
};
SessionFollower.prototype.triggerTxn = function(virtualtxn){
  if(this.doEndTxn){
    //console.log('triggering',virtualtxn);
    this.startTxn(virtualtxn);
    this.doEndTxn(virtualtxn);
  }else{
    console.log('cannot trigger',virtualtxn,'got no doEndTxn');
  }
};
SessionFollower.prototype.dump = function(){
  var childdumps = {};
  var ret = [this._localdump(),childdumps]
  for(var i in this.followers){
    childdumps[i] = this.followers[i].dump();
  }
  return ret;
};

function UserSession(datadump,destroycb,id){
  this.id = id;
  this.queue = [['init',datadump]];
  var t = this;
  this.destroycb = function(){
    if(t.cb){
      console.log(t.id,'will not die, got cb in the meantime');
      return;
    }
    delete t.queue;
    destroycb();
  }
};
UserSession.prototype.add = function(txnalias,txns){
  this.queue.push([txnalias,txns]);
  this.dumpQueue();
};
UserSession.prototype.setTimeout = function(){
  if(!this.timeout){
    //console.log(this.id,'setting timeout to die');
    this.timeout = setTimeout(this.destroycb,15000);
  }
};
UserSession.prototype.dumpQueue = function(cb){
  if(cb && this.timeout){
    //console.log(this.id,'clearing timeout to die');
    clearTimeout(this.timeout);
    delete this.timeout;
  }
  if(this.cb){
    //console.log('dumping on previous cb with queue length',this.queue.length);
    //console.log('dumping',util.inspect(this.queue,false,null,false));
    this.cb(this.queue);
    this.queue=[];
    this.cb = cb;
  }else{
    if(this.queue.length){
      if(typeof cb === 'function'){
        //console.log('dumping on queue length',this.queue.length);
        //console.log('dumping',util.inspect(this.queue,false,null,false));
        cb(this.queue);
        this.queue=[];
      }
    }else{
      this.cb = cb;
    }
  }
  if(!this.cb){
    this.setTimeout();
  }
};
function SessionUser(data,username,realmname){
  KeyRing.call(this,data,username,realmname);
  var sessions = {};
  this.sessions = sessions;
  this.username=username;
  this.realmname=realmname;
  this.follower = new SessionFollower(this,[],function(txnalias,txns){
    //console.log('txn done',txnalias,util.inspect(txns,false,null,false));
    for(var i in sessions){
      sessions[i].add(txnalias,txns);
    }
  });
};
SessionUser.prototype = new KeyRing();
SessionUser.prototype.constructor = SessionUser;
SessionUser.prototype.destroy = function(){
  this.follower.destroy();
  this.destroytree();
};
SessionUser.prototype.invoke = function(path,paramobj,cb){
  //console.log('invoking',path,paramobj,this.username,this.realmname,this.roles,cb);
  this.data.invoke(path,paramobj,this.username,this.roles,cb);
};
SessionUser.prototype.makeSession = function(session){
  var ss = this.sessions;
  var s = ss[session];
  if(!s){
    //console.log('there is no session',session);
    ss[session] = new UserSession(this.follower.dump(),function(){
      //console.log('deleting session',session);
      delete ss[session];
    },session);
  }
};
SessionUser.prototype.follow = function(path){
  //console.log('I was told to follow',path);
  var ps = path.join('_');
  if(!path){return;}
  var f = this.follower;
  while(path.length>1 && f){// && typeof e !== 'undefined'){
    var pe = path.shift();
    f = f.follower(pe);
    //e = e[pe];
  }
  if(f){
    if(f.follow(path[0])){
      this.follower.triggerTxn('new_follower_'+ps);
      for(var i in this.sessions){
        this.sessions[i].dumpQueue();
      }
    }else{
      //console.log('following',path,'failed');
    }
  }else{
    //console.log('no follower for',path);
  }
};


var errors = {
  'OK':{message:'OK'},
  'NO_SESSION':{message:'Session [session] does not exist',params:['session']}
};

function findUser(params,statuscb){
  var fp = this.self.fingerprint;
  var session = params[fp];
  if(session){
    var user = this.self.sessions[session];
    if(user){
      return statuscb('OK',user,session);
    }else{
      delete params[fp];
    }
  }
  var name = params.name;
  var t = this,scb = statuscb;
  //console.log('roles',params.roles);
  this.cbs.checkUserName(name,params.roles,function(roles){
    if(roles===null){
      //anonymous?
      //console.log('anonymous?');
      scb('OK');
    }
    var _scb = scb;
    t.data.setUser(name,t.self.realmname,roles,function(user){
      var session = t.self.newSession();
      t.self.sessions[session] = user;
      user.roles=roles;
      user.makeSession(session);
      _scb('OK',user,session);
    });
  });
};
findUser.params = 'originalobj';

function deleteUserSession(user,session,statuscb){
  var s = user.sessions[session];
  if(s){
    s.dumpQueue();
  }else{
    //console.log('no session',session);
  }
};
deleteUserSession.params=['user','session'];

function dumpUserSession(user,session,statuscb){
  var s = user.sessions[session];
  if(!s){
    return statuscb('NO_SESSION',session);
  }
  var so = {};
  so[this.self.fingerprint] = session;
  user.sessions[session].dumpQueue(function(data){
    statuscb('OK',[so,data]);
  });
};
dumpUserSession.params=['user','session'];

function invokeOnUserSession(user,session,path,paramobj,cb,statuscb){
  user.invoke(path,paramobj,cb);
};
invokeOnUserSession.params=['user','session','path','paramobj','cb'];


function init(){
  this.self.sessions = {};
  this.self.fingerprint = RandomBytes(12).toString('hex');
  var counter = new BigCounter();
  this.self.newSession = function(){
    counter.inc();
    return RandomBytes(12).toString('hex')+'.'+counter.toString();
  };
  this.data.userFactory = {create:function(data,username,realmname){
    return new SessionUser(data,username,realmname);
  }};
};

module.exports = {
  errors:errors,
  init:init,
  findUser:findUser,
  dumpUserSession:dumpUserSession,
  deleteUserSession:deleteUserSession,
  invokeOnUserSession:invokeOnUserSession,
  requirements:{
    checkUserName:function(username,roles,cb){
      cb(roles);
    }
  }
};
