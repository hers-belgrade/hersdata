var KeyRing = require('./keyring');
var HookCollection = require('./hookcollection');

function User(username,realmname,roles){
  if(!username){return;}
  KeyRing.call(this,roles);
	this.username = username;
	this.realmname = realmname;
  this.fullname = username+'@'+realmname;
}
User.prototype = new KeyRing();
User.prototype.constructor = User;
User.prototype.contains = function(key){
  if(key===this.fullname){return true;}
  return KeyRing.prototype.contains.call(this,key);
};
User.prototype.perform = function(ownmethod,data,path,pathtaillength,datamethod,paramobj,cb){
  //console.log('invoke',data.dataDebug(),path,paramobj);
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
  var specificargs = Array.prototype.slice.call(arguments,5); //here comes e.g. paramobj,cb or just cb
  while(path.length>pathtaillength){
    var ttarget = target.element([path[0]]);
    if(!ttarget){
      if(target.communication){
        target.communication.usersend(this,ownmethod,path,paramobj,cb);
        /*
        specificargs.unshift(path);
        specificargs.unshift(ownmethod);
        specificargs.unshift(this);
        target.communication.usersend.apply(target.communication,specificargs);
        */
      }else{
        console.log(this.username,'could not',ownmethod,paramobj,'on',path);
      }
      return;
    }else{
      target = ttarget;
    }
    path.shift();
  }
  if(target.communication){
    target.communication.usersend(this,ownmethod,path,paramobj,cb);
    /*
    specificargs.unshift(path);
    specificargs.unshift(ownmethod);
    specificargs.unshift(this);
    target.communication.usersend.apply(target.communication,specificargs);
    */
  }else{
    target[datamethod](path,paramobj,cb,this);
    /*
    specificargs.unshift(path);
    specificargs.push(this);
    target[datamethod].apply(target,specificargs);
    */
  }
};
User.prototype.invoke = function(data,path,paramobj,cb) {
  this.perform('invoke',data,path,2,'run',paramobj,cb);
};
User.prototype.waitFor = function(data,queryarry,cb) {
  console.log('waitFor',data.dataDebug(),queryarry);
  //this.perform('waitFor',data,[],0,'waitFor',queryarry,cb);
  var target = data;
  while(queryarry.length){
    var ttarget = target.element([queryarry[0]]);
    if(!ttarget){
      if(target.communication){
        target.communication.usersend(this,'waitFor',queryarry,cb);
      }
      return;
    }else{
      if(ttarget.type()==='Collection'){
        target = ttarget;
      }else{
        break;
      }
    }
    queryarry.shift();
  }
  if(target.communication){
    target.communication.usersend(this,'waitFor',queryarry,cb);
  }else{
    target.waitFor(queryarry,cb);
  }
};
User.prototype.bid = function(data,path,paramobj,cb) {
  this.perform('bid',data,path,1,'takeBid',paramobj,cb);
};
User.prototype.offer = function(data,path,paramobj,cb) {
  this.perform('offer',data,path,1,'takeOffer',paramobj,cb);
};

module.exports = User;
