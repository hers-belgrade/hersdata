var datamaster = require('./datamaster');

function DataMaster(){
  datamaster.Collection.call(this);
};
DataMaster.prototype = new (datamaster.Collection)();
DataMaster.prototype.constructor = DataMaster;

module.exports = {
  DataMaster:DataMaster,
  UserBase : require('./userbase'),
  RemoteCollectionReplica:require('./RemoteCollectionReplica'),
  BigCounter:require('./BigCounter'),
	helpers: require('./helpers'),
  HookCollection: require('./hookcollection'),
  Listener: require('./listener'),
  Bridge: require('./bridge')
};

