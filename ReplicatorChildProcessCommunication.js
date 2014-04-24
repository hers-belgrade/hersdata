var ReplicatorCommunication = require('./ReplicatorCommunication');

function CPReplicatorCommunication(data){
  ReplicatorCommunication.call(this,data);
  var t = this;
  this.messageHandler = function(input){
    t.handOver(input);
  };
}
CPReplicatorCommunication.prototype = Object.create(ReplicatorCommunication.prototype,{constructor:{
  value:CPReplicatorCommunication,
  enumerable:false,
  writable:true,
  configurable:true
}});

function Child(data){
  CPReplicatorCommunication.call(this,data);
  process.on('message',this.messageHandler);
}
Child.prototype = Object.create(CPReplicatorCommunication.prototype,{constructor:{
  value:Child,
  enumerable:false,
  writable:true,
  configurable:true
}});
Child.prototype.destroy = function(){
  process.removeListener('message',this.messageHandler);
  CPReplicatorCommunication.prototype.destroy.call(this);
}
Child.prototype.sendobj = function(obj){
  try{
    process.send(obj);
  }catch(e){
    console.log('could not send',obj);
    console.log(e);
  }
};

function Parent(data){
  CPReplicatorCommunication.call(this,data);
}
Parent.prototype = Object.create(CPReplicatorCommunication.prototype,{constructor:{
  value:Parent,
  enumerable:false,
  writable:true,
  configurable:true
}});
Parent.prototype.destroy = function(){
  if(this.cp){
    this.cp.removeListener('message',this.messageHandler);
  }
  CPReplicatorCommunication.prototype.destroy.call(this);
};
Parent.prototype.sendobj = function(obj){
  try{
    this.cp.send(obj);
  }catch(e){
    console.log('could not send',obj);
    console.log(e);
  }
};
Parent.prototype.listenTo = function(cp){
  if(this.cp){
    this.cp.removeListener('message',this.messageHandler);
  }
  this.cp = cp;
  cp.on('message',this.messageHandler);
};

module.exports = {
  Child:Child,
  Parent:Parent
};
