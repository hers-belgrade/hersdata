
scalarValue = function(keyring,scalar){
  return keyring.contains(scalar.access_level()) ? scalar.value() : scalar.public_value();
};

function SessionFollower(keyring,path,txncb){
  //console.log('new follower',path);
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
      mydump.push([i,null]);
    };
    //console.log(path.join('.'),'dump',mydump);
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
                if(path[path.length-1]==='pots'){
                  console.log(path.join('.'),'pushing',name,sv);
                }
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
            console.log(path.join('.'),'refreshing',name);
						followers[name].refresh();
					}
        break;
        default:
          //console.log(path.join('.'),'cannot push',name);
        break;
      }
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
        console.log(path.join('.'),'pushing deletion of',name);
        txnqueue.push([name]);
        delete collections[name];
      }else{
        //console.log(path.join('.'),'has no',name,'to delete');
      }
    }
  };
	var t = this;
  this.refresh = function(){
		Follower.call(t,keyring,path,cb);
    for(var i in followers){
      console.log('subrefreshing',i);
      followers[i].refresh();
    }
	};
	this.refresh();
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
UserSession.prototype.dumpQueue = function(cb,justpeek){
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
  if(!this.cb){
    if(this.timeout){
      clearTimeout(this.timeout);
    }
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
SessionUser.prototype.addKey = function(key){
  KeyRing.prototype.addKey.call(this,key);
  this.follower.triggerTxn('new_key_'+key);
  for(var i in this.sessions){
    this.sessions[i].dumpQueue();
  }
};
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
