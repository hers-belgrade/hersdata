var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var Utils = require('util');
var BigCounter = require('./BigCounter');

function randomstring(){
  return RandomBytes(12).toString('hex');
};

//consumerTimeout = 2*60*1000;

function Consumer(session,destructcb){
  this.session = session;
  this.queue = [];
  this.destructCb = (typeof destructcb === 'undefined') ? function(){} : destructcb;
};
Consumer.prototype.add = function(txnid,primitives){
  var isupdate = (primitives[0][1]==='update');
  if(this.id){
    if(!isupdate){
      if(!this.id.isPredecessorOf(txnid)){
        console.trace();
        throw this.id.toString()+' not a predecessor of '+txnid.toString();
      }
    }else{
      if(!this.id.equals(txnid)){
        console.trace();
        throw this.id.toString()+' not equal to '+txnid.toString();
      }
    }
  }
  if(this.queuecb){
    //console.log('dumping',[this.session,primitives]);
    this.queuecb([this.session,primitives]);
    delete this.queuecb;
  }else{
    if(!isupdate){
      this.queue  = this.queue.concat(primitives);
    }else{
      if(this.queue.length){
        //console.log(this.name,'should update',this.queue,'with',primitives);
        var lqe = this.queue.splice(-1);
        var pl = primitives.length;
        for(var i=1; i<pl-1; i++){ //omit the start update and end update
          this.queue.push(primitives[i]);
        }
        this.queue.push(lqe[0]);
        //console.log('finally after update',this.queue);
      }else{
        this.queue  = primitives;
      }
    }
  }
  this.id = txnid;
};

Consumer.prototype.die = function(){
  var dr = this.destructCb.apply(this);
  if(dr!==false){
    if(this.to){
      clearTimeout(this.to);
    }
    for(var i in this){
      delete this[i];
    }
  }
};

Consumer.prototype.dumpqueue = function(cb){
  if(this.to){
    clearTimeout(this.to);
  }
  this.to = setTimeout((function(_t){var t=_t; return function(){t.die();};})(this),15000);
  if(typeof cb !== 'function'){
    return;
  }
  //this.resetTimer();
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

function ConsumerIdentity(name,roles, connection_status_cb){
  this.name = name;
  this.reset(roles);
  this.datacopy = {};

	var online = false;
	this.checkOnLine = function () {
		var old_ol = online;
		online = (Object.keys(this.consumers).length > 0);
		(old_ol != online) && ('function' === typeof(connection_status_cb)) && connection_status_cb.call(this, online);
	}
};

ConsumerIdentity.prototype.addKey = function(key,initcb){
  if(this.keyring.contains(key)){
    return;
  }
  this.keyring.addKey(key);
  this.overlayTransaction.apply(this,initcb());
};
ConsumerIdentity.prototype.removeKey = function(key){
  if(this.roles.contains(key)){
    return;
  }
  this.keyring.removeKey(key);
	/// CHECK MY OBLIGATIONS FOR BOTH SYSTEM AND ENVIRONMENT
};
ConsumerIdentity.prototype.reset = function(roles){
  this.roles = roles;
  this.keyring = new KeyRing();
  this.keyring.take(roles);
  this.consumers = {};
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
  //console.log('initiationPrimitives',ret);
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
  //console.log('processing',txnalias,txnprimitives,datacopytxnprimitives,txnid);
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
    for(var j=0; j<path.length; j++){
      target = target[path[j]];
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
          if((typeof name !== 'undefined') && name.length){
            //console.log('setting',name,'to',myp[2],'on',target,'for',path);
            target[name] = (typeof myp[2] === 'object') ? {} : myp[2];
          }else{
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
  //console.log('processTransaction produced',primitives);
  for(var i in this.consumers){
    this.consumers[i].add(txnid,primitives);
  }
  //console.log(this.name,this.keyring);
  //console.log(Utils.inspect(this.datacopy,false,null,false));
};
ConsumerIdentity.prototype.overlayTransaction = function(txnalias,txnprimitives,datacopytxnprimitives,txnid){
  //console.log('processing',txnalias,txnprimitives,datacopytxnprimitives,txnid);
  this.txnid = txnid;
  var primitives = [];
  function addPrimitive(p){
    primitives.push(p);
  };
  if(txnalias==='init'){//and it's gotta be init
    txnalias = 'update';
  }
  addPrimitive(['start',txnalias,txnid.value()]);
  var dps = this.filterCopyPrimitives(datacopytxnprimitives);
  for(var i in dps){
    var myp = dps[i];
    //console.log('*',myp,'*');
    var path = myp[1].slice();
    var name = path.splice(-1);
    var target = this.datacopy;
    for(var j=0; j<path.length; j++){
      target = target[path[j]];
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
            //console.log('deleting',name);
            delete target[name];
            myp = ['remove',path.concat([name])];
          }else{
            myp = undefined;
          }
        }else{
          if((typeof name !== 'undefined') && name.length){
            if(typeof myp[2] === 'object'){
              if(typeof target[name] === 'object'){
                myp = undefined;
              }else{
                target[name] = {};
              }
            }else{
              if(myp[2]===target[name]){
                myp = undefined;
              }else{
                //console.log('setting',name,'to',myp[2],'on',target,'for',path);
                target[name] = myp[2];
              }
            }
          }else{
            //console.log('name was',name,'discarding');
            myp = undefined;
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
  //console.log('overlayTransaction produced',primitives);
  for(var i in this.consumers){
    this.consumers[i].add(txnid,primitives);
  }
  //console.log(Utils.inspect(this.datacopy,false,null,false));
};

function ConsumerLobby(connection_status_cb){
  this.sessionkeyname = randomstring();
  //console.log(this.sessionkeyname);
  this.counter = new BigCounter();
  this.identities = {};
  this.sess2consumer = {};
  this.sess2identity = {};
  this.anonymous = new ConsumerIdentity();
	this.connection_status_cb = connection_status_cb;
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
      user.reset(rkr);
    }
  }else{
    if(name){
			var self = this;
      user = new ConsumerIdentity(name,rkr, (function(_ids){
        var ids = _ids;
        return function (online) {
				('function' === typeof(self.connection_status_cb)) && self.connection_status_cb.call(self,this.name, online); 
        if(!online){
          delete ids[this.name];
          for(var i in this){
            this[i] = null;
          }
        }
			};})(this.identities));
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
		user.checkOnLine();
  };
  var c = new Consumer(sessionobj,consdestroyed);
  c.add(user.txnid,user.initiationPrimitives());

  user.consumers[sess] = c;
  s2c[sess] = c;
  s2i[sess] = user;
	user.checkOnLine();

  return [user,c];
};
ConsumerLobby.prototype.processTransaction = function(txnalias,txnprimitives,datacopytxnprimitives,txnid){
  var mu = process.memoryUsage().rss;
  var ids = this.identities;
  var ccnt = 0;
  var cnms = [];
  for(var i in ids){
    ccnt ++;
    cnms.push(i);
    var id = ids[i];
    id.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid);
  }
  this.anonymous.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid);
  var mu1 = process.memoryUsage().rss;
  console.log('consumer names',cnms,'count',ccnt);
  if(mu1!==mu){
    console.log('processTransaction memleak',Math.floor((mu1-mu)/1024/1024),'MB','usage',Math.floor(mu1/1024/1024),'MB');
  }
};

module.exports = ConsumerLobby;
