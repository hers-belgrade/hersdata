var User = require('./User'),
  Listener = require('./Listener'),
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
  /*
  if(cb){
    this.say = cb;
  }
  */
  this.saycb = cb;
  this.createcb = createcb;
  this.destroyed = new HookCollection();
  this._parent = user;
  this.huntTarget(data);
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
  //console.log(this.path,'dying');
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
  if(this._parent && this._parent.say){
    if(this._parent.remotetail){
      this._parent.say([this._parent.remotetail.concat(item[0]),item[1]]);
    }else{
      this._parent.say(item);
    }
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
        this.upward(item);
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
function listenForTarget(target,data,cursor){
  this.purgeListeners();
  //console.trace();
  //console.log('waiting for',this.path[cursor],'to appear on',this.path);
  this.createListener('newelementlistener',function(name,el){
    if(name===this.path[cursor]){
      //console.log('time has come for',this.path[cursor],'on',this.path);
      Timeout.next(this,'huntTarget',data);
    }else{
      if(name==this.path[cursor]){
        console.log(typeof name, typeof this.path[cursor]);
      }
      //console.log('no can do',name,'<>',this.path[cursor],'on',this.path);
    }
  },target.newElement);
  this.setStatus('LATER');
}
function listenForDestructor(target,data,cursor){
  this.createListener('destructlistener',function(){
    delete this.data;
    cursor--;
    if(cursor<0){
      Timeout.next(this,'destroy');
      return;
    }
    this.setStatus('RETREATING');
    Timeout.next(this,'huntTarget',data);
  },target.destroyed);
}
DataFollower.prototype.huntTarget = function(data){
  if(!this._parent){
    this.destroy();
    return;
  }
  var target = data;
  if(!(target&&target.newElement)){
    this.stalled = true;
    this.setStatus('STALLED');
    return;
  }
  delete this.stalled;
  if(this._parent.remotepath){
    //console.log('parent remotepath',user.remotepath);
    if(typeof this._parent.remotepath[0] === 'string'){
      this.remotepath = [this._parent.remotepath];
    }else{
      this.remotepath = this._parent.remotepath.slice();
    }
    //console.log('my composite remotepath',this.remotepath);
  }
  var cursor = 0;
  this.purgeListeners();
  if(!this.path){return;}
  while(cursor<this.path.length){
    var ttarget = target.elementRaw(this.path[cursor]);
    if(!ttarget){
      //console.trace();
      //console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      listenForTarget.call(this,target,data,cursor);
      if(!this.listeners){return;} //me ded after setStatus...
      listenForDestructor.call(this,target,data,cursor);
      if(target.communication){
        this.remoteAttach(data,target,cursor);
        return;
      }else{
        target = null;
      }
      break;
    }else{
      //console.log('target ok on',this.path[cursor],'on',ttarget.dataDebug());
      target = ttarget;
    }
    cursor++;
  }
  if(target){
    this.data = target;
    listenForDestructor.call(this,this.data,data,cursor);
    this.setStatus('OK');
    this.attachToContents(data,cursor);
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

DataFollower.prototype.remoteAttach = function (data,target,cursor) {
  var remotepath = this.path.slice(cursor);
  if(this.remotepath && typeof this.remotepath[0]==='object'){
    var mylastp = this.remotepath[this.remotepath.length-1];
    var subcursor=0;
    while(mylastp[subcursor]===remotepath[subcursor]){
      subcursor++;
    }
    if(subcursor){
      console.log('now what?',remotepath,this._parent.remotepath,'parents followers',Object.keys(this._parent.followers));
    }
    if(subcursor===mylastp.length){
      remotepath.splice(0,subcursor);
    }
  }
  this.pathtocommunication = this.path.slice(0,cursor);
  this.remotetail = remotepath;
  this.dataforremote = data;
  target.communication.remoteLink(this);
  this.data = target;

}
DataFollower.prototype.followerFor = function(name){
  var fn,fs;
  if((typeof name === 'object') && (name instanceof Array)){
    fn = name[0];
    fs = name[1];
  }else{
    fn = name;
    fs = false;
  }
};
DataFollower.prototype.attachToCollection = function(name,el){
  if(!this.say){return;}
  if(name.charAt(0)==='_'){return;}
  this.createListener(name+'_destroyed',function(){
    this.say([this.path,[name]]);
    //this.say.call(this,[this.path,[name]]);
  },el.destroyed);
};
DataFollower.prototype.emitScalarValue = function(name,val,cb){
  if(!cb){return;}
  if(typeof val === 'undefined'){
    cb.call(this,[this.path,[name]]);
  }else{
    cb.call(this,[this.path,[name,val]]);
  }
};
DataFollower.prototype.attachToScalar = function(name,el){
  if(!this.say){return;}
  this.createListener(name+'_changed',function(el,changedmap){
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
  },el.changed);
  this.createListener(name+'_destroyed',function(){
    this.say([this.path,[name]]);
    this.destroyListener(name+'_changed');
    this.destroyListener(name+'_destroyed');
  },el.destroyed);
};
DataFollower.prototype.attachAppropriately = function(name,el){
  if(!this.listeners){return;}
  switch(el.type()) {
    case 'Scalar': return this.attachToScalar(name,el);
    case 'Collection': return this.attachToCollection(name, el);
  }
};
DataFollower.prototype.attachToContents = function(data,cursor){
  if(!this.data){
    this.stalled = true;
    return;
  }

  if (this.data.communication) {
    this.remoteAttach(data, this.data, cursor);
    return;
  }
  
  var t = this;
  this.data.traverseElements(function(name,el){
    if(t.say){
      t.reportElement(name,el,t.say);
    }
    t.attachAppropriately(name,el);
  });
  this.createListener('newEl',function(name,el){
    this.reportElement(name,el);
    this.attachAppropriately(name,el);
  },this.data.newElement);
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
  return this.remotelink ? this.remotelink.perform('invoke',path,paramobj,cb) : this.user().invoke(this.data,path,paramobj,cb,this.remotepath);
};
DataFollower.prototype.bid = function(path,paramobj,cb){
  return this.remotelink ? this.remotelink.perform('bid',path,paramobj,cb) : this.user().bid(this.data,path,paramobj,cb,this.remotepath);
};
DataFollower.prototype.offer = function(path,paramobj,cb){
  return this.remotelink ? this.remotelink.perform('offer',path,paramobj,cb) : this.user().offer(this.data,path,paramobj,cb,this.remotepath);
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
    this.followers = {};
  }
  /*
  if(typeof saycb === 'undefined'){
    saycb = (function(t){
      var _t = t;
      return function(item){
        _t.say && _t.say([_t.path.concat(item[0]),item[1]]);
      };
    })(this);
  }
  */
  if(!this.data){
    console.trace();
    console.log('no data on parent');
  }
  if(!this._parent){
    console.trace();
    console.log('parent destroyed');
  }
  var df = new (ctor||DataFollower)(this.data,cb,saycb,this,path,options);
  this.followers[spath] = df;
  /*
  if(df.destroyed){
    this.followers[spath] = df;
    df.destroyed.attach((function(fs,sp){
      var _fs=fs,_sp = sp;
      return function(){
        //console.log('parent follower removing',_sp);
        delete _fs[_sp];
      }
    })(this.followers,spath));
  }
  */
  //console.log('returning new df');
  return df;
};
DataFollower.prototype.describe = function(cb){
  this.realdescribe(function(items){
    for(var i in items){
      cb(items[i]);
    }
  });
};
DataFollower.prototype.realdescribe = function(cb){
  if(!this.data){cb([]);return;}
  if(!this.data.access_level){
    console.trace();
    console.log('DataFollower',this.path,'missed the destruction');
    cb([]);
    return;
  }
  if(this.remotelink){
    this.remotelink.perform('remotedescribe',[],{},cb);
    return;
  }
  if(!this.contains(this.data.access_level())){
    cb([]);
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
          _cb(_ret);
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
  cb(ret); //cb.call(this,ret);??
};
DataFollower.prototype.remotedescribe = function(path,paramobj,cb){
  this.realdescribe(function(items){
    for(var i in items){
      var item = items[i];
      item[0] = path.concat(item[0]);
    }
    cb(items);
  });
};
DataFollower.prototype.handleBid = function(reqname,cb){
  var bf = this.follow(['__requirements',reqname],function(stts){
    if(stts==='OK'){
      if(cb(true)){
        bf.destroy();
      }
    }
    if(stts==='RETREATING'){
      if(cb(false)){
        bf.destroy();
      }
    }
  });
};
function OfferHandler(data,createcb,saycb,user,path,cb){
  this.cb = cb;
  DataFollower.call(this,data,null,null,user,path);
  console.log('new OfferHandler',this.remotepath);
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
    var cbr = this.cb(this.path[this.path.length-1],data);
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
  this.cb = cb;
  DataFollower.call(this,data,null,null,user,path);
  console.log('new OffersHandler',this.remotepath,this.remotelink._id);
}
OffersHandler.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:OffersHandler,
  enumerable:false,
  writable:false,
  configurable:false
}});
OffersHandler.prototype.say = function(item){
  if(item==='DISCARD_THIS'){
    this.destroy();
  }
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
