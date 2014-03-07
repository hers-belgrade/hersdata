var CollectionReplica = require('./CollectionReplica');

function ChildProcessCollectionReplica(realm,skipdcp){
  if(!realm){return;}
  CollectionReplica.call(this,realm,realm,function(obj){
    try{
      process.send(obj);
    }catch(e){
      console.log('could not send',obj);
      console.log(e);
    }
  },skipdcp);
  process.on('message',(function(_t){
    var t = _t;
    return function(m){
      t.processInput(process,m);
    };
  })(this));
}
ChildProcessCollectionReplica.prototype = new CollectionReplica();
ChildProcessCollectionReplica.prototype.constructor = ChildProcessCollectionReplica;
ChildProcessCollectionReplica.prototype.destroy = function(){
  CollectionReplica.prototype.destroy.call(this);
  process.exit();
};

module.exports = ChildProcessCollectionReplica;
