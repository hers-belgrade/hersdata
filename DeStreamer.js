var Collection = require('./Collection');

function DeStreamer(elemnamearry){
  this.elemnames = {};
  for(var i in elemnamearry){
    this.elemnames[elemnamearry[i]] = 1;
  }
  Collection.call(this);
}
DeStreamer.prototype = Object.create(Collection.prototype,{constructor:{
  value:DeStreamer,
  enumerable:false,
  writable:false,
  configurable:false
}});
DeStreamer.prototype.destream = function(item){
  if(item && item[1] && item[1][0] in this.elemnames){
    this.processItemData(item[1]);
  }
};
DeStreamer.prototype.processItemData = function(itemdata){
  if(typeof itemdata[1] === 'undefined'){
    this.remove(itemdata[0]);
    return;
  }
  if(itemdata[1] === null){
    this.add(itemdata[0],new Collection());
    return;
  }
  this.add(itemdata[0],new Scalar(itemdata[1]));
};

module.exports = DeStreamer;
