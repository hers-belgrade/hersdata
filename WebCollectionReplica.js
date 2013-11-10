var ChildProcessCollectionReplica = require('./ChildProcessCollectionReplica');

function WebCollectionReplica(realmname){
  ChildProcessCollectionReplica.call(this,realmname);
  this.attach(__dirname+'/sessionuserfunctionality',{realmname:realmname});
};
WebCollectionReplica.prototype = new ChildProcessCollectionReplica();
WebCollectionReplica.prototype.constructor = WebCollectionReplica;

module.exports = WebCollectionReplica;
