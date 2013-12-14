var datamaster = require('./datamaster');

function DataMaster(){
  datamaster.Collection.call(this);
  this.attach('./system',{});
};
DataMaster.prototype = new (datamaster.Collection)();
DataMaster.prototype.constructor = DataMaster;

module.exports = {
  DataMaster:DataMaster,
  RemoteCollectionReplica:require('./RemoteCollectionReplica'),
  KeyRing:require('./keyring'),
  Follower:require('./follower'),
  FollowerPatterns:require('./followerpatterns'),
	helpers: require('./helpers')
};

