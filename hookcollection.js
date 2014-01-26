function HookCollection(){
};
HookCollection.prototype.empty = function(){
	var c = 0;
	for(var n in this.collection){
		return false;
	}
  return true;
};
HookCollection.prototype._inc = function(){
  this.counter++;
  if(this.counter>10000000){
    this.counter=1;
  }
};
HookCollection.prototype.inc = function(){
  if(!this.collection){
    this.collection = {};
    this.counter = 0;
  }
	this._inc();
	while(this.counter in this.collection){
		this._inc();
	}
};
HookCollection.prototype.isEmpty = function(){
  if(!this.collection){
    return true;
  }
  for(var i in this.collection){
    return false;
  }
  return true;
};
HookCollection.prototype.attach = function(cb){
  if(typeof cb === 'function'){
		this.inc();
    this.collection[this.counter]=cb;
    //console.log('attached',cb,'to',this.counter);
		return this.counter;
  }
};
HookCollection.prototype.detach = function(i){
  if(!this.collection){
    return;
  }
	delete this.collection[i];
  if(this.isEmpty()){
    delete this.counter;
    delete this.collection;
  }
};
HookCollection.prototype.fire = function(){
  var c = this.collection;
  var fordel=[];
  var pa = Array.prototype.slice.call(arguments);
  //console.log('firing on',c);
  for(var i in c){
    try{
      var fqn = c[i];
      //console.log('calling',fqn,'on',i,'with',pa);
      fqn.apply(null,pa);
    }
    catch(e){
      console.log(e);
      console.log(e.stack);
      fordel.unshift(i);
    }
  }
  var fdl = fordel.length;
  for(var i=0; i<fdl; i++){
		delete c[fordel[i]];
  }
};
/* controversial
HookCollection.prototype.fireAndForget = function(){
  var c = this.collection;
  var pa = Array.prototype.slice.call(arguments);
  for(var i in c){
    try{
      c[i].apply(null,pa);
    }
    catch(e){
      console.log(e);
      console.log(e.stack);
    }
  }
	this.collection = {};
}
*/
HookCollection.prototype.destruct = function(){
  if(this.collection){
    for(var i in this.collection){
      delete this.collection[i];
    }
    delete this.collection;
    delete this.counter;
  }
}

module.exports = HookCollection;
