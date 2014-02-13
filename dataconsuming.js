var Listener = require('./listener'),
    Waiter = (require('./bridge')).Data_CollectionElementWaiter;

var allSessions = [];

function now(){
  return (new Date()).getTime();
}

var _now;

/*
setInterval(function(){
  _now = now();
  return;
  var _now = now();
  var fordel = [];
  for(var i in allSessions){
    var s = allSessions[i];
    if(s.lastAccess){
      if(_now-s.lastAccess>15000){
        s.destroy();
      }
    }else{
      s.destroy();
      fordel.unshift(i);
    }
  }
  for(var i in fordel){
    allSessions.splice(i,1);
  }
},10000);
*/

function removeFromArray(ar,el){
  if(!ar){return;}
  var ind = ar.indexOf(el);
  if(ind>=0){
    ar.splice(ind,1);
    return true;
  }
  ind = ar.indexOf(el);
  if(ind>=0){
    console.log('Element was duplicated in array');
    process.exit(0);
  }
}
function addToArray(ar,el){
  var ind = ar.indexOf(el);
  if(ind<0){
    ar.push(el);
    return true;
  }/*else{
    console.log(ar,'already has',el)
  }*/
};
function ConsumingEntity(){
  Listener.call(this);
}
ConsumingEntity.prototype = new Listener();
function ConsumingScalar(el,path,name){
  ConsumingEntity.call(this,el,path);
  this.observers = [];
  this.subscribers = [];
  this.users = [];
  this.locations = {};
  this.el = el;
  this.path = path;
  this.name = name;
  this.deleter = JSON.stringify([this.path,JSON.stringify([this.name])]);
  this.setValues();
  this.key = el.access_level();
  //console.log('new ConsumingScalar',name);
  this.createListener('elchanged',function(){
    //console.log(name,'changed',this.subscribers.length,'subs',this.observers.length,'obs');
    var key = el.access_level();
    if(this.key !== key){
      for(var i in this.users){
        this.check(this.users[i],key);
      }
      this.key = key;
    }
    this.setValues();
    for(var i in this.subscribers){
      this.subscribers[i].push(this.value);
    }
    for(var i in this.observers){
      this.observers[i].push(this.public_value);
    }
  },el.changed);
};
ConsumingScalar.prototype = new ConsumingEntity();
ConsumingScalar.prototype.notifyDestroy = function(){
  for(var i in this.subscribers){
    this.subscribers[i].push(this.deleter);
  }
  for(var i in this.observers){
    this.observers[i].push(this.deleter);
  }
};
ConsumingScalar.prototype.destroy = function(){
  ConsumingEntity.prototype.destroy.call(this);
  this.notifyDestroy();
  for(var i in this){
    delete this[i];
  }
};
ConsumingScalar.prototype.setValues = function(){
  var v = this.el.value(),pv = this.el.public_value();
  if(typeof v !== 'undefined'){
    this.value = JSON.stringify([this.path,JSON.stringify([this.name,v])]);
  }else{
    this.value = this.deleter;
  }
  if(typeof pv != 'undefined'){
    this.public_value = JSON.stringify([this.path,JSON.stringify([this.name,pv])]);
  }else{
    this.public_value = this.deleter;
  }
};
ConsumingScalar.prototype.add = function(u){
  if(this.users[u.fullname]){
    return;
  }
  this.users[u.fullname] = u;
  if(u.contains(this.key)){
    if(addToArray(this.subscribers,u)){
      this.locations[u.fullname]=1;
      if(typeof this.value !== 'undefined'){
        u.push(this.value);
      }
    }
  }else{
    if(addToArray(this.observers,u)){
      this.locations[u.fullname]=2;
      if(typeof this.public_value !== 'undefined'){
        u.push(this.public_value);
      }
    }
  }
  //console.log('after adding user',t.subscribers.length,'subs',t.observers.length,'obs');
  var nk = u.fullname+'newKey', 
    kr = u.fullname+'keyRemoved';
  this.createListener(nk, function(key){
    if(this.el.access_level()===key){
      removeFromArray(this.observers,u);
      addToArray(this.subscribers,u);
      this.locations[u.fullname] = 1;
      typeof this.value !== 'undefined' && u.push(this.value);
    }
  },u.newKey);
  this.createListener(kr,function(key){
    if(this.el.access_level()===key){
      removeFromArray(this.subscribers,u);
      addToArray(this.observers,u);
      this.locations[u.fullname] = 2;
      typeof this.public_value !== 'undefined' && u.push(this.public_value);
    }
  },u.keyRemoved);
};
ConsumingScalar.prototype.check = function(u,key){
  if(u.contains(key)){
    if(this.locations[u.fullname]===2){
      this.locations[u.fullname] = 1;
      removeFromArray(this.observers,u);
      addToArray(this.subscribers,u);
    }
  }else{
    if(this.locations[u.fullname]===1){
      this.locations[u.fullname] = 2;
      //console.log('switching',u.keys,'from subs to obs');
      u.push(this.deleter);
      removeFromArray(this.subscribers,u);
      addToArray(this.observers,u);
    }
  }
};
ConsumingScalar.prototype.remove = function(u){
  var fn = u.fullname,
    nk = fn+'newKey', 
    kr = fn+'keyRemoved';
  this.destroyListener(nk);
  this.destroyListener(kr);
  delete this.locations[u.fullname];
  removeFromArray(this.users,u);
  removeFromArray(this.subscribers,u);
  removeFromArray(this.observers,u);
};
function ConsumingCollection(el,path,name){
  ConsumingEntity.call(this,el,path,name);
  this.scalars = {};
  this.collections = {};
  this.subscribers = [];
  this.pretendents = [];
  this.waiters = [];
  this.destructionpackages = [];
  this.key = el.access_level();
  this.describer = JSON.stringify([JSON.stringify(path.slice(0,-1)),JSON.stringify([name,null])]);
  this.deleter = JSON.stringify([JSON.stringify(path.slice(0,-1)),JSON.stringify([name])]);
  this.path = path;
  this.name = name;
  //console.log('new ConsumingCollection',path,name,this.describer);
  var t = this;
  new Waiter(el,el,['*'],function(name,el){
    if(!t.scalars){return;}
    var ent, target;
    switch(el.type()){
      case 'Scalar':
        target = t.scalars;
        if(target[name]){break;}
        //console.log(t.name,'creating new Scalar',name);
        ent = new ConsumingScalar(el,path,name);
        for(var i in t.subscribers){
          ent.add(t.subscribers[i]);
        }
        break;
      case 'Collection':
        target = t.collections;
        if(target[name]){break;}
        //console.log(t.name,'creating new Collection',name);
        ent = new ConsumingCollection(el,path.concat([name]),name);
        var ek = ent.key;
        for(var i in t.subscribers){
          var s = t.subscribers[i];
          if(s.contains(ek)){
            s.push(ent.describer);
          }
        }
        var rw = [];
        for(var i in t.waiters){
          var w = t.waiters[i];
          if(w.waitingpath[0]===name){
            rw.push(w);
          }
        }
        for(var i in rw){
          var w = rw[i];
          t.remove(w.destructionindex);
          w.waitingpath.shift();
          var ok = !w.waitingpath.length;
          if(ok){
            delete w.waitingpath;
            //w.push(following_transaction_descriptor)?
          }
          ent.add(w);
        }
        break;
    }
    if(target && ent){
      t.createListener(name+'_destroyed',function(){
        for(var i in this.subscribers){
          this.subscribers[i].push(ent.deleter);
        }
        this.destroyListener(name+'_destroyed');
        ent.destroy();
        delete target[name];
      },el.destroyed);
      target[name] = ent;
    }
  });
  this.createListener('elKeyChanged',function(){
    var key = el.access_level();
    for(var i in this.subscribers){
      var s = this.subscribers[i];
      this.handleUser(s,s.contains(key));
    }
    for(var i in this.observers){
      var o = this.observers[i];
      this.handleUser(o,o.contains(key));
    }
    this.key = key;
  },el.accessLevelChanged);
  this.createListener('elDestroyed',function(){
    this.destroy();
  },el.destroyed);
  this.el = el;
};
ConsumingCollection.prototype = new ConsumingEntity();
ConsumingCollection.prototype.notifyDestroy = function(){
  for(var i in this.subscribers){
    //console.log('pushing',this.deleter,'to',this.subscribers[i].session);
    for(var j in this.scalars){
      this.subscribers[i].push(this.scalars[j].deleter);
    }
    for(var j in this.collections){
      this.subscribers[i].push(this.collections[j].deleter);
    }
  }
};
ConsumingCollection.prototype.destroy = function(){
  if(!this.subscribers){return;}
  for(var i in this.collections){
    this.collections[i].destroy();
  }
  for(var i in this.scalars){
    this.scalars[i].destroy();
  }
  ConsumingEntity.prototype.destroy.call(this);
  this.notifyDestroy();
  for(var i in this){
    delete this[i];
  }
};
ConsumingCollection.prototype.target = function(name){
  return this.collections[name] || this.scalars[name];
};
ConsumingCollection.prototype.reportTo = function(u){
  for(var i in this.collections){
    var c = this.collections[i];
    if(u.contains(c.key)){
      u.push(c.describer);
    }
  }
};
ConsumingCollection.prototype.unreportTo = function(u){
  for(var i in this.collections){
    u.push(this.collections[i].deleter);
  }
  for(var i in this.scalars){
    u.push(this.scalars[i].deleter);
  }
};
ConsumingCollection.prototype.handleUser = function(u,criterion){
  if(criterion){
    var pi = this.pretendents.indexOf(u);
    if(pi>=0){
      this.pretendents.splice(pi,1);
      addToArray(this.subscribers,u);
      this.reportTo(u);
      for(var i in this.scalars){
        this.scalars[i].add(u);
      }
    }
  }else{
    var si = this.subscribers.indexOf(u);
    if(si>=0){
      this.subscribers.splice(si,1);
      this.unreportTo(u);
      addToArray(this.pretendents,u);
    }
  }
};
ConsumingCollection.prototype.remove = function(destructionindex){
  if(!destructionindex){
    console.trace();
    console.log('no destructionindex to remove');
    process.exit(0);
  }
  var dp = this.destructionpackages[destructionindex];
  if(!dp){return;}
  delete dp.h.destructionindex;
  delete this.destructionpackages[destructionindex];
  dp.nk && this.destroyListener(dp.nk);
  dp.kr && this.destroyListener(dp.kr);
  this.destroyListener(dp.d);
  var loc = dp.h.loc;
  delete dp.h.loc;
  if(loc===1){
    removeFromArray(this.subscribers,dp.h);
  }else if(loc===2){
    removeFromArray(this.waiters,dp.h);
  }else{
    removeFromArray(this.pretendents,dp.h);
  }
  /*
  for(var i in this.subscribers){
    if(this.subscribers[i].session===dp.h.session){
      console.log(dp.h.session,'still in subscribers');
      console.log('subscribers index',this.subscribers.indexOf(dp.h));
      process.exit(0);
    }
  }
  for(var i in this.observers){
    if(this.observers[i].session===dp.h.session){
      console.log(dp.h.session,'still in observers');
      console.log('observers index',this.observers.indexOf(dp.h));
      process.exit(0);
    }
  }
  for(var i in this.waiters){
    if(this.waiters[i].session===dp.h.session){
      console.log(dp.h.session,'still in waiters');
      console.log('waiters index',this.waiters.indexOf(dp.h));
      process.exit(0);
    }
  }
  */
  console.log('Collection removed',dp.h.session);
};
ConsumingCollection.prototype.add = function(u){
  if(!this.subscribers){
    return;
  }
  var fn = u.fullname,
    d = fn+'destroyed',
    nk = fn+'newKey', 
    kr = fn+'keyRemoved'; 
  this.createListener(d,function(){
    this.destroyListener(nk);
    this.destroyListener(kr);
    this.destroyListener(d);
    removeFromArray(this.subscribers,u);
    removeFromArray(this.waiters,u);
    removeFromArray(this.pretendents,u);
  },u.destroyed);
  this.createListener(nk,function(key){
    if(key===this.key){
      var pi = this.pretendents.indexOf(u);
      if(pi>=0){
        this.pretendents.splice(pi,1);
        addToArray(this.subscribers,u);
        console.log(this.path.join('.'),':',u.username,'is a subscriber now');
        this.reportTo(u);
        for(var i in this.scalars){
          this.scalars[i].add(u);
        }
      }
    }
  },u.newKey);
  this.createListener(kr,function(key){
    if(key===this.key){
      var si = this.subscribers.indexOf(u);
      if(si>=0){
        this.unreportTo(u);
        console.log(this.path.join('.'),':',u.username,'is a pretendent now');
        this.subscribers.splice(si,1);
        addToArray(this.pretendents,u);
      }
    }
  },u.keyRemoved);
  if(u.contains(this.key)){
    addToArray(this.subscribers,u);
    this.reportTo(u);
    for(var i in this.scalars){
      this.scalars[i].add(u);
    }
  }else{
    addToArray(this.pretendents,u);
  }
};

function inserter(pathstring){
  var t = this, origsession = this.session;
  return {
    session:t.session,
    destroyed:t.destroyed,
    user:t.user,
    push: function(item){
      if(!t.queue){
        console.trace();
        console.log('no more queue on',origsession);
        process.exit(0);
      }
      t.queue.push(JSON.stringify([pathstring,item]));
      //console.log(this.session,'pushing',pathstring,item,'of',this.user.sessionStatus(),this.queue.length);
    }
  };
};
function describe(coll,u,q){
  if(!u.contains(coll.key)){
    return;
  }
  for(var i in coll.scalars){
    var s = coll.scalars[i];
    u.contains(s.key) ? q.push(s.value) : q.push(s.public_value);
  }
  for(var i in coll.collections){
    var c = coll.collections[i];
    if(u.contains(c.key)){
      q.push(c.describer);
    }
  }
}
function ConsumerSession(u,coll,session){
  this.queue = [];
  this.queue.push(ConsumerSession.initTxn);
  describe(coll,u,this.queue);
  for(var i in u.followingpaths){
    var f = u.followingpaths[i];
    if(f===1){
      continue;
    }
    describe(f,u,this.queue);
  }
  this.queue.push(ConsumerSession.initTxn);
  this.user = u;
};
ConsumerSession.initTxn = JSON.stringify([JSON.stringify([]),JSON.stringify([null,'init'])]);
ConsumerSession.prototype.destroy = function(){
  for(var i in this){
    delete this[i];
  }
};
ConsumerSession.prototype.retrieveQueue = function(){
  this.lastAccess = now();
  if(this.queue.length){
    //console.log(this.session,'splicing',this.queue);
    return this.queue.splice(0);
  }else{
    //console.log('empty q');
    return [];
  }
};
ConsumerSession.prototype.setSocketIO = function(sock){
  this.sockio = sock;
  var t = this;
  sock.on('disconnect',function(){
    delete t.sockio;
  });
  while(this.queue.length){
    sock.emit('_',this.queue.shift());
  }
};
function upgradeUserToConsumer(u,coll){
  u.fullname = u.username+'@'+u.realmname;
  var udest = u.destroy;
  Listener.call(u);
  for(var i in Listener.prototype){
    u[i] = Listener.prototype[i];
  }
  u.sessions = {};
  u.followingpaths = {};
  u.unfollowpaths = {};
  u.sessionStatus = function(){
    var ret = {};
    for(var i in this.sessions){
      ret[i] = this.sessions[i].queue.length;
    }
    return ret;
  };
  u.makeSession = function(sess){
    if(!sess){
      console.trace();
      console.log('no session to make');
      process.exit(0);
    }
    if(this.sessions[sess]){return;}
    var _s = new ConsumerSession(this,coll,sess);
    var t = this;
    this.sessions[sess] = _s;
  };
  u.follow = function(path){
    //console.log('follow',path);
    if(!(path&&path.length)){
      return;
    }
    var ps = JSON.stringify(path);
    if(this.followingpaths[ps]){
      console.log('already following',path);
      return;
    }
    this.followingpaths[ps] = 1;
    var pp = []; //pp <=> progresspath
    var target = coll;
    while(path.length){
      var t = target.target([path[0]]);
      if(!t){
        //console.log('follow stopped at',pp);
        var tn = path[0],
          cps = JSON.stringify(path),
          pps = JSON.stringify(pp),
          ppsne = pps+'newElement'+cps,
          ppsd = pps+'destroyed'+cps,
          doitagain = function(){
            console.log('continuing follow for',ps);
            this.destroyListener(ppsne);
            this.destroyListener(ppsd);
            if(this.unfollowpaths[ps]){
              console.log('oops, that is unfollowed in the meanwhile');
              return;
            }
            if(this.followingpaths[ps]){
              if(this.followingpaths[ps]===1){
                delete this.followingpaths[ps];
              }else{
                console.log('nope, following already set');
                return;
              }
            }
            console.log('really');
            this.follow(JSON.parse(ps));
          };
        this.createListener(ppsne, function(name,el){
          if(el.type()==='Collection' && name===tn){
            doitagain.call(this);
          }
        },target.el.newElement);
        this.createListener(ppsd, doitagain, target.el.destroyed);
        return;
      }
      target = t;
      pp.push(path.shift());
    }
    console.log('follow successful');
    target.add(this);
    this.followingpaths[ps] = target;
    var ppd = ps+'destroyed';
    if(!this.listeners[ppd]){
      var doitagain = function(){
        console.log('Nothing to follow at',ps,'going again');
        this.destroyListener(ppd);
        delete this.followingpaths[ps];
        if(this.unfollowpaths[ps]){
          return;
        }
        this.follow(JSON.parse(ps));
      };
      this.createListener(ppd, doitagain, target.el.destroyed);
    }
  };
  u.push = function(item){
    for(var i in this.sessions){
      var s = this.sessions[i];
      if(s.queue){
        if(_now-s.lastAccess>15000){
          s.destroy();
          delete this.sessions[i];
        }else{
          s.lastAccess = _now;
          if(s.sockio){
            s.sockio.emit('_',item);
          }else{
            s.queue.push(item);
          }
        }
      }else{
        //should never get here
        delete this.sessions[i];
      }
    }
  };
  u.destroy = (function(){
    Listener.prototype.destroy.call(u);
    udest.call(u);
    for(var i in this.sessions){
      this.sessions[i].destroy();
      delete this.sessions[i];
    }
    for(var i in this.followingpaths){
      delete this.followingpaths[i];
    }
    for(var i in this.unfollowpaths){
      delete this.unfollowpaths[i];
    }
  });
};

function follow(dataMaster){
  var cc = new ConsumingCollection(dataMaster,[]);
  cc.createListener('elNewUser',function(u){
    upgradeUserToConsumer(u,this);
  },hersdata.UserBase.newUser);
  /*
  dataMaster.txnEnds.attach(function(txnalias){
    for(var i in dataMaster.realms){
      var r = dataMaster.realms[i];
      for(var j in r){
        var u = r[j];
        u.dump(txnalias);
      }
    }
  });
  */
}

module.exports = follow;
