var User = require('./User'),
  Listener = require('./listener'),
  HookCollection = require('./hookcollection');

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
function relocate(src,dest,el){
  removeFromArray(src,el);
  addToArray(dest,el);
}

var __DataFollowerInstanceCount = 0;

function DataFollower(data,createcb,cb,user,path){
  if(!(user && typeof user.username === 'function' && typeof user.realmname === 'function')){
    console.trace();
    console.log(user,'?');
    process.exit(0);
  }
  __DataFollowerInstanceCount++;
  Listener.call(this);
  //User.call(this,user.username,user.realmname,user.roles);
  path = path || [];
  this.path = path;
  if(cb){
    this.say = cb;
  }
  this.createcb = createcb;
  this.destroyed = new HookCollection();
  this._parent = user;
  if(user.remotepath){
    //console.log('parent remotepath',user.remotepath);
    this.remotepath = [user.remotepath];
  }
  this.huntTarget(data);
}
DataFollower.prototype = Object.create(Listener.prototype,{constructor:{
  value:DataFollower,
  enumerable:false,
  writable:false,
  configurable:false
}});
/*
for(var i in Listener.prototype){
  DataFollower.prototype[i] = Listener.prototype[i];
}
*/
DataFollower.prototype.destroy = function(){
  for(var i in this.followers){
    this.followers[i].destroy();
    delete this.followers[i];
  }
  this.destroyed.fire();
  Listener.prototype.destroy.call(this);
  for(var i in this){
    delete this[i];
  }
  this.setStatus('DISCARD_THIS');
  __DataFollowerInstanceCount--;
  //console.log('DataFollower instance count',__DataFollowerInstanceCount);
  //User.prototype.destroy.call(this);
}
DataFollower.prototype.setStatus = function(stts){
  this._status = stts;
  this.createcb && this.createcb.call(this,this._status);
};
function listenForTarget(target,data,cursor){
  this.createListener('newelementlistener',function(name,el){
    if(name===this.path[cursor]){
      this.huntTarget(data);
    }
  },target.newElement);
  this.setStatus('LATER');
}
function listenForDestructor(target,data,cursor){
  this.createListener('destructlistener',function(){
    delete this.data;
    cursor--;
    if(cursor<0){
      this.destroy();
      return;
    }
    this.huntTarget(data);
  },target.destroyed);
}
function listenForNew(target,data,cursor){
  this.createListener('newelementlistener',function(name,el){
    this.reportElement(name,el);
  },target.newElement);
}
DataFollower.prototype.huntTarget = function(data){
  var target = data;
  if(!(target&&target.element)){
    this.destroy();
    return;
  }
  var cursor = 0;
  this.purgeListeners();
  while(cursor<this.path.length){
    var ttarget = target.element([this.path[cursor]]);
    if(!ttarget){
      console.trace();
      console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      listenForTarget.call(this,target,data,cursor);
      if(!this.listeners){return;} //me ded after setStatus...
      listenForDestructor.call(this,target,data,cursor);
      if(target.communication){
        var remotepath = this.path.slice(cursor);
        this.pathtocommunication = this.path.slice(0,cursor);
        target.communication.usersend(this.topSayer(),this.pathtocommunication,this.remotepath,'follow',remotepath,(function(_t, _d,_p){
          var t = _t, d = _d, p = _p;
          return function(status){
            if (status === 'DISCARD_THIS') {
              //console.log('GOT DISCARD THIS');
              t.remotepath = p;
              t.huntTarget(d);
              return;
            }
            //console.log('remote follow said',arguments);
            t.setStatus(status);
          };
        })(this, data, (this.remotepath) ? this.remotepath.slice() : undefined),this.say,'__persistmycb');
        if(this.remotepath){
          //console.log('augmenting the remotepath',this.remotepath);
          this.remotepath.push(remotepath);
          //console.log('to',this.remotepath);
        }else{
          this.remotepath = remotepath;
        }
        this.data = target;
        return;
      }else{
        target = null;
      }
      break;
    }else{
      target = ttarget;
    }
    cursor++;
  }
  if(target){
    this.data = target;
    listenForNew.call(this,this.data,data,cursor);
    listenForDestructor.call(this,this.data,data,cursor);
    this.setStatus('OK');
    //this.cb && this.explain();
    this.attachToContents();
  }
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
  this.reportCollection(name,el,this.say);
  this.createListener(name+'_destroyed',function(){
    this.say.call(this,[this.path,[name]]);
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
    this.say.call(this,[this.path,[name]]);
    this.destroyListener(name+'_changed');
    this.destroyListener(name+'_destroyed');
  },el.destroyed);
};
DataFollower.prototype.attachToContents = function(){
  if(!this.data){return;}
  var t = this;
  //console.log('this.say',this.say.toString());
  this.data.traverseElements(function(name,el){
    if(t.say){
      t.reportElement(name,el,t.say);
    }
    switch(el.type()){
      case 'Scalar':
        t.attachToScalar(name,el);
        break;
      case 'Collection':
        break;
    }
  });
  this.createListener('newEl',function(name,el){
    //console.log('newEl',name,el.type());
      el.type() === 'Scalar' && this.attachToScalar(name,el);
  },this.data.newElement);
};
DataFollower.prototype.reportCollection = function(name,el,cb){
  if(this.contains(el.access_level())){
    cb.call(this,[this.path,[name,null]]);
  }
};
DataFollower.prototype.reportScalar = function(name,el,cb){
  cb.call(this,[this.path,[name,this.contains(el.access_level()) ? el.value() : el.public_value()]]);
};
DataFollower.prototype.reportElement = function(name,el,cb){
  cb = cb || this.say;
  if(!cb){return;}
  switch(el.type()){
    case 'Scalar':
      this.reportScalar(name,el,cb);
      break;
    case 'Collection':
      if(this.contains(el.access_level())){
        cb.call(this,[this.path,[name,null]]);
      }
      break;
  }
};
DataFollower.prototype.explain = function(cb){
  if(!this.data){return;}
  if(this.remotepath){
    var t = this;
    this.data.communication.usersend(this.topSayer(),this.pathtocommunication,this.remotepath,'explain',function(item){
      cb.call(t,[t.path,item[1]]);
    },'__persistmycb');
    return;
  }
  if(!this.contains(this.data.access_level())){
    return;
  }
  var t = this;
  this.data.traverseElements(function(name,el){
    t.reportElement(name,el,cb);
  });
  if(this.followers){
    for(var i in this.followers){
      this.followers[i].explain(cb);
    }
  }
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
  return this._parent.contains(key);
};
DataFollower.prototype.invoke = function(path,paramobj,cb){
  return this.user().invoke(this.data,path,paramobj,cb,this.remotepath);
};
DataFollower.prototype.bid = function(path,paramobj,cb){
  return this.user().bid(this.data,path,paramobj,cb,this.remotepath);
};
DataFollower.prototype.offer = function(path,paramobj,cb){
  return this.user().offer(this.data,path,paramobj,cb,this.remotepath);
};
DataFollower.prototype.waitFor = function(queryarry,cb){
  return this.user().waitFor(this.data,queryarry,cb,this.remotepath);
};
DataFollower.prototype.waitForever = function(queryarry,cb){
  var t = this;
  var wfFunc = function(){
    var u = t.user();
    if(!u){return;}
    u.waitFor(t.data,queryarry,function(discard){
      if(discard==='DISCARD_THIS'){
        console.log('waitFor again',wfFunc);
        wfFunc && wfFunc();
        return;
      }
      cb.apply(t,arguments);
    });
  };
  this.user().destroyed.attach(function(){
    wfFunc=null;
  });
  wfFunc();
};
DataFollower.prototype.follow = function(path,cb,saycb){
  path = path || [];
  var spath = path.join('/') || '.';
  if(this.followers){
    var f = this.followers[spath];
    if(f){
      cb && cb.call(f,f._status);
      return f;
    }
  }else{
    this.followers = {};
  }
  if(typeof saycb === 'undefined'){
    saycb = (function(t){
      var _t = t;
      return function(){
        _t.say.apply(_t,arguments);
      };
    })(this);
  }
  var df = new DataFollower(this.data,cb,saycb,this,path);
  if(df.destroyed){
    this.followers[spath] = df;
    df.destroyed.attach((function(fs,sp){
      var _fs=fs,_sp = sp;
      return function(){
        delete _fs[_sp];
      }
    })(this.followers,spath));
  }
  return df;
};
DataFollower.prototype.describe = function(cb){
  this.explain(cb);
  return;
  var ret = [];
  this.explain(function(item){
    ret.push(item);
  });
  cb && cb.call(this,ret);
};

module.exports = DataFollower;
