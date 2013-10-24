function Follower(keyring,path,cb){
  var data = keyring.data.element(path);
  if(!data){
    this.destroy = function(){};
    return;
  }
  var t = this;
  var newKeyListener = keyring.newKey.attach(function(key){
    var _cb = cb;
    data.traverseElements(function(name,ent){
      if(ent.access_level()===key){
        _cb(name,ent);
      }
    });
  });
  var keyRemovedListener = keyring.keyRemoved.attach(function(key){
    var _cb = cb;
    data.traverseElements(function(name,ent){
      if(ent.access_level()===key){
        _cb(name);
      }
    });
  });
  var newElementListener = data.subscribeToElements(function(name,el){
    if(keyring.contains(data.access_level())&&keyring.contains(el.access_level())){
      cb.call(t,name,el);
    }
  });
  this.destroy = function(){
    keyring.newKey.detach(newKeyListener);
    keyring.keyRemoved.detach(keyRemovedListener);
    newElementListener.destroy();
  };
};

module.exports = Follower;
