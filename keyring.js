var HookCollection = require('./hookcollection');

function KeyRing(username,realmname,roles){
  if(typeof username !== 'string'){
    console.trace();
    console.log('backwards compatibility problem?');
    process.exit(0);
  }
  this.keys = {};
  this.newKey = new HookCollection();
  this.keyRemoved = new HookCollection();
  this.destroyed = new HookCollection();
	this.roles = roles;
	this.username = username;
	this.realmname = realmname;
  if(roles){
    this.addKeys(roles.split(','));
  }
};
KeyRing.prototype.perform = function(ownmethod,data,path,pathtaillength,datamethod,paramobj,cb){
  //console.log('invoke',data.dataDebug(),path,paramobj);
  if(typeof path === 'string'){
    if(!path){
      cb && cb('INVALID_DATA_PATH');
      return;
    }
    if(path.charAt(0)==='/'){
      path = path.substring(1);
    }
    path = path.split('/');
  }
  if(path.length<pathtaillength){
    cb && cb('INVALID_DATA_PATH');
    return;
  }
  var target = data;
  while(path.length>pathtaillength){
    var ttarget = target.element([path[0]]);
    if(!ttarget){
      if(target.communication){
        target.communication.usersend(this,ownmethod,'this',path,paramobj,cb);
      }else{
        console.log(this.username,'could not',ownmethod,paramobj,'on',path);
      }
      return;
    }else{
      target = ttarget;
    }
    path.shift();
  }
  if(target.communication){
    target.communication.usersend(this,ownmethod,'this',path,paramobj,cb);
  }else{
    target[datamethod](path,paramobj,cb,this);
  }
};
KeyRing.prototype.invoke = function(data,path,paramobj,cb) {
  this.perform('invoke',data,path,2,'run',paramobj,cb);
};
KeyRing.prototype.bid = function(data,path,paramobj,cb) {
  this.perform('bid',data,path,1,'takeBid',paramobj,cb);
};
KeyRing.prototype.offer = function(data,path,paramobj,cb) {
  this.perform('offer',data,path,1,'takeOffer',paramobj,cb);
};
KeyRing.prototype.containsKeyRing = function(keyring){
  for(var k in keyring.keys){
    if(typeof this.keys[k] === 'undefined'){
      return false;
    }
  }
  return true;
};
KeyRing.prototype.contains = function(key){
  return typeof key ==='undefined' || this.keys[key];
};
KeyRing.prototype.addKey = function(key){
  if(typeof this.keys[key] === 'undefined'){
    this.keys[key] = 1;
    this.newKey.fire(key);
    return true;
  }else{
    this.keys[key]++;
  }
};
KeyRing.prototype.addKeys = function(keynamearry){
  for(var i=0; i<keynamearry.length; i++){
    if(keynamearry[i]){
      this.addKey(keynamearry[i]);
    }
  }
};
KeyRing.prototype.removeKey = function(key){
  if(typeof this.keys[key] !== 'undefined'){
    this.keys[key]--;
    if(this.keys[key]<1){
      delete this.keys[key];
      this.keyRemoved.fire(key);
      return true;
    }
  }
};
KeyRing.prototype.destroy = function(){
  if(!this.destroyed){return;}
  this.destroyed.fire();
  this.newKey.destruct();
  this.keyRemoved.destruct();
  this.destroyed.destruct();
  for(var i in this){
    delete this[i];
  }
};
KeyRing.prototype.dump = function(){
  var ret = {roles:this.roles};
  var ra = this.roles ? this.roles.split(',') : [];
  var ks = [];
  for(var k in this.keys){
    if(ra.indexOf(k)<0){
      ks.push(k);
    }
  }
  ret.keys = ks.join(',');
  return ret;
};

KeyRing.create = function(data,username,realmname,roles){
  return new KeyRing(data,username,realmname,roles);
};

module.exports = KeyRing;
