var DataUser = require('./DataUser');

function SuperUser(data,cb,username,realmname){
  DataUser.call(this,data,function(){},cb,username,realmname,'');
};
SuperUser.prototype = new DataUser();
SuperUser.prototype.contains = function(){
  return true;
};

module.exports = SuperUser;
