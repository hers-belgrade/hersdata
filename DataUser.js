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
  writable:false,
  configurable:false
}});

module.exports = DataUser;
