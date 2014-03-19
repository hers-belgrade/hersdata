var KeyRing = require('./keyring');

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

function DataUser(data,cb,username,realmname,roles){
  if(!username){return};
  this.fullname = username+'@'+realmname;
  this.user = new KeyRing(username,realmname,roles);
  this.newKey = this.user.newKey;
  this.keyRemoved = this.user.keyRemoved;
  this.destroyed = this.user.destroyed;
  this.data = data;
  this.say = cb;
  this.say('OK');
};
DataUser.prototype.contains = function(key){
  if(key===this.fullname){return true;}
  return this.user.contains(key);
};
DataUser.prototype.destroy = function(){
  this.user.destroy();
  for(i in this){
    delete this[i];
  }
};
DataUser.prototype.followerFor = function(name){
  var fn,fs;
  if((typeof name === 'object') && (name instanceof Array)){
    fn = name[0];
    fs = name[1];
  }else{
    fn = name;
    fs = false;
  }
};
DataUser.prototype.addKey = function(key){
  this.user.addKey(key);
};
DataUser.prototype.invoke = function(path,paramobj,cb){
  console.trace();
  console.log('invoking',path,paramobj);
  return this.user.invoke(this.data,path,paramobj,cb);
};
DataUser.prototype.bid = function(path,paramobj,cb){
  return this.user.bid(this.data,path,paramobj,cb);
};
DataUser.prototype.offer = function(path,paramobj,cb){
  return this.user.offer(path,paramobj,cb);
};
DataUser.prototype.describe = function(){
  if(!this.contains(this.data.access_level())){
    return;
  }
  var t = this;
  this.data.traverseElements(function(name,el){
    switch(el.type()){
      case 'Scalar':
        t.say([name,t.contains(el.access_level()) ? el.value() : el.public_value()]);
        break;
      case 'Collection':
        if(t.contains(el.access_level())){
          t.say([name,null]);
        }
        break;
    }
  });
};
DataUser.prototype.follow = function(path,cb){
  if(!path){return;}
  var target = this;
  while(path.length){
    var pe = path[0],pn,ps;
    if(typeof pe === 'string'){
      pn = pe;
    }else{
      pn = pe[0];
      ps = pe[1];
    }
    var ttarget = target.followers && target.followers[pn];
    if(!ttarget){
      if(!target.followers){
      }
      var dtarget = target.data;
      if(dtarget.communication){
        console.log('time to jump over the socket gap',pn);
      }else{
        cb('LATER');
      }
      return;
    }
    target = ttarget;
    if(!ps){
      if(!this.followers){
        this.followers = {};
      }
      if(!this.followers[pn]){
        this.followers[pn] = new DataUser(this.user.username,this.user.realmname,this.user.roles,target,this.say);
      }
    }
    path.shift();
  }
  ta
};

module.exports = DataUser;
