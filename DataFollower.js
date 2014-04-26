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

function DataFollower(data,createcb,cb,user,path){
  if(!data){ return; }
  if(!(user && typeof user.username === 'string' && typeof user.realmname === 'string')){
    console.trace();
    console.log(user,'?');
    process.exit(0);
  }
  if(!user.keys){
    console.trace();
    console.log('no user');
  }
  Listener.call(this);
  User.call(this,user.username,user.realmname,user.roles);
  path = path || [];
  this.path = path;
  if(cb){
    this.say = cb;/*function(item){
      cb([path,item]);
    };*/
  }
  this.createcb = createcb;
  this.destroyed = new HookCollection();
  if(user.remotepath){
    //console.log('parent remotepath',user.remotepath);
    this.remotepath = [user.remotepath];
  }
  this.huntTarget(data);
}
DataFollower.prototype = Object.create(User.prototype,{constructor:{
  value:DataFollower,
  enumerable:false,
  writable:false,
  configurable:false
}});
for(var i in Listener.prototype){
  DataFollower.prototype[i] = Listener.prototype[i];
}
DataFollower.prototype.destroy = function(){
  console.log('firing destroyed of DataFollower',this.path);
  for(var i in this.followers){
    this.followers[i].destroy();
  }
  this.destroyed.fire();
  Listener.prototype.destroy.call(this);
  User.prototype.destroy.call(this);
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
  var cursor = 0;
  this.purgeListeners();
  while(cursor<this.path.length){
    var ttarget = target.element([this.path[cursor]]);
    if(!ttarget){
      //console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      if(target.communication){
        var remotepath = this.path.slice(cursor);
        this.pathtocommunication = this.path.slice(0,cursor);
        target.communication.usersend(this,this.pathtocommunication,'follow',remotepath,(function(_t, _d,_p){
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
        listenForTarget.call(this,target,data,cursor);
        listenForDestructor.call(this,target,data,cursor);
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
DataFollower.prototype.attachToScalar = function(name,el){
  this.reportScalar(name,el,this.say);
  this.createListener(name+'_changed',function(changedmap){
    this.reportScalar(name,el,this.say);
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
  this.data.traverseElements(function(name,el){
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
  if(this.contains(el.access_level())){
    cb.call(this,[this.path,[name,el.value()]]);
  }else{
    var pv = el.public_value();
    if(typeof pv !== 'undefined'){
      cb.call(this,[this.path,[name,pv]]);
    }/*else{
      console.log(this.username,'will not report scalar',name);
    }*/
  }
};
DataFollower.prototype.reportElement = function(name,el,cb){
  cb = cb || this.say;
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
    this.data.communication.usersend(this,this.pathtocommunication,'explain',function(item){
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
DataFollower.prototype.invoke = function(path,paramobj,cb){
  return User.prototype.invoke.call(this,this.data,path,paramobj,cb);
};
DataFollower.prototype.bid = function(path,paramobj,cb){
  return User.prototype.bid.call(this,this.data,path,paramobj,cb);
};
DataFollower.prototype.offer = function(path,paramobj,cb){
  return User.prototype.offer.call(this,this.data,path,paramobj,cb);
};
DataFollower.prototype.waitFor = function(queryarry,cb){
  return User.prototype.waitFor.call(this,this.data,queryarry,cb);
};
DataFollower.prototype.follow = function(path,cb,saycb){
  path = path || [];
  var spath = path.join('/') || '.';
  if(this.followers){
    var f = this.followers[spath];
    if(f){
      cb && cb.call(this,f._status);
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
  this.followers[spath] = df;
  df.destroyed.attach((function(fs,sp){
    var _fs=fs,_sp = sp;
    return function(){
      delete _fs[_sp];
    }
  })(this.followers,spath));
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
