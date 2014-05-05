var DataFollower = require('./DataFollower'),
  User = require('./User');

function SuperUser(username,realmname){
  User.call(this,username,realmname,'');
};
SuperUser.prototype = Object.create(User.prototype,{constructor:{
  value:SuperUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
SuperUser.prototype.contains = function(){
  return true;
};

function DataSuperUser(data,statuscb, cb,username,realmname){
  DataFollower.call(this,data,statuscb,cb,new SuperUser(username,realmname));
}
DataSuperUser.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:DataSuperUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
DataSuperUser.prototype.destroy = function(){
  this._parent.destroy();
  DataFollower.prototype.destroy.call(this);
};

module.exports = DataSuperUser;
