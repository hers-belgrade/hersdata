function BigCounter(other){
  if (typeof other !== 'undefined' && typeof other.counters !== 'undefined'){
    this.counters =  other.counters.slice()
  }else{
    this.reset();
  }
}
BigCounter.prototype.inc = function(){
  var cnts = this.counters;
  var level = cnts.length-1;
  function inc(){
    if(level<0){
      throw "counter overflow";
    }
    cnts[level]++;
    if(cnts[level]>999999999){
      cnts[level] = 0;
      level--;
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
BigCounter.prototype.toSortableString = function(){
  var ss = '';
  for(var i in this.counters){
    if(ss.length){ss+='.';}
    ss += ('00000000'+this.counters[i]).substr(-9);
  }
  return ss;
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
BigCounter.fromSortableString = function(ss){
  var cnts = ss.split('.');
  var ret = new BigCounter();
  if(cnts.length!==4){
    return ret;
  }
  for(var i in cnts){
    var n = cnts[i];
    while(n.charAt(0)==='0'){
      if(n.length===1){
        break;
      }
      n = n.substr(1);
    }
    n = parseInt(n);
    if(isNaN(n)){
      return ret;
    }
    cnts[i] = n;
  }
  ret.counters = cnts;
  return ret;
};

module.exports = BigCounter;
