function __isExecutable(entity){
  var toe = typeof entity;
  if(toe==='function'){return true;}
  if(toe==='object' && entity instanceof Array && (entity.length===2 || entity.length===3)){
    if(typeof entity[1]==='function'){
      return true;
    }else{
      var m = entity[0][entity[1]];
      if(typeof m !== 'function'){
        return false;
      }
      entity[1] = m;
    }
    return true;
  }
  return false;
};

function __executeScalar(exc,param){
  if(typeof exc === 'function'){
    exc.call(null,param);
    return;
  }
  if(exc[2]){
    exc[1].apply(exc[0],exc[2].concat([param]));
  }else{
    exc[1].call(exc[0],param);
  }
};

function __executeArray(exc,params){
  if(typeof exc === 'function'){
    exc.apply(null,params);
    return;
  }
  exc[1].apply(exc[0],exc[2] ? exc[2].concat(params) : params);
};

module.exports = {
  isA: __isExecutable,
  call: __executeScalar,
  apply: __executeArray
};
