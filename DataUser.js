var DataFollower = require('./DataFollower'),
  UserEngagement = require('./UserEngagement'),
  User = require('./User');

function DataUser(data,createcb,cb,username,realmname,roles,userconstructor){
  if(!data){return};
  userconstructor = userconstructor || User;
  DataFollower.call(this,data,createcb,cb,User.Create(username,realmname,roles,userconstructor));
  UserEngagement.call(this,this._parent);
  var t = this;
  this._parent.destroyed.attach(function(){
    DataFollower.prototype.destroy.call(t);
  });
  data.destroyed.attach(function(){
    createcb.call(t,'DISCONNECTED');
    t.destroy();
  });
};
DataUser.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:DataUser,
  enumerable:false,
  writable:true,
  configurable:true
}});
DataUser.prototype.destroy = function(){
  if(!this._parent){return;}
  this._parent.dismiss(this);
  delete this.__engager;
  DataFollower.prototype.destroy.call(this);
};

module.exports = DataUser;
