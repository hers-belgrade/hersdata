var executable = require('./executable'),
  execapply = executable.apply;

function ArrayMap(){
  this.arry = [];
}
ArrayMap.prototype.elementAt = function(index){
  return this.arry[index];
};
function allocateInMap(a,index,item){
  while(a.length<index){
    a.push(void 0);
  }
  var ret = a[index];
  a[index] = item;
  return ret;
}
ArrayMap.prototype.allocate = function(index,item){
  return allocateInMap(this.arry,index,item);
}
function addToMap(a,item){
  for(var i in a){
    if(typeof a[i] === 'undefined'){
      a[i] = item;
      return i;
    }
  }
  a.push(item);
  return a.length-1;
};
ArrayMap.prototype.add = function(item){
  if(typeof item === 'undefined'){
    return -1;
  }
  return addToMap(this.arry,item);
};
function removeFromMap(a,index){
  if(index>=a.length){return;}
  if(index==a.length-1){
    a.pop();
    while(a.length && typeof a[a.length-1] === 'undefined'){
      a.pop();
    }
  }else{
    a[index] = void 0;
  }
};
ArrayMap.prototype.remove = function(index){
  removeFromMap(this.arry,index);
};
function traverseMap(a,cb){
  var cursor = 0;
  while(cursor<a.length){
    var ar = execapply(cb,[a[cursor],cursor]);
    if(ar){
      return;
    }
    cursor++;
  }
}
ArrayMap.prototype.traverse = function(cb){
  if(!executable.isA(cb)){
    return;
  }
  traverseMap(this.arry,cb);
};
ArrayMap.prototype.isEmpty = function(){
  return this.arry.length===0;
};

module.exports = ArrayMap;
