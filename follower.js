function Follower(keyring,path,cb){
  var data = keyring.data.element(path);
  if(!data){
    console.log('no data found at',path,keyring.data.dataDebug());
    this.destroy = function(){};
    return;
  }
  if(data.type()!=='Collection'){
    console.log('Cannot follow a Scalar at',path);
    return;
  }
  var t = this;
  var newKeyListener = keyring.newKey.attach(function(key){
    //console.log('new key',typeof key,key,'on',path);
    var _cb = cb;
    var _t = t;
    data.traverseElements(function(name,ent){
      switch(ent.type()){
        case 'Collection':
          if(ent.access_level()===key){
            _cb.call(_t,name,ent);
          }/*else{
            console.log(path.join('.'),'Collection',name,'will not be followed',key,'<>',ent.access_level());
          }*/
          break;
        case 'Scalar':
          _cb.call(_t,name,ent);
          break;
      }
    });
  });
  var keyRemovedListener = keyring.keyRemoved.attach(function(key){
    //console.log('removing key',key);
    var _cb = cb;
    var _t = t;
    data.traverseElements(function(name,ent){
      if(ent.access_level()===key){
        //console.log('deleting',name,'because of removed',key);
        _cb.call(_t,name);
      }
    });
    //console.log(key,'removed');
  });
  var newElementListener = data.subscribeToElements(function(name,el){
    if(!el){
      //console.log(name,'deleted');
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
    for(var i in this){
      delete this[i];
    }
  };
};

module.exports = Follower;
