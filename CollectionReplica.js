var Collection = require('./Collection');

function CollectionReplica(name,realmname,skipdcp){
  if(!name){return;}
  skipdcp = true;
  this.replicaToken = {name:name,realmname:realmname,skipdcp:skipdcp};
  var t = this;
  function going_down(){
    if(t.downnotified){
      process.exit();
    }
    t.downnotified=true;
    t.send && t.send('replicaGoingDown');
    process.exit();
  };
  process.on('exit',going_down);
  process.on('SIGINT',going_down);
  process.on('SIGTERM',going_down);
  process.on('SIGQUIT',going_down);
  process.on('uncaughtException',function(err){
    if(err.stack){
      console.log(err.stack);
    }else{
      console.log(err);
    }
    going_down();
  });
  Collection.call(this);
};
CollectionReplica.prototype = Object.create(Collection.prototype,{constructor:{
  value:CollectionReplica,
  enumerable:false,
  writable:false,
  configurable:false
}});
CollectionReplica.prototype.send = function(){
  this.communication.send.apply(this.communication,arguments);
};
CollectionReplica.prototype.go = function(){
  //console.log(this,'should go');
  this.send('initRemoteReplica',this.replicaToken,this.dump());
};
CollectionReplica.prototype.commit = function(txnalias,txnprimitives){
  if(this.replicaToken.skipdcp){
    Collection.prototype.commit.call(this,txnalias,txnprimitives);
  }else{
    this.send('rpc','_commit',txnalias,txnprimitives);
  }
};
module.exports = CollectionReplica;
