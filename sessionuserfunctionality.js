var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var Follower = require('./follower');
var BigCounter = require('./BigCounter');

scalarValue = function(keyring,scalar){
  return keyring.contains(scalar.access_level()) ? scalar.value() : scalar.public_value();
};

function SessionFollower(keyring,path,txncb){
  var scalars={};
  var collections={};
  this.listeners = {};
  this.keyring = keyring;
  this.path = path;
  this._localdump = function(){
    var mydump = [];
    for(var i in scalars){
      mydump.push([i,scalars[i].value]);
    };
    for(var i in collections){
      mydump.push([i,null]);
    };
    //console.log('localdump',mydump);
    return mydump;
  };
  var txnqueue=[];
  this.dumptxnqueue = function(){
    var ret = txnqueue.splice(0);
    return ret;
  };
  function cb(name,ent){
    if(ent){
      //console.log('scalars',scalars,'collections',collections);
      switch(ent.type()){
        case 'Scalar':
          var val = {};
          val.handler = ent.subscribeToValue(function(el){
            var sv = scalarValue(keyring,el)
            val.value = sv;
            txnqueue.push([name,sv]);
            //console.log('value of',name,'is',sv,tq);
          });
          scalars[name] = val;
        break;
        case 'Collection':
          collections[name] = null;
        break;
      }
    }else{
      if(scalars[name]){
        txnqueue.push([name]);
        delete scalars[name];
      }else if(collections[name]){
        txnqueue.push([name]);
        delete collections[name];
      }
    }
  };
  Follower.call(this,keyring,path,cb);
  this.follower = function(name){
    return listeners[name];
  };
  var superDestroy = this.destroy;
  this.destroy = function(){
    superDestroy.call();
    for(var i in listeners){
      this.listeners[i].destroy();
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
};
SessionFollower.prototype.startTxn = function(txnalias){
  if(this.txnalias && txnalias!==txnalias){
    throw 'Already in txn '+this.txnalias;
  }
  //console.log(this.path.join('.'),'starting txn',txnalias);
  this.txnalias=txnalias;
  for(var i in this.listeners){
    this.listeners[i].startTxn(txnalias);
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
  for(var i in this.listeners){
    var ce = this.listeners[i].endTxn(txnalias);
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
  if(!this.listeners[name]){
    this.listeners[name] = new SessionFollower(this.keyring,this.path.concat([name]));
    if(this.doEndTxn){
      var virtualtxn = 'new_follower_'+name;
      this.startTxn(virtualtxn);
      this.doEndTxn(virtualtxn);
    }
    return true;
  }
};
SessionFollower.prototype.dump = function(){
  var childdumps = {};
  var ret = [this._localdump(),childdumps]
  for(var i in this.listeners){
    childdumps[i] = this.listeners[i].dump();
  }
  return ret;
};

function UserSession(datadump){
  this.queue = [['init',datadump]];
};
UserSession.prototype.add = function(txnalias,txns){
  this.queue.push([txnalias,txns]);
  this.dumpQueue();
};
UserSession.prototype.dumpQueue = function(cb){
  if(this.cb){
    //console.log('dumping on previous cb with queue length',this.queue.length);
    this.cb(this.queue);
    this.queue=[];
    this.cb = cb;
  }else{
    if(this.queue.length){
      if(typeof cb === 'function'){
        //console.log('dumping on queue length',this.queue.length);
        cb(this.queue);
        this.queue=[];
      }
    }else{
      if(cb){
        //console.log('setting cb',cb,'for future use');
      }
      this.cb = cb;
    }
  }
};
function SessionUser(data,username,realmname){
  KeyRing.call(this,data,username,realmname);
  var sessions = {};
  this.sessions = sessions;
  this.username=username;
  this.realmname=realmname;
  this.follower = new SessionFollower(this,[],function(txnalias,txns){
    console.log('txn done',txnalias,txns);
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
  console.log('invoking',path,paramobj,this.username,this.realmname,this.roles);
  this.data.invoke(path,paramobj,this.username,this.roles,cb);
};
SessionUser.prototype.makeSession = function(session){
  var s = this.sessions[session];
  if(!s){
    //console.log('there is no session',session);
    this.sessions[session] = new UserSession(this.follower.dump());
  }
};
SessionUser.prototype.follow = function(path){
  if(!path){return;}
  var f = this.follower;
  while(path.length>1 && f && typeof e !== 'undefined'){
    var pe = path.unshift();
    f = f.follower(pe);
    e = e[pe];
  }
  if(f){
    if(f.follow(path[0])){
      for(var i in this.sessions){
        this.sessions[i].dumpQueue();
      }
    }
  }
};


var errors = {
  'OK':{message:'OK'}
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
  console.log('roles',params.roles);
  this.cbs.checkUserName(name,params.roles,function(roles){
    if(roles===null){
      //anonymous?
      console.log('anonymous?');
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

function dumpUserSession(user,session,statuscb){
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
  invokeOnUserSession:invokeOnUserSession,
  requirements:{
    checkUserName:function(username,roles,cb){
      cb(roles);
    }
  }
};
