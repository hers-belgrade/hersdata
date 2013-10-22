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

KeyRing.prototype.filterDataCopyPrimitive = function(path,p){
  var ret = p[(p[0] ? (this.contains(p[0]) ? 2 : 1) : 2)];
  //console.log(ret);
  if(ret&&ret[1]&&beginsWith(ret[1],path)){
    return [ret[0],ret[1].slice(path.length),ret[2]];
  }
  return [];
}

KeyRing.prototype.maintainDataCopy = function(datamaster,path,datacopy){
  var cf = (function commitFn(dc,kr,pth){
    return function(txnalias,txnid,datacopytxns){
      var keys = [];
      for(var i in kr.keys){
        keys.push(i);
      }
      var dolog = false;//kr.targetkey && kr.targetkey.indexOf('Bot0')>0;
      if(dolog){
        console.log(kr.targetkey,keys,'commiting',['start',txnalias,txnid]);
      }
      dc.commit(['start',txnalias,txnid]);
      for(var i in datacopytxns){
        var myp = kr.filterDataCopyPrimitive(pth,datacopytxns[i]);
        if(myp && myp.length){
          if(dolog){
            console.log('commiting',myp);
          }
          dc.commit(myp.slice());
        }else{
          if(dolog){
            console.log(pth,datacopytxns[i]);
          }
        }
      }
      //console.log('commiting',['end',txnalias]);
      dc.commit(['end',txnalias]);
    };
  })(datacopy,this,path);
  var reset = function(){
    var d = datamaster.dump();
    cf('init',datamaster.txnCounterValue(),d[2]);
  };
  var hook = datamaster.onNewTransaction.attach(function(){
    cf(arguments[1],arguments[4],arguments[3].slice());
  });
  reset();
  return {
    reset:reset,
    hook:hook,
    stop:function(){
      datamaster.onNewTransaction.detach(hook)
    }
  };
};
KeyRing.create = function(username,realmname){
  return new KeyRing();
};

module.exports = KeyRing;
