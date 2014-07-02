var ArrayMap = require('./ArrayMap'),
  executable = require('./executable'),
  isExecutable = executable.isA,
  execRun = executable.run,
  execCall = executable.call,
  execApply = executable.apply;

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
  if(isExecutable(cb)){
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
  var params = Array.prototype.slice.call(arguments);
  switch(params.length){
    case 0:
      this.collection.traverse([this,this.fireSingle]);
      break;
    case 1:
      this.collection.traverse([this,this.fireSingleParam,[params[0]]]);
      break;
    default:
      this.collection.traverse([this,this.fireSingleArray,[params]]);
      break;
  }
};
HookCollection.prototype.fireSingle = function(fqn,index){
  try{
    //console.log('calling',fqn,'on',index,'with',pa);
    fqn && execRun(fqn);
  }
  catch(e){
    console.log(e);
    console.log(e.stack);
    console.log(this,'got an error in traversing');
    this.collection && this.collection.remove(index);
  }
};
HookCollection.prototype.fireSingleParam = function(param,fqn,index){
  try{
    //console.log('calling',fqn,'on',index,'with',pa);
    fqn && execCall(fqn,param);
  }
  catch(e){
    console.log(e);
    console.log(e.stack);
    console.log(this,'got an error in traversing');
    this.collection && this.collection.remove(index);
  }
};
HookCollection.prototype.fireSingleArray = function(params,fqn,index){
  try{
    //console.log('calling',fqn,'on',index,'with',pa);
    fqn && execApply(fqn,params);
  }
  catch(e){
    console.log(e);
    console.log(e.stack);
    console.log(this,'got an error in traversing');
    this.collection && this.collection.remove(index);
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
