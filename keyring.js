var HookCollection = require('./hookcollection');

function KeyRing(data,username,realmname){
  if(!data){
    console.trace();
  }
  this.data = data;
  this.keys = {};
  this.newKey = new HookCollection();
  this.keyRemoved = new HookCollection();
};
KeyRing.prototype.take = function(keyring){
  if(typeof keyring === 'undefined'){
    return;
  }
  var kk = keyring.keys;
  var tk = this.keys;
  for(var k in kk){
    if(typeof tk[k] === 'undefined'){
      tk[k] = kk[k];
    }else{
      tk[k] += kk[k];
    }
  }
};
KeyRing.prototype.reset = function(otherkeyring){
  this.keys = {};
  this.take(otherkeyring);
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
    this.addKey(keynamearry[i]);
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

function beginsWith(haystack,needle){
  if(!haystack){return false;}
  for(var i in needle){
    var h = haystack[i];
    if(!h){return false;}
    if(h!==needle[i]){
      return false;
    }
  }
  return true;
}
KeyRing.prototype.destroy = function(){
  this.newKey.destruct();
  this.keyRemoved.destruct();
};

KeyRing.create = function(data,username,realmname){
  return new KeyRing(data,username,realmname);
};

module.exports = KeyRing;
