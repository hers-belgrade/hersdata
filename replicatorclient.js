var net = require('net');
var replicator_communication = require('./replicatorcommunication');

function ReplicatorClient(dataelement){
  this.data = dataelement;
  var t = this;
  this.communication = new replicator_communication(function(input){t.processInput(input);});
};
ReplicatorClient.prototype.go = function(url){
  var t = this;
  net.createConnection(url.port,url.address,function(){
    t.communication.listenTo(this);
  }).on('error',function(){
    var _t = t, _url=url;
    setTimeout(function(){_t.go(_url);},1000);
  });
};
ReplicatorClient.prototype.processInput = function(input){
  var dcp = this.dataRead.dcp;
  if(dcp){
    this.data.commit(dcp[0],dcp[1]);
  }
};

module.exports = ReplicatorClient;
