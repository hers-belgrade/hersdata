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
        throw 'At '+this.name+' '+this.id.toString()+' not a predecessor of '+txnid.toString();
      }
    }else{
      if(!this.id.equals(txnid)){
        console.trace();
        throw 'At '+this.name+' '+this.id.toString()+' not equal to '+txnid.toString();
      }
    }
  }
  if(!this.to){
    this.to = setTimeout((function(_t){var t=_t; return function(){t.die();};})(this),15000);
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
  if(!this.destructCb){//I'm already dead
    console.log(this,'already dead');
    return;
  }
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
  if(typeof cb !== 'function'){
    return;
  }
  if(this.to){
    clearTimeout(this.to);
    delete this.to;
  }
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

function ConsumerIdentity(data, name, roles, connection_status_cb){
  this.name = name;
  this.keyring = new KeyRing(data,name);
  this.reset(roles);
  this.datacopy = {};

	var online = false;
	this.checkOnLine = function () {
		var old_ol = online;
		online = (Object.keys(this.consumers).length > 0);
		(old_ol != online) && ('function' === typeof(connection_status_cb)) && connection_status_cb.call(this, online);
	}
};
ConsumerIdentity.prototype.contains = function(key){
  return this.keyring && this.keyring.contains(key);
};
ConsumerIdentity.prototype.addKey = function(key,data){
  if(this.keyring.contains(key)){
    return;
  }
  this.keyring.addKey(key);
  this.overlayTransaction.apply(this,data.dump());
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
  this.keyring.reset(roles);
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

function ConsumerLobby(data){
  this.data = data;
  this.data.commit('consumers init',[
    ['set',['consumercount'],[0,undefined,'admin']]
  ]);
  this.sessionkeyname = randomstring();
  //console.log(this.sessionkeyname);
  this.counter = new BigCounter();
  var identities = {};
  this.identities = identities;
  this.sess2consumer = {};
  this.sess2identity = {};
  this.anonymous = new ConsumerIdentity(data);
	this.connection_status_cb = function(){/*console.log('connection_status_cb',arguments);*/};
  this.functionalities = {};
  var mytxnid = '_';
  var lastinit = {};
  var t = this;
  var txnprocessor = function (path,txnalias,txnprimitives,datacopytxnprimitives,txnid){
    //console.log(txnalias,txnid.toString());
    if((mytxnid!=='_')&&(!mytxnid.isPredecessorOf(txnid))){
      console.log(txnalias,'is the problem',mytxnid.toString(),txnid.toString());
    }
    mytxnid = txnid;
    delete lastinit.data;
    t.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid);
  };
  this.txnlistener = data.onNewTransaction.attach(txnprocessor);
  var dd = data.dump();
  dd.unshift([]);
  txnprocessor.apply(null,dd);
  var initcb = (function(_d){
    var data = _d;
    return function(){
      if(lastinit.txnid===mytxnid){
        return lastinit.data;
      }
      var dd = data.dump();
      mytxnid = dd[dd.length-1];
      lastinit.data = dd;
      lastinit.txnid = mytxnid;
      return lastinit.data;
    };
  })(data);
  var consumerinterface = {
    setKey : function(username,key){
      var ci = identities[username];
      if(ci){
        ci.addKey(key,initcb);
      }
    },
    removeKey : function(username,key){
      var ci = identities[username];
      if(ci){
        ci.removeKey(key);
      }
    },
  };
  this.fqnlistener = data.onNewFunctionality.attach((function(_fqns,_citf){
    var functionalities=_fqns,consumerinterface=_citf;
    return function(path,fctnobj,key){
      if(!fctnobj.consumeritf){
        fctnobj.consumeritf = consumerinterface;
      }
      functionalities[path.join('/')] = {key:key,functionality:fctnobj};
    };
  })(this.functionalities,consumerinterface));
  this.changeconsumercount = (function(_data){
    var data = _data;
    return function(delta){
      var cc = data.element(['consumercount']).value();
      data.commit('consumer down',[
        ['set',['consumercount'],[cc+delta,undefined,'admin']]
      ]);
    };
  })(data);

  this.initcb = initcb;
}
ConsumerLobby.prototype.identityAndConsumerFor = function(credentials){
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
  var rkr = new KeyRing(this.data,name);
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
      user = new ConsumerIdentity(this.data,name,rkr, (function(_ids,_ccc){
        var ids = _ids;
        var changeconsumercount = _ccc;
        return function (online) {
				('function' === typeof(self.connection_status_cb)) && self.connection_status_cb.call(self,this.name, online); 
        if(!online){
          ids[this.name].destroy();
          delete ids[this.name];
          changeconsumercount(-1);
          for(var i in this){
            this[i] = null;
          }
        }
			};})(this.identities,this.changeconsumercount));
      this.changeconsumercount(1);
      user.processTransaction.apply(user,this.initcb());
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
};
ConsumerLobby.prototype.dumpQueue = function(params){
  var cb = params.cb;
  if(typeof cb !=='function'){return;}
  var ic = this.identityAndConsumerFor(params);
  if(ic){
    ic[1].dumpqueue(cb);
  }else{
    cb();
  }
};

ConsumerLobby.prototype.consumerDown = function(params){
  console.log('consumerDown',params);
};

module.exports = ConsumerLobby;
