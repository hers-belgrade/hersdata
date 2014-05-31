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
    delete this[i];
  }
};

module.exports = UserEngagement;
