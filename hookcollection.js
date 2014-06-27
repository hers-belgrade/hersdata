var ArrayMap = require('./ArrayMap'),
  executable = require('./executable');

function HookCollection(){
};
HookCollection.prototype.empty = function(){
  return this.collection && this.collection.isEmpty();
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
  if(executable.isA(cb)){
    if(!this.collection){
      this.collection = new ArrayMap();
    }
		return this.collection.add(cb);
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
  this.collection.remove(i);
  if(this.collection.isEmpty()){
    delete this.collection;
  }
};
HookCollection.prototype.fire = function(){
  if(!this.collection){return;}
  this.collection.traverse([this,this.fireSingle,[Array.prototype.slice.call(arguments)]]);
};
HookCollection.prototype.fireSingle = function(params,fqn,index){
  try{
    //console.log('calling',fqn,'on',index,'with',pa);
    executable.apply(fqn,params);
  }
  catch(e){
    this.collection.remove(index);
    console.log(e);
    console.log(e.stack);
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
  delete this.collection;
}

module.exports = HookCollection;
