var Collection = require('./datamaster').Collection;
var BigCounter = require('./BigCounter');

function CollectionReplica(realmname,sendcb){
  if(!(realmname&&sendcb)){return;}
  this.counter = new BigCounter();
  this.realmname = realmname;
  this.cbs = {};
  this.send = function(code){
    var params = this.prepareCallParams(Array.prototype.slice.call(arguments,1));
    var sendobj = {};
    sendobj[code]=params;
    sendcb(sendobj);
  };
  Collection.call(this);
};
CollectionReplica.prototype = new Collection();
CollectionReplica.prototype.constructor = CollectionReplica;
CollectionReplica.prototype.prepareCallParams = function(ca){
  var cb = ca.pop();
  var tocb = typeof cb;
  if(tocb === 'function'){
    this.counter.inc();
    var cts = this.counter.toString();
    var cs = '#FunctionRef:'+cts;
    this.cbs[cts] = cb;
    ca.push(cs);
  }else{
    if(tocb !== 'undefined'){
      ca.push(cb);
    }
  }
  return ca;
};
CollectionReplica.prototype.go = function(){
  //console.log(this,'should go');
  this.send('internal','need_init',this.realmname);
};
CollectionReplica.prototype.commit = function(txnalias,txnprimitives){
  Collection.prototype.commit.call(this,txnalias,txnprimitives);
  this.send('rpc','_commit',txnalias,txnprimitives);
};
CollectionReplica.prototype.invoke = function(path,paramobj,username,roles,cb) {
  //controversial solution
  this.setUser(username,this.realmname,roles,function(){});
  this.send('rpc','invoke',path,paramobj,username,this.realmname,roles,cb);
};

module.exports = CollectionReplica;
