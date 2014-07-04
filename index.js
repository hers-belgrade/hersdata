var Collection = require('./Collection'),
  SuperUser = require('./SuperUser'),
  HookCollection = require('./hookcollection');

function DataMaster(){
  Collection.call(this);
  this.superUserCreated = new HookCollection();
};
DataMaster.prototype = Object.create(Collection.prototype,{constructor:{
  value:DataMaster,
  enumerable:false,
  writable:false,
  configurable:false
}})
DataMaster.prototype.createSuperUser = function(username,realmname){
  if(this.superUser){return;}
  this.superUser = new SuperUser(this,function () {}, function(){},username,realmname);
  this.superUserCreated.fire();
};
DataMaster.prototype.getSuperUser = function(cb){
  if(this.superUser){
    cb(this.superUser);
    return;
  }
  var t = this;
  var suw = this.superUserCreated.attach(function(){
    t.superUserCreated.detach(suw);
    cb(t.superUser);
  });
};

module.exports = {
  DataMaster:DataMaster,
  RemoteCollectionReplica:require('./RemoteCollectionReplica'),
  BigCounter:require('./BigCounter'),
	helpers: require('./helpers'),
  executable: require('./executable'),
  ArrayMap: require('./ArrayMap'),
  HookCollection: HookCollection,
  Listener: require('./Listener'),
  UserEngagement: require('./UserEngagement'),
  SessionUser: require('./SessionUser'),
  DataUser: require('./DataUser'),
  DataFollower: require('./DataFollower'),
  DeStreamer: require('./DeStreamer'),
  Broadcaster: require('./Broadcaster'),
  AutoBroadcaster: require('./AutoBroadcaster'),
  BroadcasterGroup: require('./BroadcasterGroup'),
  BroadcastingChannel: require('./BroadcastingChannel'),
  HTTPTalker: require('./HTTPTalker')
};

