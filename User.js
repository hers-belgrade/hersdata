var KeyRing = require('./keyring'),
  HookCollection = require('./hookcollection'),
  Timeout = require('herstimeout');

function User(username,realmname,roles){
  if(!username){return;}
  KeyRing.call(this,roles);
	this._username = username;
	this._realmname = realmname;
  this.addKey(this.fullname());
}
User.prototype = Object.create(KeyRing.prototype,{constructor:{
  value:User,
  enumerable:false,
  writable:false,
  configurable:false
}});
User.prototype.username = function(){
  return this._username;
};
User.prototype.realmname = function(){
  return this._realmname;
};
User.prototype.fullname = function(){
  return this._username+'@'+this._realmname;
};
User.prototype.contains = function(key){
  if(key===this.fullname){return true;}
  return KeyRing.prototype.contains.call(this,key);
};
User.prototype.perform = function(ownmethod,data,path,pathtaillength,datamethod,paramobj,cb,remotepath){
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
        target.communication.usersend(this,path.slice(0,cursor),remotepath,ownmethod,path.slice(cursor),paramobj,cb);
      }else{
        console.log(this.username(),'could not',ownmethod,paramobj,'on',path,'at',cursor,'with data',target.dataDebug(),'master data',data.dataDebug());
      }
      return;
    }else{
      target = ttarget;
    }
    cursor++;
  }
  if(target.communication){
    target.communication.usersend(this,path.slice(0,cursor),remotepath,ownmethod,path.slice(cursor),paramobj,cb);
  }else{
    target[datamethod](path.slice(cursor),paramobj,cb,this);
  }
};
User.prototype.waitFor = function(data,queryarry,cb,remotepath) {
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
    Timeout.next(function(t,target,queryarry,cursor,cb){target.communication.usersend(t,queryarry.slice(0,cursor),remotepath,'waitFor',queryarry.slice(cursor),cb,'__persistmycb');},this,target,queryarry,cursor,cb);
  }else{
    Timeout.next(function(target,queryarry,cursor,cb,t){target.waitFor(queryarry.slice(cursor),cb,t);},target,queryarry,cursor,cb,this);
  }
};
User.prototype.invoke = function(data,path,paramobj,cb,remotepath) {
  Timeout.next(function(t,data,path,paramobj,cb,remotepath){t.perform('invoke',data,path,2,'run',paramobj,cb,remotepath);},this,data,path,paramobj,cb,remotepath);
};
User.prototype.bid = function(data,path,paramobj,cb,remotepath) {
  Timeout.next(function(t,data,path,paramobj,cb,remotepath){t.perform('bid',data,path,1,'takeBid',paramobj,cb,remotepath);},this,data,path,paramobj,cb,remotepath);
  //this.perform('bid',data,path,1,'takeBid',paramobj,cb,remotepath);
};
User.prototype.offer = function(data,path,paramobj,cb,remotepath) {
  Timeout.next(function(t,data,path,paramobj,cb,remotepath){t.perform('offer',data,path,1,'takeOffer',paramobj,cb,remotepath);},this,data,path,paramobj,cb,remotepath);
  //this.perform('offer',data,path,1,'takeOffer',paramobj,cb,remotepath);
};

module.exports = User;
