var Consumers = require('./consumer');
var RandomBytes = require('crypto').randomBytes;
var util = require('util');
function randomstring(){
  return RandomBytes(12).toString('hex');
};

function DataHive(){
  this.sessionkeyname = randomstring();
  this.functionalities = {};
  console.log(this.sessionkeyname);
  this.master = new (require('./datamaster').Collection)();
  var t = this;
  this.master.onNewTransaction.attach(function(path,txnalias,txnprimitives,datacopytxnprimitives){
    //console.log(path,txnalias,txnprimitives,datacopytxnprimitives);
    //console.log('new txn',path,txnalias,util.inspect(datacopytxnprimitives,false,null,true));
    t.consumers.processTransaction(txnalias,txnprimitives,datacopytxnprimitives);
  });
  this.master.onNewFunctionality.attach(function(path,fctnobj,key){
    console.log(path,fctnobj);
    t.functionalities[path] = {key:key,functionality:fctnobj};
  });
  this.consumers = new Consumers();
}
DataHive.prototype.attach = function (objorname,config,key){
  return this.master.attach(objorname,config,key);
};
DataHive.prototype.consumerIdentityForSession = function(sess){
  var consumername = this.sess2name[sess];
  if(!consumername){
    return;
  }
  var ci = this.consumerIdentities[consumername];
  if(!ci){
    delete this.sess2name[sess];
  }
  return ci;
};
DataHive.prototype.methodHandler = function(method,paramobj){
  var t = this;
  var lios = method.lastIndexOf('/');
  if(lios<0){
    return;
  }
  var functionalityname = method.slice(0,lios);
  var methodname = method.slice(lios+1);
  console.log(functionalityname,methodname);
  return function(user){
    var f = t.functionalities[functionalityname];
    if(f){
      if(typeof f.key !== 'undefined'){
        if(!user.keyring.contains(f.key)){
          return;
        }
      }
      var fm = f.functionality[methodname];
      if(typeof fm !== 'function'){
        return;
      }
      fm(paramobj,function(errcode,errmess){},user.name);
    }
  };
}
DataHive.prototype.interact = function (credentials,method,paramobj){
//credentials is the impersonation object
//expected keys are (in order of expectancy)
//sessionkeyname : session
//(sessionkeyname is randomgenerated in constructor)
//if sessionkeyname is not found, 
//hersdataidentityname : username
//if hersdataidentityname is not found, the method returns
//if hersdataidentityname value is found, the users are searched for this value
//if a user is not found, expected key is
//credentials: credentialstring
//credentialstring will be used for authenticating the user
  var ci = this.consumers.identityFor(credentials,this.methodHandler(method,paramobj));
};

module.exports = DataHive;
