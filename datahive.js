function DataHive(){
  this.master = new (require('./datamaster').Collection)();
  this.master.onNewTransaction.attach(function(path,txnalias,txnoperations){
    console.log(path,txnalias,txnoperations);
  });
}
DataHive.prototype.attach = function attach(objorname,config){
  return this.master.attach(objorname,config);
};

module.exports = DataHive;
