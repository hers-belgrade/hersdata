var datamaster = require('./datamaster');

function DataMaster(){
  datamaster.Collection.call(this);
  this.realms = {};
};
DataMaster.prototype = new (datamaster.Collection)();
DataMaster.prototype.constructor = DataMaster;

module.exports = {
  DataMaster:DataMaster,
  RemoteCollectionReplica:require('./RemoteCollectionReplica'),
  BigCounter:require('./BigCounter'),
	helpers: require('./helpers'),
  HookCollection: require('./hookcollection'),
  Listener: require('./listener'),
  Bridge: require('./bridge')
};

