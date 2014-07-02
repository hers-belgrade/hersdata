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

function __dummy(){};
function __ensureExecutable(entity){
  return __isExecutable(entity) ? entity : __dummy;
}

function __execute(exc){
  if(typeof exc === 'function'){
    return exc.call(null);
  }
  if(exc[2]){
    return exc[1].apply(exc[0],exc[2]);
  }else{
    return exc[1].call(exc[0]);
  }
};

function __executeScalar(exc,param){
  if(typeof exc === 'function'){
    return exc.call(null,param);
  }
  if(exc[2]){
    return exc[1].apply(exc[0],exc[2].concat([param]));
  }else{
    return exc[1].call(exc[0],param);
  }
};

function __executeArray(exc,params){
  if(typeof exc === 'function'){
    return exc.apply(null,params);
  }
  return exc[1].apply(exc[0],exc[2] ? exc[2].concat(params) : params);
};

module.exports = {
  isA: __isExecutable,
  ensure: __ensureExecutable,
  run: __execute,
  call: __executeScalar,
  apply: __executeArray
};
