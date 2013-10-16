var net = require('net');
var replicator_communication = require('./replicatorcommunication');
var BigCounter = require('./BigCounter');

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

function ReplicatorClient(dataelement){
  this.data = dataelement;
  this.counter = new BigCounter();
  var t = this;
  this.communication = new replicator_communication(function(input){t.processInput(input);});
  this.commands = new QueueProcessor();
};
ReplicatorClient.prototype.go = function(url){
  var t = this;
  net.createConnection(url.port,url.address,function(){
    t.communication.listenTo(this);
    this.on('close',function(){
      t.commands.clear();
    });
  }).on('error',function(){
    var _t = t, _url=url;
    setTimeout(function(){_t.go(_url);},1000);
  });
};
ReplicatorClient.prototype.processInput = function(input){
  var dcp = input.dcp;
  if(dcp){
    this.data.commit(dcp[0],dcp[1]);
  }
};
ReplicatorClient.prototype.do_command = function(command,paramobj,cb){
  this.commands.push([command,paramobj,cb]);
  this.processcommand();
};
ReplicatorClient.prototype.processcommand = function(){
  if(!this.communication.socket){
    return;
  }
  if(this.commands.busy()){
    return;
  }
  var job = this.commands.head();
  if(job.cb){
    this.counter++;
    var cs = this.counter.toString();
    this.cbs[cs] = job.cb;
    job.cb = cs;
  }
  this.communication.tell({command:job});
};

module.exports = ReplicatorClient;
