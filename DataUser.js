var DataFollower = require('./DataFollower'),
  UserEngagement = require('./UserEngagement'),
  User = require('./User');

function DataUser(data,createcb,cb,username,realmname,roles,userconstructor,userctoroptions){
  if(!data){return};
  userconstructor = userconstructor || User;
  DataFollower.call(this,data,createcb,cb,User.Create(username,realmname,roles,userconstructor,userctoroptions));
  UserEngagement.call(this,this._parent);
  this._parent.destroyed.attach([this,'parentDestroyed']);
  data.destroyed.attach([this,'dataDestroyed']);
};
DataUser.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:DataUser,
  enumerable:false,
  writable:true,
  configurable:true
}});
DataUser.prototype.dataDestroyed = function(){
  this.setStatus('DISCONNECTED');
  this.destroy();
};
DataUser.prototype.parentDestroyed = function(){
  DataFollower.prototype.destroy.call(this);
};
DataUser.prototype.destroy = function(){
  if(!this._parent){return;}
  this._parent.dismiss(this);
  this.__engager = null;
  DataFollower.prototype.destroy.call(this);
};
DataUser.prototype.dumpEngagementInfo = UserEngagement.prototype.dumpEngagementInfo;

module.exports = DataUser;
