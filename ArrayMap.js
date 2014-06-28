var executable = require('./executable');

function ArrayMap(){
  this.arry = [];
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
  var exec = executable.apply;
  var a = this.arry;
  var cursor = 0;
  while(cursor<a.length){
    exec(cb,[a[cursor],cursor]);
    cursor++;
  }
};
ArrayMap.prototype.isEmpty = function(){
  return this.arry.length===0;
};

module.exports = ArrayMap;
