var HookCollection = require('./hookcollection');
var KeyRing = require('./keyring');

function UserBase(){
  this.realms = {};
  this.newUser = new HookCollection();
  this.userOut = new HookCollection();
};
UserBase.prototype.constructor = UserBase;
UserBase.prototype.setUser = function(username,realmname,roles){
  if(typeof realmname === 'undefined'){
    console.log('cannot set user without a realmname');
    console.trace();
    return;
  }
  if(typeof username === 'undefined'){
    console.log('cannot set user without a username');
    console.trace();
    return;
  }
  var realm = this.realms[realmname];
  if(!realm){
    realm = {};
    this.realms[realmname] = realm;
  }
  var u = realm[username];
  if(!u){
    //console.log(username+'@'+realmname,'not found');
    u = new KeyRing(username,realmname,roles);
    realm[username] = u;
    //console.log('firing newUser',u.username,u.realmname);
    this.newUser.fire(u);
    var t = this;
    u.destroyed.attach(function(){
      delete realm[username];
      t.userOut.fire(u);
    });
  }
  return u;
};
UserBase.prototype.findUser = function(username,realmname){
  if(!(this.realms&&this.realms[realmname])){
    return;
  }
  return this.realms[realmname][username];
};
UserBase.prototype.removeUser = function(username,realmname){
  var rs = this.realms;
  if(!rs){return;}
  var realm = rs[realmname];
  if(!realm){return;}
  this.findUser(username,realmname,function(user){
    if(!user){return;}
    delete realm[username];
    user.destroy();
  });
};
UserBase.prototype.usersFromRealm = function(replicatoken){
  var ret = {};
  if(replicatoken && replicatoken.realmname){
    var r = this.realms[replicatoken.realmname];
    var rtn = replicatoken.name;
    var rus = {};
    for(var _u in r){
      var __u = r[_u];
      if(__u.replicatorName===rtn){
        rus[_u] = __u.dump();
      }
    }
    ret[replicatoken.realmname] = rus;
  }else{
    for(var _r in this.realms){
      var r = this.realms[_r];
      var rus = {};
      for(var _u in r){
        rus[_u] = r[_u].dump();
      }
      ret[_r] = rus;
    }
  }
  return ret;
};

var __Instance = new UserBase();

module.exports = __Instance;
