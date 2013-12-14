var CollectionReplica = require('./CollectionReplica');
var net = require('net');
var replicator_communication = require('./replicatorcommunication');

function QueueProcessor(){
  var q = [],job;
  this.head =  function(){
    if(job){return job;}
    if(!q.length){return;}
    job = q.shift();
    return job;
  };
  this.busy = function(){
    return typeof job !== 'undefined';
  };
  this.undoJob = function(){
    q.unshift(job);
    job = undefined;
  };
  this.jobDone = function(){
    job = undefined;
  };
  this.push = function(newjob){
    q.push(newjob);
  };
  this.clear = function(){
    q = [];
    job = undefined;
  };
};

function RemoteCollectionReplica(name,url){
  console.log('new RemoteCollectionReplica',name,url);
  this.url = url;
  var communication = new replicator_communication(this);
  this.commands = new QueueProcessor();
  CollectionReplica.call(this,name,function(obj){
    communication.send(obj);
  });
  this.communication = communication;
};
RemoteCollectionReplica.prototype = new CollectionReplica();
RemoteCollectionReplica.prototype.constructor = RemoteCollectionReplica;
RemoteCollectionReplica.prototype.go = function(cb){
  var t = this;
  net.createConnection(this.url.port,this.url.address,function(){
    cb && cb('connected');
    t.communication.listenTo(this);
    var _cb = cb;
    this.on('close',function(){
      _cb && _cb('disconnected');
      t.commands.clear();
    });
    CollectionReplica.prototype.go.call(t);
  }).on('error',function(){
    var _t = t,_cb = cb;
    cb && cb('disconnected');
    setTimeout(function(){_cb && _cb('reconnecting');_t.go();},1000);
  });
};
module.exports = RemoteCollectionReplica;
