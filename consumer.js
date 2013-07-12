var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var utils = require('util');
var BigCounter = require('./BigCounter');

function randomstring(){
  return RandomBytes(12).toString('hex');
};

consumerTimeout = 2*60*1000;

function Consumer(destructcb){
  this.queue = [];
  this.destructCb = (typeof destructcb === 'undefined') ? function(){} : destructcb;
};
Consumer.prototype.add = function(txnid,primitives){
  if(this.id && !this.id.isPredecessorOf(txnid)){
    throw id.toString()+' not a predecessor of '+txnid.toString();
    this.id.reset();
    this.queue = [];
    return;
  }
  if(this.queuecb){
    console.log('calling');
    this.queuecb(primitives);
    delete this.queuecb;
  }else{
    this.queue  = this.queue.concat(primitives);
  }
  this.id = txnid;
};
Consumer.prototype.resetTimer = function(){
  if(this.timer){
    clearTimeout(this.timer);
  }
  var t = this;
  this.timer = setTimeout(function(){t.die()},consumerTimeout);
}
Consumer.prototype.die = function(){
  var dr = this.destructCb.apply(this);
  if(dr!==false){
    if(this.timer){
      clearTimeout(this.timer);
    }
    for(var i in this){
      delete this[i];
    }
  }
};
Consumer.prototype.dumpqueue = function(cb){
  console.log('should dump to',cb);
  if(typeof cb !== 'function'){
    return;
  }
  if(this.queue.length){
    var ret = this.queue.slice();
    this.queue = [];
    cb(ret);
  }else{
    if(typeof this.queuecb === 'function'){
      this.queuecb();
    }
    this.queuecb = cb;
  }
};

function ConsumerIdentity(name,roles){
  this.name = name;
  this.roles = roles;
  this.keyring = new KeyRing();
  this.keyring.take(roles);
  this.consumers = {};
  this.datacopy = {};
};
ConsumerIdentity.prototype.refresh = function(session){
  var c = this.consumers[session];
  if(!c){
    return;
  }
  c.resetTimer();
  return c;
};
ConsumerIdentity.prototype.filterCopyPrimitives = function(datacopytxnprimitives){
  var ret = [];
  for(var i in datacopytxnprimitives){
    var _p = datacopytxnprimitives[i];
    if(!(utils.isArray(_p)&&_p.length)){
      continue;
    }
    var myp = _p[this.keyring.contains(_p[0]) ? 2 : 1];
    if(!(utils.isArray(myp)&&myp.length)){
      continue;
    }
    ret.push(myp);
  }
  return ret;
};
ConsumerIdentity.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives,txnid){
  var empty=true;
  for(var i in this.consumers){
    empty = false;
    break;
  }
  if(empty){
    return;
  }
  var primitives = [];
  function addPrimitive(p){
    primitives.push(p);
  };
  addPrimitive(['start',txnalias,txnid.value()]);
  var dps = this.filterCopyPrimitives(datacopytxnprimitives);
  for(var i in dps){
    var myp = dps[i];
    var path = myp[1];
    var name = path.splice(-1);
    var target = this.datacopy;
    for(var i=0; i<path.length; i++){
      target = target[path[i]];
      if(!target){
        break;
      }
    }
    //console.log('target',target);
    if(!target){
      continue;
    }
    switch(myp[0]){
      case 'set':
        if(typeof myp[2] === 'undefined'){
          if(typeof target[name] !== 'undefined'){
            delete target[name];
            myp = ['remove',path.concat([name])];
          }else{
            myp = undefined;
          }
        }else{
          target[name] = myp[2];
        }
        break;
      case 'remove':
        if(typeof target[name] !== 'undefined'){
          console.log('deleting',name,'from',path);
          delete target[name];
        }else{
          console.log('Cannot remove',name,'from',path);
          myp = undefined;
        }
        break;
    }
    if(myp){
      addPrimitive(myp);
    }
  }
  addPrimitive(['end',txnalias]);
  for(var i in this.consumers){
    this.consumers[i].add(txnid,primitives);
  }
  //console.log(this.datacopy);
};

function ConsumerLobby(){
  this.sessionkeyname = randomstring();
  console.log(this.sessionkeyname);
  this.counter = new BigCounter();
  this.identities = {};
  this.sess2name = {};
  this.anonymous = new ConsumerIdentity();
}
ConsumerLobby.prototype.identityAndConsumerFor = function(credentials,initcb){
  var sess = credentials[this.sessionkeyname];
  if(sess){
    var ci = this.consumerIdentityForSession(sess);
    if(ci){
      var c = ci.refresh(sess);
      if(c){
        return [ci,c];
      }
    }
  }else{
    this.counter.inc();
    sess = randomstring()+'.'+this.counter.value();
  }
  var name = credentials.name;
  var rolearray = credentials.roles;
  var rkr = new KeyRing();
  if(rolearray && utils.isArray(rolearray)){
    rkr.addKeys(rolearray);
  }
  var user = this.identities[name];
  if(user){
    if(!user.roles.containsKeyRing(rkr)){
      console.log(user.roles,'does not contain',rkr,'?');
      user.reset();
    }
  }else{
    console.log('creating consumeridentity for',name);
    if(name){
      user = new ConsumerIdentity(name,rkr);
      this.identities[name] = user;
    }else{
      user = this.anonymous;
    }
    console.log('that is',user);
  }
  var c = new Consumer();
  user.consumers[sess] = c;
  console.log('finally',user,c,rkr,rolearray);
  return [user,c];
};
ConsumerLobby.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives,txnid){
  var ids = this.identities;
  for(var i in ids){
    var id = ids[i];
    id.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid);
  }
  this.anonymous.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid);
};

module.exports = ConsumerLobby;
