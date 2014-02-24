var CollectionReplica = require('./CollectionReplica');
var net = require('net');
var replicator_communication = require('./replicatorcommunication');
var Timeout = require('herstimeout');

function RemoteCollectionReplica(name,realmname,url,skipdcp){
  if(!url){
    console.trace();
    throw "RemoteCollectionReplica ctor expects 3 params now";
  }
  console.log('new RemoteCollectionReplica',name,realmname,url);
  this.url = url;
  var communication = new replicator_communication(this);
  CollectionReplica.call(this,name,realmname,function(obj){
    communication.send(obj);
  },skipdcp);
  this.status = 'initialized';
  this.communication = communication;
};
RemoteCollectionReplica.prototype = new CollectionReplica();
RemoteCollectionReplica.prototype.constructor = RemoteCollectionReplica;
RemoteCollectionReplica.prototype.go = function(cb){
  cb && cb(this.status);
  var t = this;
  net.createConnection(this.url.port,this.url.address,function(){
    t.status = 'connected';
    cb && cb(t.status);
    t.communication.listenTo(this);
    var _cb = cb;
    this.on('close',function(){
      t.status = 'disconnected';
      _cb && _cb(t.status);
      Timeout.set(function(t,cb){cb && cb('reconnecting');t.go(cb);},1000,t,cb);
    });
    CollectionReplica.prototype.go.call(t);
  }).on('error',function(e){
    if(t.status === 'connected'){
      t.status = 'disconnected';
      cb && cb(t.status);
    };
    //console.log('socket error',arguments);
    Timeout.set(function(t,cb){cb && cb('reconnecting');t.go(cb);},1000,t,cb);
  });
};
RemoteCollectionReplica.prototype.destroy = function(){
  if(this.communication && this.communication.socket){
    this.communication.socket.destroy();
  }
  CollectionReplica.prototype.destroy.call(this);
};
module.exports = RemoteCollectionReplica;
