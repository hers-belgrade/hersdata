function Listener(){
  this.listeners = {};
}
Listener.prototype.createListener = function(listenername,listenerfunc,hookcollection){
  var l = this.listeners[listenername];
  if(l){
    l[0] && l[0].detach && l[0].detach(l[1]);
  }
  var hi;
  if(typeof listenerfunc === 'function'){
    hi =  hookcollection.attach((function(t,f){
      var _t=t,_f=f;
      return function(){
        _f.apply(_t,arguments);
      }
    })(this,listenerfunc));
  }else{
    if(typeof listenerfunc === 'object' && listenerfunc instanceof Array){
      hi = hookcollection.attach([this,listenername,listenerfunc]); 
      for(var i in listenerfunc){
        listenername+=('_'+listenerfunc[i]);
      }
    }else{
      hi = hookcollection.attach([this,listenername]); 
    }
  }
  if(hi){
    this.listeners[listenername] = [hookcollection,hi];
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
    var l = this.listeners[i];
    l[0] && l[0].detach && l[0].detach(l[1]);
    delete this.listeners[i];
  }
};
Listener.prototype.destroy = function(){
  this.purgeListeners();
  delete this.listeners;
};

module.exports = Listener;
