var BigCounter = require('./BigCounter');

var __UserEngagementCounter = new BigCounter();

function UserEngagement(user){
  __UserEngagementCounter.inc();
  this.__id = __UserEngagementCounter.toString();
  this.__engager = user;
  if(!user.engage){
    process.exit(0);
  }
  user.engage(this);
};

UserEngagement.prototype.destroy = function(){
  if(!this.__engager){return;}
  this.__engager.dismiss(this);
  for(var i in this){
    this[i] = null;
  }
};

function dumpPusher(map,key,item){
  if(key !== '__id' && key !== '__engager' && typeof item !== 'function'){
    map[key] = item;
  }
};

UserEngagement.prototype.dumpEngagementInfo = function(){
  var ret = {};
  for(var i in this){
    dumpPusher(ret,i,this[i]);
  }
  return ret;
};

module.exports = UserEngagement;
