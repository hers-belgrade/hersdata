function TypeFollower(addscalarcb,addcollectioncb,removecb,ctx){
  return function(name,ent){
    if(typeof ent === 'undefined'){
      removecb && removecb.call(ctx,name);
    }else{
      switch(ent.type()){
        case 'Collection':
          addcollectioncb && addcollectioncb.call(ctx,name,null);
        break;
        case 'Scalar':
          addscalarcb && addscalarcb.call(ctx,name,ent.value());
        break;
      }
    }
  };
};

function ScalarFollower(scalarname,addcb,removecb,ctx){
  return TypeFollower(function(name,val){
    if(addcb && name===scalarname){
      addcb.call(this,name,val);
    }
  },function(name){
    if(removecb && name===scalarname){
      removecb.call(this,name,val);
    }
  },ctx);
};

function ScalarsFollower(scalarnames,cb,validation,ctx){
  var map = {};
  for(var i in scalarnames){
    map[scalarnames[i]]=null;
  }
  var validate = validation || function(){
    for(var i in map){
      if(map[i] === null){
        return false;
      }
    }
    return true;
  };
  return TypeFollower(function(name,val){
    if(name in map){
      map[name] = val;
    }
    if(validate(map)){
      cb.call(ctx,map);
    }
  },null,function(name){
    if(name in map){
      map[name] = null;
    }
  });
};

function TypedScalarsFollower(scalarnametypes,cb,ctx){
  var scalarnames;
  function validation(map){
    for(var i in scalarnametypes){
      if(typeof map[i] !== scalarnametypes[i]){
        return false;
      }
    }
    return true;
  }
  return ScalarsFollower(scalarnames,cb,validation,ctx);
};
