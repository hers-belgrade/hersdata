var datamaster = require('./datamaster');

function DataMaster(){
  datamaster.Collection.call(this);
  this.attach('./system',{});
};
DataMaster.prototype = new (datamaster.Collection)();

module.exports = {
  DataMaster:DataMaster,
	helpers: require('./helpers')
};

