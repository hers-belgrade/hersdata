function HookCollection(){
};
HookCollection.prototype.empty = function(){
	var c = 0;
	for(var n in this.collection){
		return false;
	}
  return true;
};
HookCollection.prototype.attach = function(cb){
  if(typeof cb === 'function'){
    if(!this.cbs){
      this.cbs = [cb];
      return 0;
    }
    var cursor = 0;
    while(true){
      if(cursor===this.cbs.length){
        this.cbs.push(cb);
        return cursor;
      }
      if(!this.cbs[cursor]){
        this.cbs[cursor] = cb;
        return cursor;
      }
      cursor++;
    }
  }else{
    console.log(cb.toString(),'is not a function');
  }
};
HookCollection.prototype.detach = function(i){
  if(!this.cbs){
    console.trace();
    console.log('no listeners when',i,'should be detached');
    process.exit(0);
    return;
  }
  if(!this.cbs[i]){
    console.trace();
    console.log('cannot detach a detached callback');
  }
  this.cbs[i] = null;
};
HookCollection.prototype.fire = function(){
  var cbs = this.cbs;
  var fordel=[];
  //console.log('firing on',c);
  for(var i in cbs){
    try{
      var fqn = cbs[i];
      if(fqn){
        fqn.apply(null,arguments);
      }
    }
    catch(e){
      cbs[i] = null;
      console.log(e);
      console.log(e.stack);
    }
  }
};
HookCollection.prototype.destruct = function(){
  delete this.cbs;
}

module.exports = HookCollection;
