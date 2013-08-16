function KeyRing(){
  this.keys = {};
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

KeyRing.prototype.containsKeyRing = function(keyring){
  for(var k in keyring.keys){
    if(typeof this.keys[k] === 'undefined'){
      return false;
    }
  }
  return true;
};
KeyRing.prototype.contains = function(key){
  var tok = typeof key;
  if(tok === 'undefined'){
    return true;
  }
  if((tok !== 'string')&&(tok !== 'number')){
    for(var i=0; i<key.length; i++){
      if(!this.contains(key[i])){
        return false;
      }
    }
    return true;
  }
  return (typeof this.keys[key] !== 'undefined');
};
KeyRing.prototype.addKey = function(key){
  if(typeof this.keys[key] === 'undefined'){
    this.keys[key] = 1;
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
    }
  }
};
KeyRing.prototype.filter = function(txnoperations){
  var ret = [];
  for(var i in txnoperations){

  }
  return ret;
};

module.exports = KeyRing;
