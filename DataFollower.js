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
  Listener.call(this);
  path = path || [];
  this.path = path;
  if(cb){
    this.say = cb;
  }
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
};
DataFollower.prototype.setStatus = function(stts){
  this._status = stts;
  this.createcb && this.createcb.call(this,this._status);
};
function listenForTarget(target,data,cursor){
  this.purgeListeners();
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
      Timeout.next(function(t){t.destroy();},this);
      return;
    }
    this.setStatus('RETREATING');
    Timeout.next(function(t){t.huntTarget(data);},this);
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
    this.stalled = true;
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
    var ttarget = target.element([this.path[cursor]]);
    if(!ttarget){
      //console.trace();
      //console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      listenForTarget.call(this,target,data,cursor);
      if(!this.listeners){return;} //me ded after setStatus...
      listenForDestructor.call(this,target,data,cursor);
      if(target.communication){
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
            console.log('cutting',remotepath,'by',subcursor,'elements on parent rp',this._parent.remotepath);
            remotepath.splice(0,subcursor);
            console.trace();
            console.log('real subpath is',remotepath,'on parent rp',this._parent.remotepath);
          }
        }
        this.pathtocommunication = this.path.slice(0,cursor);
        target.communication.usersend(this,this.pathtocommunication,this.remotepath,'follow',remotepath,(function(_t, _d,_p){
          var t = _t, d = _d, p = _p;
          return function(status){
            if (status === 'DISCARD_THIS') {
              t.remotepath = p;
              t.huntTarget(d);
              return;
            }
            //console.log('remote follow said',arguments);
            t.setStatus(status);
          };
        })(this, data, (this.remotepath) ? this.remotepath.slice() : undefined),this.say,'__persistmycb');
        //console.log('post usersend will change',this.remotepath);
        if(this.remotepath){
          //console.log('augmenting the remotepath',this.remotepath);
          this.remotepath.push(remotepath);
          //console.log('to',this.remotepath);
        }else{
          this.remotepath = remotepath;
        }
        //console.log('to',this.remotepath);
        //console.log('with my followers',this.followers ? Object.keys(this.followers) : 'none');
        //console.log('with parents path',this._parent.path);
        //console.log('and path',this.path);
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
    for(var i in this.followers){
      var f = this.followers[i];
      if(f.stalled){
        console.log('awakening',i);
        f.huntTarget(this.data);
      }else{
        console.log(i,'is awake');
      }
    }
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
    this.say([this.path,[name]]);
    this.destroyListener(name+'_changed');
    this.destroyListener(name+'_destroyed');
  },el.destroyed);
};
DataFollower.prototype.attachToContents = function(){
  if(!this.data){
    this.stalled = true;
    return;
  }
  var t = this;
  //console.log(this.path,'got the Target, this.say',this.say.toString());
  //console.log(this.path,'got the Target');
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
  if(!this.data.access_level){
    console.trace();
    console.log('DataFollower missed the destruction');
    return;
  }
  if(this.remotepath){
    var t = this;
    this.data.communication.usersend(this,this.pathtocommunication,this.remotepath,'explain',cb,'__persistmycb');
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
      this.followers[i].explain(function(item){
        cb([t.path.concat(item[0]),item[1]]);
      });
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
      return function(item){
        _t.say && _t.say([_t.path.concat(item[0]),item[1]]);
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
DataFollower.prototype.handleBid = function(reqname,cb){
  var bf = this.follow(['__requirements',reqname],function(stts){
    if(stts==='OK'){
      bf.destroy();
      cb();
    }
  });
};
DataFollower.prototype.handleOffer = function(reqname,cb){
  var op = ['__requirements',reqname,'offers'];
  var t = this;
  var opf = this.follow(op,function(){},function(item){
    if(item && item[1]){
      var offerid = parseInt(item[1][0]);
      if(offerid){
        var opdf = t.follow(op.concat([offerid]),function(){},
          function offerdatacb(item){
            if(item && item[1] && item[1][0] === 'data' && item[1][1]){
              //console.log('offer item',item);
              opdf.destroyed && opdf.destroy();
              if(cb(offerid,item[1][1])){
                opf.destroyed && opf.destroy();
              }
            }
          }
        );
      }
    }
  });
  return opf;
};

module.exports = DataFollower;
