function Txner(data){
  this.data = data;
};
Txner.prototype.start = function(name){
  if(this.q){
    if(!this.name){
      console.trace();
      console.log('no name to commit txn');
      process.exit(0);
    }
    if(this.q.length){
      //console.log('commiting',this.name,this.q);
      this.data.commit(this.name,this.q);
    }
  }
  this.name = name;
  this.q = [];
};
Txner.prototype.add = function(txnp){
  this.q.push(txnp);
};
Txner.prototype.commit = function(){
  if(!(this.name&&this.q)){
    console.trace();
    console.log('no name/queue to commit txn');
    process.exit(0);
  }
  if(this.q.length){
    //console.log('commiting',this.name,this.q);
    this.data.commit(this.name,this.q);
  }
  delete this.name;
  delete this.q;
};
Txner.prototype.destroy = function(){
  for(var i in this){
    delete this[i];
  }
};

module.exports = Txner;
