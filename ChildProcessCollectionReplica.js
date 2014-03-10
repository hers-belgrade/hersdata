var CollectionReplica = require('./CollectionReplica');
var ReplicatorChildProcessCommunication = require('./ReplicatorChildProcessCommunication').Child;

function ChildProcessCollectionReplica(realm,skipdcp){
  if(!realm){return;}
  this.communication = new ReplicatorChildProcessCommunication(this);
  CollectionReplica.call(this,realm,realm,skipdcp);
}
ChildProcessCollectionReplica.prototype = new CollectionReplica();
ChildProcessCollectionReplica.prototype.constructor = ChildProcessCollectionReplica;
ChildProcessCollectionReplica.prototype.destroy = function(){
  CollectionReplica.prototype.destroy.call(this);
  process.exit();
};

module.exports = ChildProcessCollectionReplica;
