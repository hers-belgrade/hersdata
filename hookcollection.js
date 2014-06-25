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
function __isExecutable(entity){
  var toe = typeof entity;
  if(toe==='function'){return true;}
  if(toe==='object' && entity instanceof Array && (entity.length===2 || entity.length===3)){
    var m = entity[0][entity[1]];
    if(typeof m !== 'function'){
      return false;
    }
    entity[1] = m;
    return true;
  }
  return false;
};
HookCollection.prototype.attach = function(cb){
  if(__isExecutable(cb)){
		this.inc();
    this.collection[this.counter]=cb;
    //console.log('attached',cb,'to',this.counter);
		return this.counter;
  }else{
    console.log(cb.toString(),'is not executable');
  }
};
HookCollection.prototype.detach = function(i){
  if(!this.collection){
    /*
    console.trace();
    console.log('no listeners when',i,'should be detached');
    process.exit(0);
    */
    return;
  }
	delete this.collection[i];
  if(this.isEmpty()){
    delete this.counter;
    delete this.collection;
  }
};
function __execute(exc,params){
  if(typeof exc === 'function'){
    exc.apply(null,params);
    return;
  }
  exc[1].apply(exc[0],exc[2] ? exc[2].concat(params) : params);
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
      __execute(fqn,pa);
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
