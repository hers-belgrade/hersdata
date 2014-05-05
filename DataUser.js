var DataFollower = require('./DataFollower'),
  User = require('./User');

function DataUser(data,createcb,cb,username,realmname,roles){
  if(!data){return};
  DataFollower.call(this,data,createcb,cb,new User(username,realmname,roles));
  var t = this;
  data.destroyed.attach(function(){createcb.call(t,'DISCONNECTED');});
};
DataUser.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:DataUser,
  enumerable:false,
  writable:true,
  configurable:true
}});
DataUser.prototype.destroy = function(){
  var p = this._parent;
  DataFollower.prototype.destroy.call(this);
  p.destroy();
};

module.exports = DataUser;
