var net = require('net');

var errors = {
};

function send(socket,txnalias,txnprimitives,datacopytxnprimitives,txnCounter){
  var objstr = JSON.stringify(Array.prototype.slice.call(arguments,1));
  var objlen = new Buffer(4);
  objlen.writeUInt32LE(objstr.length,0);
  socket.write(objlen);
  socket.write(objstr);
};

function init(){
  console.log('replicator init',this.self);
  var port = this.self.port;
  if(!port){
    throw "No port specified ";
  }
  var sockmap = {};
  var data = this.data;
  var server = net.createServer(function(c){
    var rp = c.remotePort;
    sockmap[rp] = c;
    var dd = data.dump();
    dd.unshift(c);
    send.apply(null,dd);
    c.on('error',function(){
      delete sockmap[rp];
    });
    c.on('end',function(){
      delete sockmap[rp];
    });
  });
  server.listen(port);
  this.data.onNewTransaction.attach((function(_t){
    var t = _t;
    return function(path,txnalias,txnprimitives,datacopytxnprimitives,txnCounter){
      for(var i in sockmap){
        send(sockmap[i],txnalias,txnprimitives,datacopytxnprimitives,txnCounter);
      }
    };
  })(this));
};

module.exports = {
  errors:errors,
  init:init
};
