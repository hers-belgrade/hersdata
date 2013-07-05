function DataHive(){
  this.master = new (require('./datamaster').Collection)();
}
DataHive.prototype.attach = function attach(objorname,config){
  return this.master.attach(objorname,config);
};

module.exports = DataHive;
