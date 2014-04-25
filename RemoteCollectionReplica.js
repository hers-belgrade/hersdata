var CollectionReplica = require('./CollectionReplica');
var net = require('net');
var ReplicatorSocketCommunication = require('./ReplicatorSocketCommunication');
var Timeout = require('herstimeout');

function RemoteCollectionReplica(name,realmname,url,skipdcp){
  if(!url){
    console.trace();
    throw "RemoteCollectionReplica ctor expects 3 params now";
  }
  console.log('new RemoteCollectionReplica',name,realmname,url);
  this.url = url;
  this.communication = new ReplicatorSocketCommunication(this);
  CollectionReplica.call(this,name,realmname,skipdcp);
  this.status = 'initialized';
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
    CollectionReplica.prototype.go.call(t);
  }).on('error',function(e){
    t.communication.purge();
    console.log('socket error on',t.url.address,':',t.url.port,e);
    if(t.status === 'connected'){
      t.status = 'disconnected';
      cb && cb(t.status);
    };
    Timeout.set(function(t,cb){cb && cb('reconnecting');t.go(cb);},1000,t,cb);
  }).on('close',function(){
    t.communication.purge();
    console.log('socket closed on',t.url);
    t.status = 'disconnected';
    cb && cb(t.status);
    Timeout.set(function(t,cb){cb && cb('reconnecting');t.go(cb);},1000,t,cb);
  });
};
RemoteCollectionReplica.prototype.destroy = function(){
  console.trace();
  console.log('RemoteCollectionReplica destroyed');
  if(this.communication && this.communication.socket){
    this.communication.socket.destroy();
  }
  CollectionReplica.prototype.destroy.call(this);
};
module.exports = RemoteCollectionReplica;
