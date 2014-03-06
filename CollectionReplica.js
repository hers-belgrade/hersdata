var Collection = require('./datamaster').Collection;
var BigCounter = require('./BigCounter');

function CollectionReplica(name,realmname,sendcb,skipdcp){
  if(!(name&&sendcb)){return;}
  this.counter = new BigCounter();
  this.replicaToken = {name:name,realmname:realmname,skipdcp:skipdcp};
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
CollectionReplica.prototype.prepareCallParams = function(ca,persist){
  var cb = ca.pop();
  if(cb==='__persistmycb'){
    return this.prepareCallParams(ca,true);
  }
  var tocb = typeof cb;
  if(tocb === 'function'){
    this.counter.inc();
    var cts = this.counter.toString();
    var cs = '#FunctionRef:'+cts;
    this.cbs[cts] = cb;
    if(persist){
      if(!this.persist){
        this.persist = {};
      }
      this.persist[cts] = 1;
    }
    ca.push(cs);
  }else{
    if(tocb !== 'undefined'){
      ca.push(cb);
    }
  }
  this.counter.inc();
  ca.unshift(this.counter);
  return ca;
};
CollectionReplica.prototype.go = function(){
  //console.log(this,'should go');
  this.send('internal','need_init',this.replicaToken,this.dump());
};
CollectionReplica.prototype.commit = function(txnalias,txnprimitives){
  if(this.replicaToken.skipdcp){
    Collection.prototype.commit.call(this,txnalias,txnprimitives);
  }else{
    this.send('rpc','_commit',txnalias,txnprimitives);
  }
};
CollectionReplica.prototype.invoke = function(path,paramobj,username,realmname,roles,cb) {
  if(path.join){
    path = path.join('/');
  }
  this.send('rpc','invoke',path,paramobj,username,realmname,roles,cb);
};
CollectionReplica.prototype.handleUserDestruction = function(u){
  Collection.prototype.handleUserDestruction.call(this,u);
  this.send('rpc','removeUser',u.username,u.realmname);
};
CollectionReplica.prototype.waitFor = function(querypath,cb,waiter,startindex){
  startindex = startindex||0;
  var ret = {
  }
  this.send('rpc','waitFor',querypath.splice(startindex),function(){
    cb.apply(ret,arguments);
  },'__persistmycb');
  var self = this;
  var c = this.counter.toString();
  ret.destroy = function () { self.send('internal', 'remoteDestroy', c); }
  return ret;
};
module.exports = CollectionReplica;
