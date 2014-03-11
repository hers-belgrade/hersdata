var HookCollection = require('./hookcollection');

function KeyRing(username,realmname,roles){
  if(typeof username !== 'string'){
    console.trace();
    console.log('backwards compatibility problem?');
    process.exit(0);
  }
  this.keys = {};
  this.newKey = new HookCollection();
  this.keyRemoved = new HookCollection();
  this.destroyed = new HookCollection();
	this.roles = roles;
	this.username = username;
	this.realmname = realmname;
  if(roles){
    this.addKeys(roles.split(','));
  }
};
KeyRing.prototype.invoke = function(data,path,paramobj,cb) {
  console.log('invoke',data,path,paramobj);
  function exit(code,params,message){
    if(cb){
      cb(code,params,message);
    }else{
      console.log('invoke exited with',code,'for',path,paramobj);
    }
  }
  if(typeof path === 'string'){
    if(!path){return exit('NO_FUNCTIONALITY');}
    if(path.charAt(0)==='/'){
      path = path.substring(1);
    }
    path = path.split('/');
  }
  if(!path.length){return exit('NO_FUNCTIONALITY');}
  if(path.length>2){
    var targetpath = path.splice(0,1);
    var target = data.element(targetpath);
    if(!target){
      return exit('NO_TARGET',targetpath,'Path not found to invoke functionality');
    }else{
      return target.invoke(path,paramobj,username,realmname,roles,cb);
    }
  }
  var methodname = path[path.length-1];
  var functionalityname = path[path.length-2];
  //console.log(methodname);
	if (methodname.charAt(0) === '_' && username!=='*'){return exit('ACCESS_FORBIDDEN',[methodname],'You are not allowed to invoke '+methodname);}
  if (username==='*'){
    if(data.replicatingClients && typeof data.replicatingClients[realmname] !== 'undefined'){
      username = realmname;
      realmname = '_dcp_';
    }else{
      return exit('ACCESS_FORBIDDEN',[realmname],'User * may come only from a replica');
    }
  }
  var f = data.functionalities && data.functionalities[functionalityname];
  if(f){
    var key = f.key;
    if((typeof key !== 'undefined')&&(!u.contains(key))){
      return exit('ACCESS_FORBIDDEN',[key],'Functionality '+functionalityname+' is locked by '+key+' which you do not have');
    }
    f = f.f;
    var m = f[methodname];
    if(typeof m === 'function'){
      //console.log('invoking',path,paramobj,username,realmname,roles);
      //console.log('invoking',methodname,'for',username,'@',realmname,cb); 
      m(paramobj,cb,this);
    }else{
      return exit('NO_METHOD',[methodname,functionalityname],'Method '+methodname+' not found on '+functionalityname);
    }
  }else{
    console.trace();
    console.log(functionalityname,'is not a functionalityname while processing',path);
    return exit('NO_FUNCTIONALITY',[functionalityname],'Functionality '+functionalityname+' does not exist here');
  }
};
KeyRing.prototype.invoke1 = function (data, request, paramobj, cb) {
  if(typeof data === 'string'){
    console.trace();
    console.log('backwards compatibility problem?');
    process.exit(0);
  }
	data && data.invoke(request, paramobj,this.username, this.realmname, this.roles, cb);
}
KeyRing.prototype.containsKeyRing = function(keyring){
  for(var k in keyring.keys){
    if(typeof this.keys[k] === 'undefined'){
      return false;
    }
  }
  return true;
};
KeyRing.prototype.contains = function(key){
  return typeof key ==='undefined' || this.keys[key];
};
KeyRing.prototype.addKey = function(key){
  if(typeof this.keys[key] === 'undefined'){
    this.keys[key] = 1;
    this.newKey.fire(key);
    return true;
  }else{
    this.keys[key]++;
  }
};
KeyRing.prototype.addKeys = function(keynamearry){
  for(var i=0; i<keynamearry.length; i++){
    if(keynamearry[i]){
      this.addKey(keynamearry[i]);
    }
  }
};
KeyRing.prototype.removeKey = function(key){
  if(typeof this.keys[key] !== 'undefined'){
    this.keys[key]--;
    if(this.keys[key]<1){
      delete this.keys[key];
      this.keyRemoved.fire(key);
      return true;
    }
  }
};
KeyRing.prototype.destroy = function(){
  if(!this.destroyed){return;}
  this.destroyed.fire();
  this.newKey.destruct();
  this.keyRemoved.destruct();
  this.destroyed.destruct();
  for(var i in this){
    delete this[i];
  }
};
KeyRing.prototype.dump = function(){
  var ret = {roles:this.roles};
  var ra = this.roles ? this.roles.split(',') : [];
  var ks = [];
  for(var k in this.keys){
    if(ra.indexOf(k)<0){
      ks.push(k);
    }
  }
  ret.keys = ks.join(',');
  return ret;
};

KeyRing.create = function(data,username,realmname,roles){
  return new KeyRing(data,username,realmname,roles);
};

module.exports = KeyRing;
