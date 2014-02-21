var KeyRing = require('./keyring'),
  Follower = require('./follower'),
  util = require('util'),
  BigCounter = require('./BigCounter'),
  Timeout = require('herstimeout');

scalarValue = function(keyring,scalar){
  return keyring.contains(scalar.access_level()) ? scalar.value() : scalar.public_value();
};

function SessionFollower(keyring,path,txncb){
  //console.log('new follower',path,keyring.keys);
  var scalars={};
  var collections={};
  var followers = {};
  var inactivefollowers = {};
  this.followers = followers;
  this.inactivefollowers = inactivefollowers;
  this.keyring = keyring;
  this.path = path;
  this.hasCollection = function(name){
    return typeof collections[name] !== 'undefined';
  };
  this._localdump = function(){
    var mydump = [];
    for(var i in scalars){
      if(typeof scalars[i].value !== 'undefined'){
        mydump.push([i,scalars[i].value]);
      }else{
        //console.log('scalar',i,scalars[i],'has no value');
      }
    };
    for(var i in collections){
      //console.log(path.join('.'),'dumping collection',i);
      mydump.push([i,null]);
    };
    //console.log(path.join('.'),'dump',mydump);
    return mydump;
  };
  var txnqueue=[];
  var userqueue = [];
  this.dumptxnqueue = function(){
    if(!(txnqueue.length||userqueue.length)){
      return;
    }
    return [txnqueue.splice(0),userqueue.splice(0)];
  };
  function cb(name,ent){
    if(ent){
      //console.log(path.join('.'),'before: scalars',scalars,'collections',collections);
      switch(ent.type()){
        case 'Scalar':
          var val = {};
          if(typeof scalars[name] === 'undefined'){
            val.handler = ent.subscribeToValue(function(el){
              var sv = scalarValue(keyring,el);
              if(typeof sv !== 'undefined'){
                val.value = sv;
                //console.log(path.join('.'),'pushing',name,sv);
                txnqueue.push([name,sv]);
              }else{
                //console.log(path.join('.'),name,'cannot be pushed');
              }
            });
            scalars[name] = val;
          }
        break;
        case 'Collection':
          collections[name] = null;
          //console.log(path.join('.'),'pushing collection',name);
          txnqueue.push([name,null]);
          if(followers[name]){
            delete followers[name].shouldInactivate;
          }
          if(inactivefollowers[name]){
            //console.log(path.join('.'),'refreshing',name);
            followers[name] = inactivefollowers[name];
            delete inactivefollowers[name];
            followers[name].refresh();
          }
        break;
        default:
          //console.log(path.join('.'),'cannot push',name);
        break;
      }
      //console.log(path.join('.'),'after: scalars',scalars,'collections',collections);
    }else{
      //console.log('follower should delete',name,scalars,collections);
      if(typeof scalars[name] !== 'undefined'){
        //console.log(path.join('.'),'pushing deletion of',name);
        txnqueue.push([name]);
        if(scalars[name].handler){
          scalars[name].handler.destroy();
        }
        scalars[name] = null;
        delete scalars[name];
      }else if(typeof collections[name] !== 'undefined'){
        //console.log(path.join('.'),'pushing deletion of',name);
        txnqueue.push([name]);
        delete collections[name];
        if(followers[name]){
          followers[name].shouldInactivate = true;
        }
      }else{
        //console.log(path.join('.'),'has no',name,'to delete');
      }
    }
  };
  var usercb = function(operation,username,realmname){
    //console.log(path.join('.'),'user',operation,username,realmname);
    userqueue.push([operation,username,realmname]);
  };
  var t = this;
  this.refresh = function(){
    //console.log(path.join('.'),'refresh');
    Follower.call(t,keyring,path,cb,usercb);
    for(var i in followers){
      //console.log('subrefreshing',i);
      followers[i].refresh();
    }
  };
  this.refresh();
  var superDestroy = this.destroy;
  this.destroy = function(){
    for(var i in followers){
      followers[i].destroy();
      delete followers[i];
    }
    for(var i in inactivefollowers){
      inactivefollowers[i].destroy();
      delete inactivefollowers[i];
    }
    for(var i in scalars){
      scalars[i].handler.destroy();
      delete scalars[i];
    }
    for(var i in collections){
      delete collections[i];
    }
    t.txnBeginsListener && keyring.data.txnBegins.detach(t.txnBeginsListener);
    t.txnEndsListener && keyring.data.txnEnds.detach(t.txnEndsListener);
    superDestroy.call(t);
  };
  if(typeof txncb==='function'){
    /*
    this.txnBeginsListener = keyring.data.txnBegins.attach(function(_txnalias){
      t.startTxn(_txnalias);
    });
    */
    this.doEndTxn = function(_txnalias){
      var et = t.endTxn(_txnalias);
      if(typeof et !== 'undefined'){
        //console.log(_txnalias,util.inspect(et,false,null,false));
        txncb(_txnalias,et);
      }
    };
    this.txnEndsListener = keyring.data.txnEnds.attach(this.doEndTxn);
  }
  //console.log(this._localdump(),'<>',txnqueue);
};
SessionFollower.prototype.follower = function(name){
  return this.followers[name] || this.inactivefollowers[name];
};
SessionFollower.prototype.startTxn = function(txnalias){
  return;
  if(this.txnalias){
    console.log('Already in txn '+this.txnalias);
    process.exit(0);
  }
  //console.log(this.path.join('.'),'starting txn',txnalias);
  this.txnalias=txnalias;
  for(var i in this.followers){
    this.followers[i].startTxn(txnalias);
  }
};
SessionFollower.prototype.endTxn = function(txnalias){
  /*
  if(this.txnalias!==txnalias){
    console.log('Cannot end txn '+txnalias+', already in txn '+this.txnalias);
    process.exit(0);
  }
  delete this.txnalias;
  //console.log(this.path.join('.'),'ending txn',txnalias);
  */
  var has_data = false;
  var childtxns={};
  for(var i in this.followers){
    var f = this.followers[i];
    var ce = f.endTxn(txnalias);
    if(typeof ce !== 'undefined'){
      has_data=true;
      childtxns[i] = ce;
    }
    if(f.shouldInactivate){
      this.inactivefollowers[i] = this.followers[i];
      delete this.followers[i];
      delete f.shouldInactivate;
    }
  }
  var tq = this.dumptxnqueue();
  if(has_data || (tq&&tq.length>0)){
    return [tq,childtxns];
  }
};
SessionFollower.prototype.follow = function(name){
  //console.log('should follow',name);
  if(this.followers[name]||this.inactivefollowers[name]){
    return;
  }
  var target = this.hasCollection(name) ? this.followers : this.inactivefollowers;
  target[name] = new SessionFollower(this.keyring,this.path.concat([name]));
  return true;
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
  var cu = this.currentUsers ? this.currentUsers() : [];
  var ret = [[this._localdump(),cu],childdumps];
  for(var i in this.followers){
    childdumps[i] = this.followers[i].dump();
  }
  return ret;
};

var userSessions = {};
var userSessionCounter = new BigCounter();
var lastCheck = Timeout.now();

function checkAndClear(){
  var now = Timeout.now();
  if(now - lastCheck < 15000){
    return;
  }
  for(var i in userSessions){
    var us = userSessions[i];
    if(now - us.lastAccess > 15000){
      if(us.destroycb()){//ok to destroy
        //console.log(i,us,'reported it is ok to destroy');
        for(var k in us){
          delete us[k];
        }
        delete userSessions[i];
      }
    }/*else{
      console.log(i,'should not be deleted yet',us);//.lastAccess,now,'cb',typeof us.cb,'qlen',us.queue.length);
    }*/
  }
  lastCheck = now;
}

function UserSession(datadump,destroycb,debug){
  this.debug = debug;
  this.lastAccess = Timeout.now();
  userSessionCounter.inc();
  userSessions[userSessionCounter.toString()] = this;
  this.queue = [['init',datadump]];
  var t = this;
  this.destroycb = function(){
    if(t.cb){
      t.dumpQueue();
      return;
    }
    delete t.queue;
    destroycb();
    return true;
  }
};
UserSession.prototype.add = function(txnalias,txns){
  this.queue.push([txnalias,txns]);
  this.dumpQueue();
  if(this.debug){
    console.log('qlen after dump',this.queue.length,'got cb',typeof this.cb);
  }
};
UserSession.prototype.retrieveQueue = function(){
  this.lastAccess = Timeout.now();
  return this.queue.splice(0);
};
UserSession.prototype.dumpQueue = function(cb,justpeek){
  if(justpeek){
    if(this.queue.length){
      cb(this.retrieveQueue());
    }else{
      cb();
    }
  }else{
    if(this.cb){
      this.cb(this.retrieveQueue());
      this.cb = cb;
    }else{
      if(this.queue.length){
        if(typeof cb === 'function'){
          cb(this.retrieveQueue());
        }
      }else{
        this.cb = cb;
      }
    }
  }
  if(this.debug){
    console.log('after dumpQueue qlen',this.queue.length,'this.cb',typeof this.cb,'cb was',typeof cb,'justpeek was',justpeek);
  }
  checkAndClear();
};
function SessionUser(data,username,realmname,roles){
  console.log('new SessionUser',username,realmname,roles);
  KeyRing.call(this,data,username,realmname,roles);
  var sessions = {};
  this.sessions = sessions;
  this.username=username;
  this.realmname=realmname;
  this.follower = new SessionFollower(this,[],function(txnalias,txns){
    //console.log('txn done',txnalias,util.inspect(txns,false,null,false));
    /*
    if(username==='milojko'){
      console.log('done',txnalias);
    }
    */
    for(var i in sessions){
      sessions[i].add(txnalias,txns);
    }
    //console.log('txn done',util.inspect(sessions,false,null,false));
  });
};
SessionUser.prototype = new KeyRing();
SessionUser.prototype.constructor = SessionUser;
SessionUser.prototype.addKey = function(key){
  KeyRing.prototype.addKey.call(this,key);
  if(!this.follower){return;}
  this.follower.triggerTxn('new_key_'+key);
  for(var i in this.sessions){
    this.sessions[i].dumpQueue();
  }
};
SessionUser.prototype.destroy = function(){
  this.follower.destroy();
  //this.destroytree();
  for(var i in this.sessions){
    var s = this.sessions[i];
    s.destroycb();
  }
  KeyRing.prototype.destroy.call(this);
};
SessionUser.prototype.makeSession = function(session){
  var ss = this.sessions;
  var s = ss[session];
  if(!s){
    //console.log('there is no session',session);
    ss[session] = new UserSession(this.follower.dump(),function(){
      /*
      console.log('deleting session',session);
      if(!ss[session]){
        console.log('but it does not exist?');
      }
      */
      delete ss[session];
    });
    //console.log('made session',session);
  }
};
SessionUser.prototype.follow = function(path){
  //console.log('I was told to follow',path);
  var ps = path.join('_');
  if(!path){return;}
  var f = this.follower;
  while(path.length>1){
    var pe = path.shift();
    //console.log('investigating',pe);
    var _f = f.follower(pe);
    if(!_f){
      f.follow(pe);
      _f = f.follower(pe);
      if(!_f){
        //console.log('following',path,'on',pe,'failed');
      }else{
        f=_f;
      }
    }else{
      f = _f;
    }
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


module.exports = SessionUser;
