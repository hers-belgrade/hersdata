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
      return true;
    }
  }
};
KeyRing.prototype.filter = function(txnoperations){
  var ret = [];
  for(var i in txnoperations){

  }
  return ret;
};

KeyRing.prototype.filterDataCopyPrimitive = function(p){
  return p[(p[0] ? (this.contains(p[0]) ? 2 : 1) : 2)];
}

KeyRing.prototype.maintainDataCopy = function(datamaster,datacopy){
  var cf = (function commitFn(dc,kr){
    return function(txnalias,txnid,datacopytxns){
      dc.commit(['start',txnalias,txnid]);
      for(var i in datacopytxns){
        var myp = kr.filterDataCopyPrimitive(datacopytxns[i]);
        if(myp && myp.length){
          console.log('commiting',myp);
          dc.commit(myp.slice());
        }else{
          //console.log(_p,k,myp);
        }
      }
      dc.commit(['end',txnalias]);
    };
  })(datacopy,this);
  var reset = function(){
    var d = datamaster.dump();
    cf('init',datamaster.txnCounterValue(),d[2]);
  };
  reset();
  return {
    reset:reset,
    hook:datamaster.onNewTransaction.attach(function(){
      cf(arguments[1],arguments[4],arguments[3].slice());
    })
  };
};
KeyRing.create = function(username,realmname){
  return new KeyRing();
};

module.exports = KeyRing;
