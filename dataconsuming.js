var Listener = require('./listener'),
    Waiter = (require('./bridge')).Data_CollectionElementWaiter,
    Timeout = require('herstimeout');

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
};
ConsumingEntity.prototype = new Listener();
function ConsumingScalar(el,path,name,parnt){
  ConsumingEntity.call(this,el,path);
  this.parnt = parnt;
  this.observers = [];
  this.subscribers = [];
  this.locations = {};
  this.el = el;
  this.path = path;
  this.name = name;
  this.deleter = JSON.stringify([this.path,JSON.stringify([this.name])]);
  this.setValues();
  //console.log('new ConsumingScalar',name);
  for(var i in this.parnt.subscribers){
    this.add(this.parnt.subscribers[i]);
  }
  this.createListener('elchanged',function(el,changedmap){
    //console.log(name,'changed',this.subscribers.length,'subs',this.observers.length,'obs');
    if(changedmap.key){
      var key = el.access_level();
      if(changedmap.private){
        this.setPrivateValue();
      }
      if(changedmap.public){
        this.setPublicValue();
      }
      for(var i in this.parnt.subscribers){
        this.check(this.parnt.subscribers[i],key,changedmap);
      }
    }else{
      if(changedmap.private){
        this.setPrivateValue();
        for(var i in this.subscribers){
          this.subscribers[i].push(this.value);
        }
      }
      if(changedmap.public){
        this.setPublicValue();
        for(var i in this.observers){
          this.observers[i].push(this.public_value);
        }
      }
    }
  },el.changed);
  this.createListener('eldestroyed',function(){
    this.destroy();
  },el.destroyed);
};
ConsumingScalar.prototype = new ConsumingEntity();
ConsumingScalar.prototype.notifyDestroy = function(){
  for(var i in this.subscribers){
    this.subscribers[i].push(this.deleter);
  }
  if(typeof this.el.public_value() !== 'undefined'){
    for(var i in this.observers){
      this.observers[i].push(this.deleter);
    }
  }
};
ConsumingScalar.prototype.destroy = function(){
  ConsumingEntity.prototype.destroy.call(this);
  if(this.parnt && this.parnt.scalars){
    delete this.parnt.scalars[this.name];
  }
  this.notifyDestroy();
  for(var i in this){
    delete this[i];
  }
};
ConsumingScalar.prototype.setPublicValue = function(){
  var pv = this.el.public_value();
  if(typeof pv != 'undefined'){
    this.public_value = JSON.stringify([this.path,JSON.stringify([this.name,pv])]);
  }else{
    if(this.public_value){
      this.public_value = this.deleter;
    }
  }
};
ConsumingScalar.prototype.setPrivateValue = function(){
  var v = this.el.value();
  if(typeof v !== 'undefined'){
    this.value = JSON.stringify([this.path,JSON.stringify([this.name,v])]);
  }else{
    this.value = this.deleter;
  }
};
ConsumingScalar.prototype.setValues = function(){
  this.setPublicValue();
  this.setPrivateValue();
};
ConsumingScalar.prototype.userDebug = function(u){
  if(u.username==='milojko' && this.name==='name'){
    console.log.apply(console,Array.prototype.slice.call(arguments,1));
  }
};
ConsumingScalar.prototype.add = function(u){
  if(u.contains(this.el.access_level())){
    //this.userDebug(u,'becomes a subscriber');
    if(addToArray(this.subscribers,u)){
      this.locations[u.fullname]=1;
      if(typeof this.value !== 'undefined'){
        u.push(this.value);
      }
    }
  }else{
    if(addToArray(this.observers,u)){
      //this.userDebug(u,'becomes an observer');
      this.locations[u.fullname]=2;
      if(typeof this.public_value !== 'undefined'){
        u.push(this.public_value);
      }
    }
  }
};
ConsumingScalar.prototype.check = function(u,key,changedmap){
  if(u.contains(key)){
    if(this.locations[u.fullname]===2){
      this.locations[u.fullname] = 1;
      this.userDebug(u,'becomes a subscriber');
      removeFromArray(this.observers,u);
      addToArray(this.subscribers,u);
      u.push(this.value);
    }else{
      if(changedmap.private){
        u.push(this.value);
      }
    }
  }else{
    if(this.locations[u.fullname]===1){
      this.userDebug(u,'becomes an observer');
      this.locations[u.fullname] = 2;
      removeFromArray(this.subscribers,u);
      addToArray(this.observers,u);
      if(typeof this.public_value !== 'undefined'){
        u.push(this.public_value);
      }else{
        u.push(this.deleter);
      }
    }else{
      if(changedmap.public){
        if(typeof this.public_value !== 'undefined'){
          u.push(this.public_value);
        }
      }
    }
  }
};
ConsumingScalar.prototype.remove = function(u){
  var fn = u.fullname;
  if(this.locations[u.fullname]===2){
    removeFromArray(this.subscribers,u);
  }else{
    removeFromArray(this.observers,u);
  }
  delete this.locations[u.fullname];
};
function ConsumingCollection(el,path,name,parnt){
  ConsumingEntity.call(this,el,path,name);
  if(!el){
    return;
  }
  this.parnt = parnt;
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
  this.locations = {};
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
        ent = new ConsumingScalar(el,path,name,t);
        break;
      case 'Collection':
        target = t.collections;
        if(target[name]){break;}
        //console.log(t.name,'creating new Collection',name);
        var ctor = el.send ? ReplicatingConsumingCollection : ConsumingCollection;
        ent = new ctor(el,path.concat([name]),name,t);
        var ek = el.access_level();
        for(var i in t.subscribers){
          var s = t.subscribers[i];
          if(s.contains(ek)){
            s.push(ent.describer);
          }
        }
        var rw = [];
        for(var i in t.waiters){
          var w = t.waiters[i];
          if(!w.waitingpath){
            console.trace();
            process.exit(0);
          }
          if(w.waitingpath[0]===name){
            rw.push(w);
          }
        }
        for(var i in rw){
          var w = rw[i];
          removeFromArray(t.waiters,w);
          w.waitingpath.shift();
          if(!w.waitingpath.length){
            delete w.waitingpath;
            ent.add(w.user);
          }else{
            ent.waiters.push(w);
          }
        }
        break;
    }
    if(target && ent){
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
  },el.accessLevelChanged);
  this.createListener('elDestroyed',function(){
    this.destroy();
  },el.destroyed);
};
ConsumingCollection.prototype = new ConsumingEntity();
ConsumingCollection.prototype.notifyDestroy = function(){
  for(var i in this.subscribers){
    this.subscribers[i].push(this.deleter);
  }
};
ConsumingCollection.prototype.destroy = function(){
  if(!this.subscribers){return;}
	var sp = JSON.stringify(this.path);
  if(this.parnt){
    if(this.parnt.waiters){
      for(var i in this.waiters){
        var w = this.waiters[i];
        w.waitingpath.unshift(this.name);
        this.parnt.waiters.push(w);
      }
      for(var i in this.observers){
        var o = this.observers[i];
        this.parnt.waiters.push({waitingpath:[this.name],user:o});
      }
      for(var i in this.subscribers){
        var s = this.subscribers[i];
        this.parnt.waiters.push({waitingpath:[this.name],user:s});
      }
    }
    if(this.parnt.collections){
      delete this.parnt.collections[this.name];
    }
  }
  ConsumingEntity.prototype.destroy.call(this);
  this.notifyDestroy();
  for(var i in this){
    delete this[i];
  }
};
ConsumingCollection.prototype.describe = function(u,cb){
  if(!(u.fullname in this.locations)){
    for(var i in this.collections){
      this.collections[i].describe(u,cb);
    }
    return;
  }
  if(u.contains(this.el.access_level())){
    cb(this.describer);
  }
  for(var i in this.scalars){
    var s = this.scalars[i];
    u.contains(s.el.access_level()) ? cb(s.value) : cb(s.public_value);
  }
  for(var i in this.collections){
    this.collections[i].describe(u,cb);
  }
};
ConsumingCollection.prototype.target = function(name,user){
  return this.collections[name] || this.scalars[name];
};
ConsumingCollection.prototype.followForUser = function(path,user,startindex){
  startindex = startindex||0;
  //console.log(path,user.username,path.length,startindex);
  if(path.length>startindex){
    var target = this.target(path[startindex],user);
    if(target){
      if(path.length>startindex+1){
        target.followForUser(path,user,startindex+1);
      }else{
        //console.log('adding',user.username,'to',target.name);
        target.add(user);
      }
    }else{
      this.waiters.push({user:user,waitingpath:path.slice(startindex)});
    }
  }else{
    //console.log(this.name,'adding',user.username,'myself');
    this.add(user);
  }
};
ConsumingCollection.prototype.reportTo = function(u){
  for(var i in this.collections){
    var c = this.collections[i];
    if(u.contains(c.el.access_level())){
      u.push(c.describer);
    }
  }
  for(var i in this.scalars){
    var s = this.scalars[i];
    if(u.contains(s.el.access_level())){
      u.push(s.value);
    }else{
      u.push(s.public_value);
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
    if(this.locations[u.fullname]===2){
      this.locations[u.fullname]=1;
      removeFromArray(this.pretendents,u);
      addToArray(this.subscribers,u);
      this.reportTo(u);
      for(var i in this.scalars){
        this.scalars[i].add(u);
      }
    }
  }else{
    if(this.locations[u.fullname]===1){
      this.locations[u.fullname]=2;
      removeFromArray(this.subscribers,u);
      addToArray(this.pretendents,u);
      this.unreportTo(u);
    }
  }
};
ConsumingCollection.prototype.remove = function(user){
  var fn = u.fullname,
    nk = fn+'newKey', 
    kr = fn+'keyRemoved'; 
  this.destroyListener(nk);
  this.destroyListener(kr);
  if(this.locations[u.fullname]===1){
    removeFromArray(this.subscribers,user);
  }else{
    removeFromArray(this.observers,user);
  }
  delete this.locations[u.fullname];
};
ConsumingCollection.prototype.add = function(u){
  if(!this.subscribers){
    return;
  }
  if(u.fullname in this.locations){
    return;
  }
	var sp = JSON.stringify(this.path);
  if(u.contains(this.el.access_level())){
    this.locations[u.fullname] = 1;
    addToArray(this.subscribers,u);
    this.reportTo(u);
    for(var i in this.scalars){
      this.scalars[i].add(u);
    }
  }else{
    this.locations[u.fullname] = 2;
    addToArray(this.pretendents,u);
  }
  var fn = u.fullname,
    nk = fn+'newKey', 
    kr = fn+'keyRemoved'; 
  this.createListener(nk,function(key){
    if(key===this.el.access_level()){
      if(this.locations[u.fullname]===2){
        this.locations[u.fullname]=1;
        removeFromArray(this.pretendents,u);
        addToArray(this.subscribers,u);
        //console.log(this.path.join('.'),':',u.username,'is a subscriber now');
        this.reportTo(u);
        for(var i in this.scalars){
          this.scalars[i].add(u);
        }
      }
    }else{
      if(this.locations[u.fullname]===1){
        for(var i in this.scalars){
          var s = this.scalars[i];
          if(s.el.access_level()===key){
            s.check(u,key,{});
          }
        }
      }
    }
  },u.newKey);
  this.createListener(kr,function(key){
    if(key===this.el.access_level()){
      if(this.locations[u.fullname]===1){
        this.locations[u.fullname]=2;
        this.unreportTo(u);
        //console.log(this.path.join('.'),':',u.username,'is a pretendent now');
        removeFromArray(this.subscribers,u);
        addToArray(this.pretendents,u);
        for(var i in this.scalars){
          this.scalars[i].remove(u);
        }
      }
    }else{
      if(this.locations[u.fullname]===1){
        for(var i in this.scalars){
          var s = this.scalars[i];
          if(s.el.access_level()===key){
            s.check(u,key,{});
          }
        }
      }
    }
  },u.keyRemoved);
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
  u.follow = function(path){
    //console.log('follow',path);
    if(!(path)){
      return;
    }
    coll.followForUser(path,this);
  };
  u.unfollow = function(path){
  };
  u.describe = function(cb){
    //console.log('describe begin');
    coll.describe(u,cb);
    //console.log('describe end');
  };
  u.clearConsumingExtension = function(){
    if(this.sessions){
      for(var i in this.sessions){
        this.sessions[i].destroy();
        delete this.sessions[i];
      }
      delete this.sessions;
    }
  };
  u.destroy = function(){
    Listener.prototype.destroy.call(this);
    KeyRing.prototype.destroy.call(this);
    this.clearConsumingExtension();
  };
};

function ReplicatingConsumingCollection(el,path,name,parnt){
  ConsumingCollection.call(this,el,path,name,parnt);
};
ReplicatingConsumingCollection.prototype = new ConsumingCollection();
ReplicatingConsumingCollection.repackRemoteItem = function(path,item){
  if(!item){return;}
  item = JSON.parse(item);
  //console.log('parsed incoming item',item);
  item[0] = typeof item[0] === 'string' ? JSON.parse(item[0]) : item[0];
  item[0] = JSON.stringify(path.concat(item[0]));
  return JSON.stringify(item);
};
ReplicatingConsumingCollection.prototype.add = function(user){
  var path = this.path;
  this.el.send('rpc','setFollower',user.username,user.realmname,user.roles,function(item){
    item = ReplicatingConsumingCollection.repackRemoteItem(path,item);
    if(item){
      user.push(item);
    }
  },'__persistmycb');
  this.el.send('rpc','doUserFollow',user.username,user.realmname);
  ConsumingCollection.prototype.add.call(this,user);
};
ReplicatingConsumingCollection.prototype.describe = function(u,cb){
  var path = this.path;
  this.el.send('rpc','doUserDescribe',u.username,u.realmname,function(item){
    item = ReplicatingConsumingCollection.repackRemoteItem(path,item);
    if(item){
      cb(item);
    }
  },'__persistmycb');
};
ReplicatingConsumingCollection.prototype.followForUser = function(path,user,startindex){
  //console.log('ReplicatingConsumingCollection',path,user.username,startindex);
  var args = ['rpc','doUserFollow',user.username,user.realmname];
  for(var i = startindex; i<path.length; i++){
    args.push(path[i]);
  }
  this.el.send.apply(this.el,args);
};

module.exports = ConsumingCollection;
