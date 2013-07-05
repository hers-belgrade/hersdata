function DataHive(){
  this.master = new (require('./datamaster').Collection)();
}
