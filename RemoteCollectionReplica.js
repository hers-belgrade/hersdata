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
RemoteCollectionReplica.prototype.go = function(){
  var t = this;
  net.createConnection(this.url.port,this.url.address,function(){
    t.communication.listenTo(this);
    this.on('close',function(){
      t.commands.clear();
    });
    CollectionReplica.prototype.go.call(t);
  }).on('error',function(){
    var _t = t;
    setTimeout(function(){_t.go();},1000);
  });
};
module.exports = RemoteCollectionReplica;
