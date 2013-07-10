var KeyRing = require('./keyring');
var utils = require('util');

consumerTimeout = 2*60*1000;
function Consumer(){
  this.queue = [];
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

function ConsumerIdentity(name,roles){
  this.name = name;
  this.roles = roles;
  this.keys = new KeyRing();
  this.keys.take(roles);
  this.consumers = {};
  this.datacopy = {};
};
ConsumerIdentity.prototype.refresh = function(session){
  var c = this.consumers[session];
  if(!c){
    return false;
  }
  c.resetTimer();
  return true;
};
ConsumerIdentity.prototype.broadcastPrimitive = function(primitive){
  console.log('broadcasting',primitive);
  for(var i in this.consumers){
    this.consumers[i].queue.push(primitive);
  }
};
ConsumerIdentity.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives){
  this.broadcastPrimitive(['starting',txnalias]);
  for(var i in datacopytxnprimitives){
    var _p = datacopytxnprimitives[i];
    if(!(utils.isArray(_p)&&_p.length)){
      continue;
    }
    var myp = _p[this.keys.contains(_p[0]) ? 2 : 1];
    if(!(utils.isArray(myp)&&myp.length)){
      continue;
    }
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
      this.broadcastPrimitive(myp);
    }
  }
  this.broadcastPrimitive(['ending',txnalias]);
  console.log(this.datacopy);
};

function ConsumerLobby(authenticator){
  this.authenticator = authenticator || function(credentials,cb){cb(credentials.split(','));};
  this.identities = {};
  this.sess2name = {};
  this.anonymous = new ConsumerIdentity();
}
ConsumerLobby.prototype.identityFor = function(credentials,cb){
  function invoke(){
    cb.apply(null,arguments);
  }
  var sess = credentials[this.sessionkeyname];
  if(sess){
    var ci = this.consumerIdentityForSession(sess);
    if(ci){
      if(ci.refresh(sess)){
        invoke(ci);
        return;
      }
    }
  }
  var name = credentials.hersdataidentityname;
  var crd = credentials.credentials;
  var t = this;
  function roleforname(rolearray){
    var rkr = new KeyRing();
    rkr.addKeys(rolearray);
    var user = t.identities[name];
    console.log('for',name,'user is',user);
    if(user){
      if(user.roles.containsKeyRing(rkr)){
        invoke(user);
        return;
      }
    }else{
      user = name ? t.anonymous : new ConsumerIdentity(name,rkr);
      invoke(user);
    }
  };
  this.authenticator(crd,roleforname);
};
ConsumerLobby.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives){
  var ids = this.identities;
  console.log('identities',this.identities);
  for(var i in ids){
    var id = ids[i];
    id.processTransaction(txnalias,txnprimitives,datacopytxnprimitives);
  }
  this.anonymous.processTransaction(txnalias,txnprimitives,datacopytxnprimitives);
};

module.exports = ConsumerLobby;
