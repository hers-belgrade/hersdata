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
  CollectionReplica.call(this,name,realmname,skipdcp);
  this.communication = new ReplicatorSocketCommunication(this);
  this.status = 'initialized';
};
RemoteCollectionReplica.prototype = new CollectionReplica();
RemoteCollectionReplica.prototype.constructor = RemoteCollectionReplica;
RemoteCollectionReplica.prototype.go = function(cb){
  if(this.status === 'connected'){
    return;
  }
  cb && cb(this.status);
  var t = this;

  net.createConnection(this.url.port,this.url.address,function(){
    t.status = 'connected';
    cb && cb(t.status);
    console.log(Object.keys(t.communication.cbs).length,'cbs to handle');
    t.communication.listenTo(this);
    console.log('reconnecting');
    CollectionReplica.prototype.go.call(t);
  }).on('error', function () {
    ///due to stupidity of error handler ...
  }).on('close',function(err){
    if(t.status === 'connected'){
      t.communication.purge();
    }
    console.log('socket closed on',t.url, err);
    t.status = 'disconnected';
    cb && cb(t.status);
    Timeout.set(function(t,cb){cb && cb('reconnecting');t.go(cb);},1000,t,cb);
  });
};
RemoteCollectionReplica.prototype.destroy = function(){
  console.log('RemoteCollectionReplica destroyed');
  if(this.communication && this.communication.socket){
    this.communication.socket.destroy();
  }
  CollectionReplica.prototype.destroy.call(this);
};
module.exports = RemoteCollectionReplica;
