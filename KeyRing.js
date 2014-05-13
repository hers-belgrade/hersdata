var HookCollection = require('./hookcollection');

function KeyRing(roles){
  if(typeof roles === 'undefined'){
    return;
  }
  this.keys = {};
  this.newKey = new HookCollection();
  this.keyRemoved = new HookCollection();
  this.destroyed = new HookCollection();
	this._roles = roles;
  if(roles){
    this.addKeys(roles.split(','));
  }
};
KeyRing.prototype.roles = function(){
  return this._roles;
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

module.exports = KeyRing;