var User = require('./User'),
  Listener = require('./Listener'),
  executable = require('./executable'),
  isExecutable = executable.isA,
  execCall = executable.call,
  HookCollection = require('./hookcollection'),
  Timeout = require('herstimeout');

var __DataFollowerInstanceCount = 0;

function DataFollower(data,createcb,cb,user,path){
  if(!(user && typeof user.username === 'function' && typeof user.realmname === 'function')){
    console.trace();
    console.log(user,'?');
    process.exit(0);
  }
  __DataFollowerInstanceCount++;
  //console.log('__DataFollowerInstanceCount',__DataFollowerInstanceCount);
  this._status = 'INITIALIZED';
  Listener.call(this);
  path = path || [];
  this.path = path;
  this.saycb = cb;
  this.createcb = createcb;
  this.destroyed = new HookCollection();
  this._parent = user;
  if(!(user.data&&user.data===data)){
    this.rootdata = data;
  }
  this.huntTarget();
}
DataFollower.prototype = Object.create(Listener.prototype,{constructor:{
  value:DataFollower,
  enumerable:false,
  writable:false,
  configurable:false
}});
DataFollower.prototype.destroy = function(){
  if(!this.destroyed){//ded already
    return;
  }
  //var p = this.path;
  //console.log(this.fullname(),this.path,'dying');
  if(this.remotelink){
    this.remotelink.destroy();
  }
  for(var i in this.followers){
    this.followers[i].destroy();
    delete this.followers[i];
  }
  //block reentrance
  var dh = this.destroyed;
  delete this.destroyed;
  dh.fire();
  if(this._parent && this._parent.followers){
    var spath = this.path ? this.path.join('/') : '.';
    delete this._parent.followers[spath];
  }
  this.setStatus('DISCARD_THIS');
  Listener.prototype.destroy.call(this);
  this.finalizer();
  for(var i in this){
    delete this[i];
  }
  __DataFollowerInstanceCount--;
  //console.log('__DataFollowerInstanceCount',__DataFollowerInstanceCount);
};
DataFollower.prototype.finalizer = function(){
};
DataFollower.prototype.setStatus = function(stts){
  this._status = stts;
  this.createcb && this.createcb.call(this,this._status);
};
DataFollower.prototype.upward = function(item){
  var _p = this._parent;
  if(_p && _p.say){
    var p = _p.remotetail ? _p.remotetail : (_p.path ? _p.path : undefined);
    _p.say(p ? [p.concat(item[0]),item[1]] : item);
  }
};
DataFollower.prototype.say = function(item){
  var toscb = typeof this.saycb;
  switch(toscb){
    case 'function':
      this.saycb.call(this,item);
      break;
    case 'object':
      var scb = this.saycb;
      if(scb===null){
        return;
      }
      var obj=scb[0],m=obj[scb[1]];
      typeof m === 'function' && m.call(obj,item);
      break;
    case 'undefined':
      this.upward(item);
      break;
  }
};
DataFollower.prototype.targetListener = function(name,el){
  if(name===this.path[this.cursor]){
    Timeout.next(this,'huntTarget');
  }
};
DataFollower.prototype.listenForTarget = function(target){
  this.purgeListeners();
  //console.trace();
  //console.log('waiting for',this.path[cursor],'to appear on',this.path);
  this.createListener('targetListener',null,target.newElement);
  this.setStatus('LATER');
};
DataFollower.prototype.destructListener = function(){
  delete this.data;
  this.cursor--;
  if(this.cursor<0){
    //console.log(this.fullname(),this.path,'exhausted,dying');
    Timeout.next(this,'destroy');
    return;
  }
  this.setStatus('RETREATING');
  Timeout.next(this,'huntTarget');
};
DataFollower.prototype.listenForDestructor = function(target){
  this.createListener('destructListener',null,target.destroyed);
}
DataFollower.prototype.huntTarget = function(){
  if(!this.destroyed){
    return;
  }
  if(!this._parent){
    this.destroy();
    return;
  }
  var target = this.rootdata || this._parent.data;
  if(!(target&&target.newElement)){
    this.stalled = true;
    this.setStatus('STALLED');
    return;
  }
  delete this.stalled;
  this.cursor = 0;
  this.purgeListeners();
  if(!this.path){return;}
  while(this.cursor<this.path.length){
    var ttarget = target.elementRaw(this.path[this.cursor]);
    if(!ttarget){
      //console.trace();
      //console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      this.listenForTarget(target);
      if(!this.listeners){return;} //me ded after setStatus...
      this.listenForDestructor(target);
      if(target.communication){
        this.remoteAttach(target);
        return;
      }else{
        target = null;
      }
      break;
    }else{
      target = ttarget;
    }
    this.cursor++;
  }
  if(target){
    this.data = target;
    this.listenForDestructor(this.data);
    this.setStatus('OK');
    if(!this.destroyed){ //setStatus killed me as a consequence
      return;
    }
    if (this.data.communication) {
      this.remoteAttach(this.data);
      return;
    }
    var t = this;
    this.data.traverseElements(function(name,el){
      if(t.say){
        t.reportElement(name,el,t.say);
      }
      t.attachAppropriately(name,el);
    });
    this.createListener('newElementListener',null,this.data.newElement);
    for(var i in this.followers){
      var f = this.followers[i];
      if(f.stalled){
        //console.log('awakening',i);
        f.huntTarget(this.data);
      }/*else{
        //console.log(i,'is awake');
      }*/
    }
  }
}
DataFollower.prototype.newElementListener = function(name,el){
  this.reportElement(name,el);
  this.attachAppropriately(name,el);
};
DataFollower.prototype.remoteAttach = function (target) {
  this.remotetail = this.path.slice(this.cursor);
  target.communication.remoteLink(this);
  this.data = target;
};
DataFollower.prototype.collectionDestroyed = function(name){
  this.say([this.path,[name]]);
  this.destroyListener('collectionDestroyed',[name]);
};
DataFollower.prototype.attachToCollection = function(name,el){
  if(!this.destroyed){return;}
  if(name.charAt(0)==='_'){return;}
  this.createListener('collectionDestroyed',[name],el.destroyed);
};
DataFollower.prototype.emitScalarValue = function(name,val,cb){
  if(!cb){return;}
  if(typeof val === 'undefined'){
    cb.call(this,[this.path,[name]]);
  }else{
    cb.call(this,[this.path,[name,val]]);
  }
};
DataFollower.prototype.scalarChanged = function(name,el,changedmap){
  var priv = this.contains(el.access_level());
  var val = priv ? el.value() : el.public_value();
  if(changedmap.key){
    this.emitScalarValue(name,val,this.say);
    return;
  }
  if(priv){
    if(changedmap.private){
      this.emitScalarValue(name,val,this.say);
    }
  }else{
    if(changedmap.public){
      this.emitScalarValue(name,val,this.say);
    }
  }
};
DataFollower.prototype.scalarDestroyed = function(name){
  if(!this.listeners){
    console.log('dead called scalarDestroyed on',name);
    console.log(this);
    console.trace();
    process.exit(0);
  }
  this.say([this.path,[name]]);
  this.destroyListener('scalarChanged',[name]);
  this.destroyListener('scalarDestroyed',[name]);
};
DataFollower.prototype.attachToScalar = function(name,el){
  if(!this.listeners){
    console.log(this);
    console.trace();
    process.exit(0);
  }
  if(!this.destroyed){return;}
  this.createListener('scalarChanged',[name],el.changed);
  this.createListener('scalarDestroyed',[name],el.destroyed);
};
DataFollower.prototype.attachAppropriately = function(name,el){
  if(!this.listeners){return;}
  switch(el.type()) {
    case 'Scalar': return this.attachToScalar(name,el);
    case 'Collection': return this.attachToCollection(name, el);
  }
};
DataFollower.prototype.reportCollection = function(name,el,cb){
  if(name.charAt(0)==='_'){return;}
  if(this.contains(el.access_level())){
    cb && cb.call(this,[this.path,[name,null]]);
  }
};
DataFollower.prototype.reportScalar = function(name,el,cb){
  this.emitScalarValue(name,this.contains(el.access_level()) ? el.value() : el.public_value(),cb);
};
DataFollower.prototype.reportElement = function(name,el,cb){
  cb = cb || this.say;
  if(!cb){return;}
  switch(el.type()){
    case 'Scalar':
      this.reportScalar(name,el,cb);
      break;
    case 'Collection':
      this.reportCollection(name,el,cb);
      break;
  }
};
DataFollower.prototype.engaged = function(){
  return this._parent.engaged();
};
DataFollower.prototype.username = function(){
  return this._parent.username();
};
DataFollower.prototype.realmname = function(){
  return this._parent.realmname();
};
DataFollower.prototype.fullname = function(){
  return this._parent.fullname();
};
DataFollower.prototype.roles = function(){
  return this._parent.roles();
};
DataFollower.prototype.user = function(){
  return this._parent.user ? this._parent.user() : this._parent;
};
DataFollower.prototype.topSayer = function(){
  return this._parent.say ? this._parent : this;
};
DataFollower.prototype.contains = function(key){
  return this._parent ? this._parent.contains(key) : false;
};
DataFollower.prototype.invoke = function(path,paramobj,cb){
  return this.remotelink ? this.remotelink.perform('invoke',path,paramobj,cb) : this.user().invoke(this.data,path,paramobj,cb);
};
DataFollower.prototype.bid = function(path,paramobj,cb){
  return this.remotelink ? this.remotelink.perform('bid',path,paramobj,cb) : this.user().bid(this.data,path,paramobj,cb);
};
DataFollower.prototype.offer = function(path,paramobj,cb){
  return this.remotelink ? this.remotelink.perform('offer',path,paramobj,cb) : this.user().offer(this.data,path,paramobj,cb);
};
DataFollower.prototype.follow = function(path,cb,saycb,ctor,options){
  path = path || [];
  var spath = path.join('/') || '.';
  //console.log('about to follow',spath);
  if(this.followers){
    var f = this.followers[spath];
    if(f){
      //console.log('already have follower for',spath);
      cb && cb.call(f,f._status);
      return f;
    }
  }else{
    if(this.destroyed){//this alive
      this.followers = {};
    }
  }
  if(!this._parent){
    console.trace();
    console.log('parent destroyed');
  }
  var df = new (ctor||DataFollower)(this.data,cb,saycb,this,path,options);
  if(this.destroyed){
    this.followers[spath] = df;
  }else{
    Timeout.next(df,'destroy');
  }
  return df;
};
DataFollower.prototype.describe = function(cb){
  if(!isExecutable(cb)){
    return;
  }
  this.realdescribe(function(items){
    for(var i in items){
      execCall(cb,items[i]);
    }
  });
};
DataFollower.prototype.realdescribe = function(cb){
  if(!isExecutable(cb)){
    return;
  }
  if(!this.data){execCall(cb,[]);return;}
  if(!this.data.access_level){
    console.trace();
    console.log('DataFollower',this.path,'missed the destruction');
    execCall(cb,[]);
    return;
  }
  if(this.remotelink){
    this.remotelink.perform('remotedescribe',[],{},cb);
    return;
  }
  if(!this.contains(this.data.access_level())){
    execCall(cb,[]);
    return;
  }
  var ret = [];
  var pusher = function(item){
    ret.push(item);
    //console.log('1st level push',item,'=>',ret);
  };
  var t = this;
  this.data.traverseElements(function(name,el){
    t.reportElement(name,el,pusher);
  });
  if(this.followers){
    var batchpushers = {};
    var batchpusher = function(bpname){
      var bpn = bpname,bps = batchpushers,_cb=cb,_ret=ret;
      return function(items){
        Array.prototype.push.apply(_ret,items);
        delete bps[bpn];
        if(!Object.keys(bps).length){
          execCall(_cb,ret);
        }
      };
    };
    for(var i in this.followers){
      batchpushers[i]=1;
    }
    for(var i in this.followers){
      this.followers[i].remotedescribe(t.path,{},batchpusher(i));
    }
    return;
  }
  execCall(cb,ret);
};
DataFollower.prototype.remotedescribe = function(path,paramobj,cb){
  if(!isExecutable(cb)){
    return;
  }
  this.realdescribe(function(items){
    for(var i in items){
      var item = items[i];
      item[0] = path.concat(item[0]);
    }
    execCall(cb,items);
  });
};
DataFollower.prototype.handleBid = function(reqname,cb){
  if(!isExecutable(cb)){
    return;
  }
  this.follow(['__requirements',reqname],function(stts){
    if(stts==='OK'){
      if(execCall(cb,true)){
        this.destroy();
      }
    }
    if(stts==='RETREATING'){
      if(execCall(cb,false)){
        this.destroy();
      }
    }
  });
};
function OfferHandler(data,createcb,saycb,user,path,cb){
  if(!isExecutable(cb)){
    process.exit(0);
  }
  this.cb = cb;
  DataFollower.call(this,data,null,null,user,path);
}
OfferHandler.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:OfferHandler,
  enumerable:false,
  writable:false,
  configurable:false
}});
OfferHandler.prototype.say = function(item){
  if(this.cb && item && item[1] && item[1][0] === 'data'){
    this.called = true;
    var data = item[1][1];
    var cbr = execApply(this.cb,[this.path[this.path.length-1],data]);
    if(typeof data === 'undefined'){
      this.destroy();
    }else{
      if(cbr){
        if(cbr='super'){
          this._parent.destroy();
        }else{
          this.destroy();
        }
      }
    }
  }
};
function OffersHandler(data,createcb,saycb,user,path,cb){
  if(!isExecutable(cb)){
    process.exit(0);
  }
  this.cb = cb;
  DataFollower.call(this,data,null,null,user,path);
}
OffersHandler.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:OffersHandler,
  enumerable:false,
  writable:false,
  configurable:false
}});
OffersHandler.prototype.setStatus = function(stts){
  if(stts==='RETREATING' || stts==='DISCARD_THIS'){
    this.destroy();
  }
};
OffersHandler.prototype.say = function(item){
  if(item && item[1] && item[1][1]===null){
    var offerid = item[1][0];
    if(typeof offerid!== 'undefined'){
      this.follow([offerid],null,null,OfferHandler,this.cb);
    }
  }
};
DataFollower.prototype.handleOffer = function(reqname,cb){
  this.follow(['__requirements',reqname,'offers'],null,null,OffersHandler,cb);
};

module.exports = DataFollower;
