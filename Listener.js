function Listener(){
  this.listeners = {};
}
Listener.prototype.createListener = function(listenername,listenerfunc,hookcollection){
  var hi;
  if(typeof listenerfunc === 'function'){
    this.destroyRaw(listenername);
    hi =  hookcollection.attach((function(t,f){
      var _t=t,_f=f;
      return function(){
        _f.apply(_t,arguments);
      }
    })(this,listenerfunc));
  }else{
    if(typeof listenerfunc === 'object' && listenerfunc instanceof Array){
      var ln = listenername;
      for(var i in listenerfunc){
        ln+=('_'+listenerfunc[i]);
      }
      this.destroyRaw(ln);
      hi = hookcollection.attach([this,listenername,listenerfunc]); 
      listenername = ln;
    }else{
      this.destroyRaw(listenername);
      hi = hookcollection.attach([this,listenername]); 
    }
  }
  if(typeof hi !== 'undefined'){
    this.listeners[listenername] = [hookcollection,hi];
  }
};
Listener.prototype.destroyRaw = function(fulllistenername){
  var l = this.listeners[fulllistenername];
  if(l){
    l[0] && l[0].detach && l[0].detach(l[1]);
    delete this.listeners[fulllistenername];
  }
};
Listener.prototype.destroyListener = function(listenername,paramarry){
  if(paramarry){
    for(var i in paramarry){
      listenername += ('_'+paramarry[i]);
    }
  }
  var l = this.listeners[listenername];
  if(l){
    l[0] && l[0].detach && l[0].detach(l[1]);
    delete this.listeners[listenername];
  }
};
Listener.prototype.purgeListeners = function(){
  for(var i in this.listeners){
    this.destroyRaw(i);
  }
};
Listener.prototype.destroy = function(){
  this.purgeListeners();
  this.listeners = null;
};

module.exports = Listener;
