var hersdata = require('hersdata'),
  HookCollection = require('./hookcollection'),
  Broadcaster = require('./Broadcaster');

function BroadcasterGroup(){
  this.newBroadcaster = new HookCollection();
  this.bcasters = {};
}
BroadcasterGroup.prototype.add = function(bcastername,data,username,realmname,roles,makeupcb,bcasterctor){
  if(this.bcasters[bcastername]){
    return this.bcasters[bcastername];
  }
  bcasterctor = bcasterctor||Broadcaster;
  var b = new bcasterctor(data,undefined,username,realmname,roles);
  makeupcb && makeupcb(b);
  this.bcasters[bcastername] = b;
  this.newBroadcaster.fire(bcastername,b);
  return b;
};
BroadcasterGroup.prototype.traverse = function(cb,ctx){
  for(var i in this.bcasters){
    var cbr = cb.call(ctx,i,this.bcasters[i]);
    if(typeof cbr !== 'undefined'){
      break;
    }
  }
};
BroadcasterGroup.prototype.subscribe = function(cb){
  this.traverse(cb);
  return this.newBroadcaster.attach(cb);
};
BroadcasterGroup.prototype.unsubscribe = function(id){
  this.newBroadcaster.detach(id);
};

module.exports = BroadcasterGroup;
