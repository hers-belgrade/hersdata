var ChildProcessCollectionReplica = require('./ChildProcessCollectionReplica');

function WebCollectionReplica(realmname,skipdcp){
  ChildProcessCollectionReplica.call(this,realmname,skipdcp);
  //this.attach(__dirname+'/sessionuserfunctionality',{realmname:realmname});
};
WebCollectionReplica.prototype = new ChildProcessCollectionReplica();
WebCollectionReplica.prototype.constructor = WebCollectionReplica;

module.exports = WebCollectionReplica;
