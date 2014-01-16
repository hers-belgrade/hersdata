var KeyRing = require('./keyring'),
  Follower = require('./follower'),
  util = require('util'),
  BigCounter = require('./BigCounter');

scalarValue = function(keyring,scalar){
  return keyring.contains(scalar.access_level()) ? scalar.value() : scalar.public_value();
};

function SessionFollower(keyring,path,txncb){
  //console.log('new follower',path,keyring.keys);
  var scalars={};
  var collections={};
  var followers = {};
	this.followers = followers;
  this.keyring = keyring;
  this.path = path;
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
            //console.log(path.join('.'),'refreshing',name);
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
      this.followers[i].destroy();
      delete this.followers[i];
    }
    for(var i in scalars){
      scalars[i].handler.destroy();
      delete scalars[i];
    }
    t.txnBeginsListener && keyring.data.txnBegins.detach(t.txnBeginsListener);
    t.txnEndsListener && keyring.data.txnEnds.detach(t.txnEndsListener);
    superDestroy.call(t);
  };
  if(typeof txncb==='function'){
    this.txnBeginsListener = keyring.data.txnBegins.attach(function(_txnalias){
      t.startTxn(_txnalias);
    });
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
	//console.log('should follow',name);
  if(!this.followers[name]){
		//console.log(this.path.join('.'),'created follower',name);
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
  var cu = this.currentUsers ? this.currentUsers() : [];
  var ret = [[this._localdump(),cu],childdumps];
  for(var i in this.followers){
    childdumps[i] = this.followers[i].dump();
  }
  return ret;
};

function _now(){
  return (new Date()).getTime();
}

var userSessions = {};
var userSessionCounter = new BigCounter();
var lastCheck = _now();

function checkAndClear(){
  var now = _now();
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
    }else{
      //console.log(i,'should not be deleted yet',us.lastAccess,now);
    }
  }
  lastCheck = now;
}

function UserSession(datadump,destroycb){
  this.lastAccess = _now();
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
};
UserSession.prototype.dumpQueue = function(cb,justpeek){
  this.lastAccess = _now();
  if(this.cb){
    //console.log('dumping on previous cb with queue length',this.queue.length);
    //console.log('dumping',util.inspect(this.queue,false,null,false));
    this.cb(this.queue);
    this.queue=[];
    if(justpeek){
      delete this.cb;
      cb();
    }else{
      this.cb = cb;
    }
  }else{
    if(this.queue.length){
      if(typeof cb === 'function'){
        //console.log('dumping on queue length',this.queue.length);
        //console.log('dumping',util.inspect(this.queue,false,null,false));
        cb(this.queue);
        this.queue=[];
      }
    }else{
      if(justpeek){
        cb();
      }else{
        this.cb = cb;
      }
    }
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
  }
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
