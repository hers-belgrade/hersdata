var DataUser = require('./DataUser'),
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

function DataSuperUser(data,statuscb, cb,username,realmname,userconstructor,userctoroptions){
  DataUser.call(this,data,statuscb,cb,username,realmname,'',userconstructor||SuperUser,userctoroptions);
}
DataSuperUser.prototype = Object.create(DataUser.prototype,{constructor:{
  value:DataSuperUser,
  enumerable:false,
  writable:false,
  configurable:false
}});
DataSuperUser.SuperUser = SuperUser;

module.exports = DataSuperUser;
