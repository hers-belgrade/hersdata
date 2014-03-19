var KeyRing = require('./keyring');

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

function DataUser(username,realmname,roles,data,cb){
  if(!username){return};
  this.fullname = username+'@'+realmname;
  this.user = new KeyRing(username,realmname,roles);
  this.newKey = this.user.newKey;
  this.keyRemoved = this.user.keyRemoved;
  this.destroyed = this.user.destroyed;
  this.data = data;
  if(!this.data.subscribers){
    this.data.subscribers=[];
  };
  if(!this.data.observers){
    this.data.observers=[];
  };
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

module.exports = DataUser;
