var CollectionReplica = require('./CollectionReplica');

function ChildProcessCollectionReplica(realm){
  if(!realm){return;}
  CollectionReplica.call(this,realm,function(obj){
    try{
      process.send(obj);
    }catch(e){
      console.log('could not send',obj);
      console.log(e);
    }
  });
  process.on('message',(function(_t){
    var t = _t;
    return function(m){
      //console.log(m);
      setTimeout(function(){t.processInput(process,m);},5);
    };
  })(this));
  this.go();
}
ChildProcessCollectionReplica.prototype = new CollectionReplica();
ChildProcessCollectionReplica.prototype.constructor = ChildProcessCollectionReplica;

module.exports = ChildProcessCollectionReplica;
