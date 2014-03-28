var DataUser = require('./DataUser');

function SuperUser(data,cb,username,realmname,roles){
  DataUser.call(this,data,function(){},cb,username,realmname,roles);
};
SuperUser.prototype = new DataUser();
SuperUser.contains = function(){
  return true;
};

module.exports = SuperUser;
