var Listener = require('./listener'),
    Waiter = (require('./bridge')).Data_CollectionElementWaiter;

var allSessions = [];

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
  if(!el){
    return;
  }
  this.describer = JSON.stringify([JSON.stringify(path.slice(0,-1)),JSON.stringify([name,null])]);
  this.deleter = JSON.stringify([JSON.stringify(path.slice(0,-1)),JSON.stringify([name])]);
  this.el = el;
  this.path = path;
  if(el.replicaToken && el.replicaToken.skipdcp){return;}
  this.scalars = {};
  this.collections = {};
  this.subscribers = [];
  this.pretendents = [];
  this.waiters = [];
  this.key = el.access_level();
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
        var ctor = el.send ? ReplicatingConsumingCollection : ConsumingCollection;
        ent = new ctor(el,path.concat([name]),name);
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
          w.waitingpath.shift();
          var ok = !w.waitingpath.length;
          if(ok){
            delete w.waitingpath;
            //w.push(following_transaction_descriptor)?
          }
          ent.add(w.user);
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
ConsumingCollection.prototype.target = function(name,user){
  return this.collections[name] || this.scalars[name];
};
ConsumingCollection.prototype.followForUser = function(path,user,startindex){
  startindex = startindex||0;
  //console.log(path,user.username,startindex);
  if(path.length>startindex){
    var target = this.target(path[startindex],user);
    if(target){
      if(path.length>startindex+1){
        target.followForUser(path,user,startindex+1);
      }else{
        //console.log('adding',user.username,'to',target);
        target.add(user);
      }
    }else{
      this.waiters.push({user:user,waitingpath:path.slice(startindex)});
    }
  }
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
ConsumingCollection.prototype.remove = function(user){
  var fn = u.fullname,
    nk = fn+'newKey', 
    kr = fn+'keyRemoved'; 
};
ConsumingCollection.prototype.add = function(u){
  if(!this.subscribers){
    return;
  }
  var fn = u.fullname,
    nk = fn+'newKey', 
    kr = fn+'keyRemoved'; 
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
ConsumingCollection.prototype.upgradeUserToConsumer = function(u){
  var coll = this;
  u.fullname = u.username+'@'+u.realmname;
  Listener.call(u);
  for(var i in Listener.prototype){
    u[i] = Listener.prototype[i];
  }
  if(u.clearConsumingExtension){
    return;
  }
  u.sessions = {};
  u.followingpaths = {};
  u.unfollowpaths = {};
  u.follow = function(path){
    console.log('follow',path);
    if(!(path)){
      return;
    }
    var ps = JSON.stringify(path);
    if(this.followingpaths[ps]){
      console.log('already following',path);
      return;
    }
    this.followingpaths[ps] = 1;
    //console.log('follow',this.followingpaths);
    coll.followForUser(path,this);
  };
  u.clearConsumingExtension = function(){
    if(this.sessions){
      for(var i in this.sessions){
        this.sessions[i].destroy();
        delete this.sessions[i];
      }
      delete this.sessions;
    }
    if(this.followingpaths){
      for(var i in this.followingpaths){
        delete this.followingpaths[i];
      }
      delete this.followingpaths;
    }
    if(this.unfollowpaths){
      for(var i in this.unfollowpaths){
        delete this.unfollowpaths[i];
      }
      delete this.unfollowpaths;
    }
  };
  u.destroy = function(){
    Listener.prototype.destroy.call(this);
    KeyRing.prototype.destroy.call(this);
    this.clearConsumingExtension();
  };
};

function ReplicatingConsumingCollection(el,path,name){
  ConsumingCollection.call(this,el,path,name);
};
ReplicatingConsumingCollection.prototype = new ConsumingCollection();
ReplicatingConsumingCollection.prototype.add = function(user){
  var path = this.path;
  this.el.send('rpc','setFollower',user.username,user.realmname,user.roles,function(item){
    if(!item){return;}
    item = JSON.parse(item);
    //console.log('parsed incoming item',item);
    item[0] = typeof item[0] === 'string' ? JSON.parse(item[0]) : item[0];
    item[0] = JSON.stringify(path.concat(item[0]));
    item = JSON.stringify(item);
    //console.log(user.username,'got',item);
    user.push(item);
  },'__persistmycb');
  this.el.send('rpc','doUserFollow',user.username,user.realmname);
  ConsumingCollection.prototype.add.call(this,user);
};
ReplicatingConsumingCollection.prototype.followForUser = function(path,user,startindex){
  //console.log('ReplicatingConsumingCollection',path,user.username,startindex);
  var args = ['rpc','doUserFollow',user.username,user.realmname];
  for(var i = startindex; i<path.length; i++){
    args.push(path[i]);
  }
  this.el.send.apply(this.el,args);
};


  /*
function follow(dataMaster){
  var cc = new ConsumingCollection(dataMaster,[]);
  cc.createListener('elNewUser',function(u){
    upgradeUserToConsumer(u,this);
  },hersdata.UserBase.newUser);
  dataMaster.txnEnds.attach(function(txnalias){
    for(var i in dataMaster.realms){
      var r = dataMaster.realms[i];
      for(var j in r){
        var u = r[j];
        u.dump(txnalias);
      }
    }
  });
}
  */

module.exports = ConsumingCollection;
