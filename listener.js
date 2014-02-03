function Listener(){
  this.listeners = {};
}
Listener.prototype.createListener = function(listenername,listenerfunc,hookcollection){
  if(this.listeners[listenername]){
    this.listeners[listenername].destroy();
  }
  var hi =  hookcollection.attach((function(t,f){
    var _t=t,_f=f;
    return function(){
      _f.apply(_t,arguments);
    }
  })(this,listenerfunc));
  this.listeners[listenername] = {
    destroy: function(){
      hookcollection.detach(hi);
    }
  };
};
Listener.prototype.destroyListener = function(listenername){
  var l = this.listeners[listenername];
  if(l){
    l.destroy();
    delete this.listeners[listenername];
  }
};
Listener.prototype.destroy = function(){
  for(var i in this.listeners){
    this.listeners[i].destroy();
  }
  delete this.listeners;
};

module.exports = Listener;
