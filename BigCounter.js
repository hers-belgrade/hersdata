function BigCounter(other){
  if (typeof other !== 'undefined' && typeof other.counters !== 'undefined'){
    this.counters =  other.counters.slice()
  }else{
    this.reset();
  }
}
BigCounter.prototype.inc = function(){
  var level = 0;
  var cnts = this.counters;
  function inc(){
    if(level>=cnts.length){
      throw "counter overflow";
    }
    cnts[level]++;
    if(cnts[level]>1000000000){
      cnts[level] = 0;
      level++;
      inc();
    }
  }
  inc();
};
BigCounter.prototype.value = function(){
  return this.counters.slice();
};
BigCounter.prototype.toString = function(){
  return this.counters.join('.');
};
BigCounter.prototype.isPredecessorOf = function(other){
  var temp = new BigCounter(this);
  temp.inc();
  return temp.equals(other);
};
BigCounter.prototype.equals = function(other){
  for(var i = 0; i<this.counters.length; i++){
    if(this.counters[i]!==other.counters[i]){
      return false;
    }
  }
  return true;
};
BigCounter.prototype.clone = function(){
  return new BigCounter(this);
};
BigCounter.prototype.reset = function(){
  this.counters = [0,0,0,0];
};

module.exports = BigCounter;
