var KeyRing = require('./keyring');
var HookCollection = require('./hookcollection');

function User(username,realmname,roles){
  if(!username){return;}
  KeyRing.call(this,roles);
	this.username = username;
	this.realmname = realmname;
  this.fullname = username+'@'+realmname;
  this.addKey(this.fullname);
}
User.prototype = new KeyRing();
User.prototype.constructor = User;
User.prototype.contains = function(key){
  if(key===this.fullname){return true;}
  return KeyRing.prototype.contains.call(this,key);
};
User.prototype.perform = function(ownmethod,data,path,pathtaillength,datamethod,paramobj,cb){
  if(typeof path === 'string'){
    if(!path){
      cb && cb('INVALID_DATA_PATH');
      return;
    }
    if(path.charAt(0)==='/'){
      path = path.substring(1);
    }
    path = path.split('/');
  }
  if(path.length<pathtaillength){
    cb && cb('INVALID_DATA_PATH');
    return;
  }
  var target = data;
  var cursor = 0;
  while(path.length-cursor>pathtaillength){
    var ttarget = target.element([path[cursor]]);
    if(!ttarget){
      if(target.communication){
        target.communication.usersend(this,path.slice(0,cursor),ownmethod,path.slice(cursor),paramobj,cb);
      }else{
        console.log(this.username,'could not',ownmethod,paramobj,'on',path);
      }
      return;
    }else{
      target = ttarget;
    }
    cursor++;
  }
  if(target.communication){
    target.communication.usersend(this,path.slice(0,cursor),ownmethod,path.slice(cursor),paramobj,cb);
  }else{
    target[datamethod](path.slice(cursor),paramobj,cb,this);
  }
};
User.prototype.invoke = function(data,path,paramobj,cb) {
  this.perform('invoke',data,path,2,'run',paramobj,cb);
};
User.prototype.waitFor = function(data,queryarry,cb) {
  var target = data;
  var cursor = 0;
  while(cursor<queryarry.length){
    var ttarget = target.element([queryarry[cursor]]);
    if(!ttarget){
      break;
    }else{
      if(ttarget.type()==='Collection'){
        target = ttarget;
      }else{
        break;
      }
    }
    cursor++;
  }
  if(target.communication){
    target.communication.usersend(this,queryarry.slice(0,cursor),'waitFor',queryarry.slice(cursor),cb,'__persistmycb');
  }else{
    target.waitFor(queryarry.slice(cursor),cb,this);
  }
};
User.prototype.bid = function(data,path,paramobj,cb) {
  this.perform('bid',data,path,1,'takeBid',paramobj,cb);
};
User.prototype.offer = function(data,path,paramobj,cb) {
  this.perform('offer',data,path,1,'takeOffer',paramobj,cb);
};

module.exports = User;
