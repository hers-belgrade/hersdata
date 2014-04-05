var User = require('./User'),
  Listener = require('./listener'),
  HookCollection = require('./hookcollection');

function numbTeller(){}

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
  this.say = cb;/*function(item){
    cb([path,item]);
  };*/
  this.createcb = createcb;
  this.destroyed = new HookCollection();
  if(user.remotepath){
    //console.log('parent remotepath',user.remotepath);
    this.remotepath = [user.remotepath];
  }
  this.huntTarget(data);
}
DataFollower.prototype = new User();
for(var i in Listener.prototype){
  DataFollower.prototype[i] = Listener.prototype[i];
}
DataFollower.prototype.destroy = function(){
  this.destroyed.fire();
  Listener.prototype.destroy.call(this);
  User.prototype.destroy.call(this);
}
function listenForTarget(target,data,cursor){
  this.createListener('newelementlistener',function(name,el){
    if(name===this.path[cursor]){
      this.huntTarget(data);
    }
  },target.newElement);
  this.createcb.call(this,'LATER');
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
      console.log('huntTarget stopped on',this.path,'at',cursor,'target',target.communication ? 'has' : 'has no','communication',target.dataDebug());
      if(target.communication){
        var remotepath = this.path.slice(cursor);
        target.communication.usersend(this,'follow',remotepath,function(){
          console.log('remote follow said',arguments);
        },function(item){
          console.log('remote say said',item);
        });
        if(this.remotepath){
          //console.log('augmenting the remotepath',this.remotepath);
          this.remotepath.push(remotepath);
          console.log('to',this.remotepath);
        }else{
          this.remotepath = remotepath;
        }
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
    this.createcb && this.createcb.call(this,'OK');
    delete this.createcb;
    this.cb && this.explain();
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
DataFollower.prototype.attachToScalar = function(name,el){
  this.createListener(name+'_changed',function(changedmap){
    this.reportScalar(name,el,this.say);
  },el.changed);
  this.createListener(name+'_destroyed',function(){
    this.say.apply(this,[this.path,[name]]);
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
};
DataFollower.prototype.reportScalar = function(name,el,cb){
  cb([this.path,[name,this.contains(el.access_level()) ? el.value() : el.public_value()]]);
};
DataFollower.prototype.reportElement = function(name,el,cb){
  cb = cb || this.say;
  switch(el.type()){
    case 'Scalar':
      this.reportScalar(name,el,cb);
      break;
    case 'Collection':
      if(this.contains(el.access_level())){
        cb([this.path,[name,null]]);
      }
      break;
  }
};
DataFollower.prototype.explain = function(cb){
  if(!this.data){return;}
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
DataFollower.prototype.plantAt = function(path,createcb,ctor){
  ctor = ctor || DataFollower;//this.constructor;
  //console.log('planting with ctor',ctor.toString());
  path = path || [];
  var spath = path.join('/') || '.';
  if(this.followers && this.followers[spath]){
    return this.followers[spath];
  }
  if(!this.followers){
    this.followers = {};
  }
  var df = new ctor(this.data,createcb,this.say,this,path);
  //var df = new DataFollower(this.data,cb,this.say,this,path);
  this.followers[spath] = df;
  return df;
}
DataFollower.prototype.follow = function(path,cb){
  return this.plantAt(path,cb,DataFollower);
};
DataFollower.prototype.describe = function(cb){
  var ret = [];
  this.explain(function(item){
    ret.push(item);
  });
  cb(ret);
};

module.exports = DataFollower;
