var BigCounter = require('./BigCounter');

var __UserEngagementCounter = new BigCounter();

function UserEngagement(user){
  __UserEngagementCounter.inc();
  this.__id = __UserEngagementCounter.toString();
  this.__engager = user;
  if(!user.engage){
    console.trace();
    console.log('no method named engage in',user);
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

UserEngagement.prototype.dumpEngagementInfo = function(){};

module.exports = UserEngagement;
