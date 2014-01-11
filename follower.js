function Follower(keyring,path,cb,selfdestruct){
  if(selfdestruct===true){
    console.log('WILL SELFDESTRUCT');
  }
  var data = keyring.data.element(path);
  if(!data){
    //console.log('no data found at',path,keyring.data.dataDebug());
    this.destroy = function(){};
    return;
  }
  if(data.type()!=='Collection'){
    console.log('Cannot follow a Scalar at',path);
    return;
  }
  var t = this;
  this.destroy = function(){
    t.shouldDie = true;
  };
  var cbcall = function(name,ent){
    cb.call(t,name,ent);
  };
  var filtercollectioncb = function(key,withremove){
    return function(name,ent){
      if(ent.access_level()===key){
        cbcall(name,ent);
      }else{
        if(withremove){
          console.log('remove',name);
          cbcall(name);
        }
      }
    };
  };
  var newElementListener = data.subscribeToElements(function(name,el){
    if(!el){
      //console.log(name,'deleted');
      cb.call(t,name);
      return;
    }
    switch(el.type()){
      case 'Collection':
        if(keyring.contains(data.access_level())&&keyring.contains(el.access_level())){
          cbcall(name,el);
        }/*else{
          console.log(name,'will not be shown',data.access_level(),el.access_level(),keyring.keys);
        }*/
        break;
      case 'Scalar':
        if(keyring.contains(data.access_level())){
          cbcall(name,el);
        }else{
          //console.log(name,'will not be shown',data.access_level(),keyring.keys);
        }
        break;
    }
  });
  var newKeyListener = keyring.newKey.attach(function(key){
    data.traverseElements(function(name,ent){
      switch(ent.type()){
        case 'Collection':
          if(ent.access_level()===key){
            cbcall(name,ent);
          }
          break;
        case 'Scalar':
          cbcall(name,ent);
          break;
      }
    });
  });
  var keyRemovedListener = keyring.keyRemoved.attach(function(key){
    data.traverseElements(function(name,ent){
      if(ent.access_level()===key){
        cbcall(name);
      }
    });
  });
  var selfdestroyer = function(){
    keyring.newKey.detach(newKeyListener);
    keyring.keyRemoved.detach(keyRemovedListener);
    newElementListener.destroy();
    if(this.dataselfdestroyer && data.destroyed){
      data.destroyed.detach(this.dataselfdestroyer);
    }
    if(this.userselfdestroyer && data.destroyed){
      data.destroyed.detach(this.userselfdestroyer);
    }
    if(typeof selfdestruct==='function'){
      selfdestruct.call(t);
    }
    for(var i in this){
      delete this[i];
    }
  };
  this.dataselfdestroyer = data.destroyed.attach(function(){
    selfdestroyer.call(t);
  });
  this.userselfdestroyer = keyring.destroyed.attach(function(){
    selfdestroyer.call(t);
  });
  this.destroy = selfdestroyer;
  if(this.shouldDie){
    console.log('shouldDie');
    selfdestroyer.call(t);
  }
};

module.exports = Follower;
