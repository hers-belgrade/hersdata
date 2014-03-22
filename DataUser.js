var User = require('./User'),
  Listener = require('./listener');

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
  if(!data){return;}
  Listener.call(this);
  User.call(this,user.username,user.realmname,user.roles);
  path = path || [];
  this.path = path;
  this.say = cb;/*function(item){
    cb([path,item]);
  };*/
  this.createcb = createcb;
  this.huntTarget(data);
}
DataFollower.prototype = new User();
for(var i in Listener.prototype){
  DataFollower.prototype[i] = Listener.prototype[i];
}
DataFollower.prototype.destroy = function(){
  Listener.prototype.destroy.call(this);
  User.prototype.destroy.call(this);
}
function listenForTarget(target,data,cursor){
  this.createListener('newelementlistener',function(name,el){
    if(name===this.path[cursor]){
      this.huntTarget(data);
    }
  },target.newElement);
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
      listenForTarget.call(this,target,data,cursor);
      listenForDestructor.call(this,target,data,cursor);
      target = null;
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
    this.createcb('OK');
    delete this.createcb;
    this.explain();
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
DataFollower.prototype.reportElement = function(name,el,cb){
  cb = cb || this.say;
  switch(el.type()){
    case 'Scalar':
      cb([this.path,[name,this.contains(el.access_level()) ? el.value() : el.public_value()]]);
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

function DataUser(data,cb,username,realmname,roles){
  if(!data){return};
  DataFollower.call(this,data,cb,cb,new User(username,realmname,roles));
};
DataUser.prototype = new DataFollower();
DataUser.prototype.constructor = DataUser;
DataUser.prototype.invoke = function(path,paramobj,cb){
  console.trace();
  console.log('invoking',path,paramobj);
  return User.prototype.invoke.call(this,this.data,path,paramobj,cb);
};
DataUser.prototype.bid = function(path,paramobj,cb){
  return User.prototype.invoke.bid(this,this.data,path,paramobj,cb);
};
DataUser.prototype.offer = function(path,paramobj,cb){
  return User.prototype.invoke.offer(this,this.data,path,paramobj,cb);
};
DataUser.prototype.follow = function(path,cb){
  path = path || [];
  var spath = path.join('/') || '.';
  if(this.followers && this.followers[spath]){
    return;
  }
  if(!this.followers){
    this.followers = {};
  }
  var df = new DataFollower(this.data,cb,this.say,this,path);
  this.followers[spath] = df;
};
DataUser.prototype.describe = function(cb){
  var ret = [];
  this.explain(function(item){
    ret.push(item);
  });
  cb(ret);
};

module.exports = DataUser;
