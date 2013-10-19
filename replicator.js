var net = require('net');
var ReplicatorCommunication = require('./replicatorcommunication');

var errors = {
  NO_FUNCTIONALITY: {message: 'No functionality'},
  ACCESS_FORBIDDEN: {message: 'Access violation'}
};

function ReplicatorServerCommunication(inputcb){
  ReplicatorCommunication.call(this,inputcb);
};
ReplicatorServerCommunication.prototype = new ReplicatorCommunication;
ReplicatorServerCommunication.prototype.sendDCP = function(txnalias,txnprimitives,datacopytxnprimitives,txnCounter){
  this.tell({dcp:[txnalias,txnprimitives,txnCounter]});
};

function init(){
  //console.log('replicator init',this.self);
  var port = this.self.port;
  if(!port){
    throw "No port specified ";
  }
  var commmap = {};
  var data = this.data;
  var processInput = function(input){
    if(input.command){
      console.log('command!',input);
    }
  };
  var server = net.createServer(function(c){
    var rp = c.remotePort;
    var rsc = new ReplicatorServerCommunication(processInput);
    rsc.listenTo(c);
    commmap[rp] = rsc;
    rsc.sendDCP.apply(rsc,data.dump());
    c.on('error',function(){
      delete commmap[rp];
    });
    c.on('end',function(){
      delete commmap[rp];
    });
  });
  server.listen(port);
  this.data.onNewTransaction.attach((function(_t){
    var t = _t;
    return function(path,txnalias,txnprimitives,datacopytxnprimitives,txnCounter){
      for(var i in commmap){
        commmap[i].sendDCP(txnalias,txnprimitives,datacopytxnprimitives,txnCounter);
      }
    };
  })(this));
};

module.exports = {
  errors:errors,
  init:init
};
