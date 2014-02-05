var Collection = require('./datamaster').Collection;
var BigCounter = require('./BigCounter');

function CollectionReplica(name,realmname,sendcb){
  if(name && !sendcb){
    console.trace();
    throw "CollectionReplica ctor expects 3 params now";
  }
  if(!(name&&sendcb)){return;}
  this.counter = new BigCounter();
  this.replicaToken = {name:name,realmname:realmname};
  this.cbs = {};
  this.send = function(code){
    var params = this.prepareCallParams(Array.prototype.slice.call(arguments,1));
    var sendobj = {};
    sendobj[code]=params;
    sendcb(sendobj);
  };
  var t = this;
  function going_down(){
    if(t.downnotified){
      process.exit();
    }
    t.downnotified=true;
    t.send('internal','going_down');
    process.exit();
  };
  process.on('exit',going_down);
  process.on('SIGINT',going_down);
  process.on('SIGTERM',going_down);
  process.on('SIGQUIT',going_down);
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
  this.send('internal','need_init',this.replicaToken,this.dump());
};
CollectionReplica.prototype.commit = function(txnalias,txnprimitives){
  Collection.prototype.commit.call(this,txnalias,txnprimitives);
  this.send('rpc','_commit',txnalias,txnprimitives);
};
CollectionReplica.prototype.invoke = function(path,paramobj,username,realmname,roles,cb) {
  var t = this;
  if(path.join){
    path = path.join('/');
  }
  this.setUser(username,realmname,roles,function(){
    t.send('rpc','invoke',path,paramobj,username,realmname,roles,cb);
  });
};
CollectionReplica.prototype.handleUserDestruction = function(u){
  Collection.prototype.handleUserDestruction.call(this,u);
  this.send('rpc','removeUser',u.username,u.realmname);
};
module.exports = CollectionReplica;
