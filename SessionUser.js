var KeyRing = require('./keyring');

function SessionUser(data,username,realmname){
  KeyRing.call(this,data,username,realmname);
};
SessionUser.prototype = new KeyRing();
SessionUser.prototype.constructor = SessionUser;


module.exports = SessionUser;
