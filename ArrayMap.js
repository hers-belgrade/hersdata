var executable = require('./executable'),
  execapply = executable.apply;

function ArrayMap(){
  this.arry = [];
}
ArrayMap.prototype.allocate = function(index,item){
  var a = this.arry;
  while(a.length<index){
    a.push(void 0);
  }
  var ret = a[index];
  a[index] = item;
  return ret;
}
ArrayMap.prototype.add = function(item){
  if(typeof item === 'undefined'){
    return -1;
  }
  var a = this.arry;
  for(var i in a){
    if(typeof a[i] === 'undefined'){
      a[i] = item;
      return i;
    }
  }
  a.push(item);
  return a.length-1;
};
ArrayMap.prototype.remove = function(index){
  var a = this.arry;
  if(index==a.length-1){
    a.pop();
    while(a.length && typeof a[a.length-1] === 'undefined'){
      a.pop();
    }
  }else{
    a[index] = void 0;
  }
};
ArrayMap.prototype.traverse = function(cb){
  if(!executable.isA(cb)){
    return;
  }
  var a = this.arry;
  var cursor = 0;
  while(cursor<a.length){
    var ar = execapply(cb,[a[cursor],cursor]);
    if(ar){
      return;
    }
    cursor++;
  }
};
ArrayMap.prototype.isEmpty = function(){
  return this.arry.length===0;
};

module.exports = ArrayMap;
