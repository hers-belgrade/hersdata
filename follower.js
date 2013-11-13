function Follower(keyring,path,cb){
  var data = keyring.data.element(path);
  if(!data){
    console.log('no data found at',path);
    //console.log(keyring.data.dataDebug(),'no data found at',path);
    this.destroy = function(){};
    return;
  }
  if(data.type()!=='Collection'){
    console.log('Cannot follow a Scalar at',path);
    return;
  }
  var t = this;
  var newKeyListener = keyring.newKey.attach(function(key){
    console.log('new key',key,'on',path);
    var _cb = cb;
    var _t = t;
    data.traverseElements(function(name,ent){
      switch(ent.type()){
        case 'Collection':
          if(ent.access_level()===key){
            _cb.call(_t,name,ent);
          }
          break;
        case 'Scalar':
          _cb.call(_t,name,ent);
          break;
      }
    });
  });
  var keyRemovedListener = keyring.keyRemoved.attach(function(key){
    console.log('removing key',key);
    var _cb = cb;
    var _t = t;
    data.traverseElements(function(name,ent){
      if(ent.access_level()===key){
        console.log('deleting',name,'because of removed',key);
        _cb.call(_t,name);
      }
    });
    console.log(key,'removed');
  });
  var newElementListener = data.subscribeToElements(function(name,el){
    if(!el){
      cb.call(t,name);
      return;
    }
    switch(el.type()){
      case 'Collection':
        if(keyring.contains(data.access_level())&&keyring.contains(el.access_level())){
          cb.call(t,name,el);
        }
        break;
      case 'Scalar':
        if(keyring.contains(data.access_level())){
          cb.call(t,name,el);
        }
        break;
    }
  });
  this.destroy = function(){
    keyring.newKey.detach(newKeyListener);
    keyring.keyRemoved.detach(keyRemovedListener);
    newElementListener.destroy();
  };
};

module.exports = Follower;
