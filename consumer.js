var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var Utils = require('util');
var BigCounter = require('./BigCounter');

function randomstring(){
  return RandomBytes(12).toString('hex');
};

consumerTimeout = 2*60*1000;

function Consumer(session,destructcb){
  this.session = session;
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
    this.queuecb([this.session,primitives]);
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
  if(typeof cb !== 'function'){
    return;
  }
  this.resetTimer();
  if(typeof this.queuecb === 'function'){
    this.queuecb([this.session,this.queue.splice(0)]);
    this.queuecb = cb;
  }else{
    if(this.queue.length){
      cb([this.session,this.queue.splice(0)]);
    }else{
      this.queuecb = cb;
    }
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
ConsumerIdentity.prototype.initiationPrimitives = function(){
  var ret = [['start','init']];
  function add(path,value){
    ret.push(['set',path.slice(),value]);
  };
  function traverse(path,object){
    add(path,{});
    for(var i in object){
      var o = object[i];
      var p = path.concat(i);
      if(typeof o === 'object'){
        traverse(p,o);
      }else{
        add(p,o);
      }
    }
  };
  traverse([],this.datacopy);
  ret.push(['end','init']);
  return ret;
};
ConsumerIdentity.prototype.filterCopyPrimitives = function(datacopytxnprimitives){
  var ret = [];
  for(var i in datacopytxnprimitives){
    var _p = datacopytxnprimitives[i];
    if(!(Utils.isArray(_p)&&_p.length)){
      continue;
    }
    var myp = _p[this.keyring.contains(_p[0]) ? 2 : 1];
    if(!(Utils.isArray(myp)&&myp.length)){
      continue;
    }
    ret.push(myp);
  }
  return ret;
};
ConsumerIdentity.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives,txnid){
  this.txnid = txnid;
  var primitives = [];
  function addPrimitive(p){
    primitives.push(p);
  };
  addPrimitive(['start',txnalias,txnid.value()]);
  var dps = this.filterCopyPrimitives(datacopytxnprimitives);
  for(var i in dps){
    var myp = dps[i];
    var path = myp[1].slice();
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
          if(name && name.length){
            target[name] = myp[2];
          }else{
            console.log(this.name,'resetting datacopy');
            this.datacopy = {};
          }
        }
        break;
      case 'remove':
        if(typeof target[name] !== 'undefined'){
          //console.log('deleting',name,'from',path);
          delete target[name];
        }else{
          //console.log('Cannot remove',name,'from',path);
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
  //console.log(this.sessionkeyname);
  this.counter = new BigCounter();
  this.identities = {};
  this.sess2consumer = {};
  this.sess2identity = {};
  this.anonymous = new ConsumerIdentity();
}
ConsumerLobby.prototype.identityAndConsumerFor = function(credentials,initcb){
  //console.log('analyzing',credentials);
  var sess = credentials[this.sessionkeyname];
  var s2c = this.sess2consumer;
  var s2i = this.sess2identity;
  if(sess){
    var ci = s2c[sess];
    if(ci){
      return [s2i[sess],ci];
    }
  }else{
    this.counter.inc();
    sess = randomstring()+'.'+this.counter.toString();
  }
  var name = credentials.name;
  var rolearray = credentials.roles;
  var rkr = new KeyRing();
  if(rolearray && Utils.isArray(rolearray)){
    rkr.addKeys(rolearray);
  }
  var user = this.identities[name];
  if(user){
    if(!user.roles.containsKeyRing(rkr)){
      console.log(user,'does not contain',rkr,'?');
      user.reset();
    }
  }else{
    if(name){
      user = new ConsumerIdentity(name,rkr);
      user.processTransaction.apply(user,initcb());
      this.identities[name] = user;
    }else{
      user = this.anonymous;
    }
  }
  var sessionobj = {};
  sessionobj[this.sessionkeyname] = sess;
  function consdestroyed(){
    delete user.consumers[sess];
    delete s2c[sess];
    delete s2i[sess];
  };
  var c = new Consumer(sessionobj,consdestroyed);
  c.add(user.txnid,user.initiationPrimitives());
  console.log('created for',sess);
  user.consumers[sess] = c;
  s2c[sess] = c;
  s2i[sess] = user;
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
