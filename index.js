var datamaster = require('./datamaster'),
  SuperUser = require('./SuperUser'),
  HookCollection = require('./hookcollection');

function DataMaster(){
  datamaster.Collection.call(this);
  this.superUserCreated = new HookCollection();
};
DataMaster.prototype = new (datamaster.Collection)();
DataMaster.prototype.constructor = DataMaster;
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
  UserBase : require('./userbase'),
  RemoteCollectionReplica:require('./RemoteCollectionReplica'),
  BigCounter:require('./BigCounter'),
	helpers: require('./helpers'),
  HookCollection: HookCollection,
  Listener: require('./listener'),
  Bridge: require('./bridge'),
  SessionUser: require('./SessionUser'),
  DataUser: require('./DataUser'),
  DataFollower: require('./DataFollower'),
  Broadcaster: require('./Broadcaster'),
  BroadcasterGroup: require('./BroadcasterGroup'),
  BroadcastingChannel: require('./BroadcastingChannel')
};

