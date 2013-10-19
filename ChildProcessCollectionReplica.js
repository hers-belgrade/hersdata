var CollectionReplica = require('./CollectionReplica');

function ChildProcessCollectionReplica(realm){
  if(!realm){return;}
  CollectionReplica.call(this,realm,function(obj){
    process.send(obj);
  });
  process.on('message',(function(_t){
    var t = _t;
    return function(m){
      t.processInput(process,m);
    };
  })(this));
}
ChildProcessCollectionReplica.prototype = new CollectionReplica();
ChildProcessCollectionReplica.prototype.constructor = ChildProcessCollectionReplica;

module.exports = ChildProcessCollectionReplica;
