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
KeyRing.prototype.invoke = function (data, request, paramobj, cb) {
  if(typeof data === 'string'){
    console.trace();
    console.log('backwards compatibility problem?');
    process.exit(0);
  }
	data && data.invoke(request, paramobj,this.username, this.realmname, this.roles, cb);
}
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
  console.log(this.username,'destroying');
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
