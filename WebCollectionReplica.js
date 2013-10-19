var ChildProcessCollectionReplica = require('./ChildProcessCollectionReplica');
var ConsumerLobby = require('./consumers');

function WebCollectionReplica(realmname){
  ChildProcessCollectionReplica.call(this,realmname);
  this.lobby = new ConsumerLobby(this); 
};
WebCollectionReplica.prototype = new ChildProcessCollectionReplica();
WebCollectionReplica.prototype.constructor = WebCollectionReplica;
WebCollectionReplica.prototype.dumpQueue = function(params){
  var cb = params.cb;
  if(typeof cb !=='function'){return;}
  var ic = this.lobby.identityAndConsumerFor(params);
  if(ic){
    ic[1].dumpqueue(cb);
  }else{
    cb();
  }
};
WebCollectionReplica.prototype.invoke = function(params,cb){
  var ic = this.lobby.identityAndConsumerFor(params);
  if(!ic){
    return cb('NO_USER');
  }
  return ChildProcessCollectionReplica.prototype.invoke.call(this,params.path,params.params,ic[0].name,'',cb);
};
WebCollectionReplica.prototype.setUser = function(username,realmname,cb){
  var ic = this.lobby.identityAndConsumerFor({name:username});
  if(ic){
    cb(ic[0]);
  }else{
    cb();
  }
};
WebCollectionReplica.prototype.findUser = function(username,realmname,cb){
  var ic = this.lobby.identityAndConsumerFor({name:username});
  if(ic){
    cb(ic[0]);
  }
};
WebCollectionReplica.prototype.removeUser = function(data){
  console.log('removeUser',data);
};

module.exports = WebCollectionReplica;
