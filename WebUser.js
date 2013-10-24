var KeyRing = require('./keyring');

function WebUser(data,username,realmname){
  KeyRing.call(this,data,username,realmname);
};
WebUser.prototype = new KeyRing();
WebUser.prototype.constructor = WebUser;


module.exports = WebUser;
