var Consumers = require('./consumer');
var util = require('util');
var RandomBytes = require('crypto').randomBytes;

function call_on_all_functionalities (method) {
	var args = Array.prototype.slice.call(arguments, 1);
	console.log('will call on all functionalities ', method);
	for (var i in this.functionalities) {
		var ff = this.functionalities[i];
		('function' === typeof(ff.functionality['_connection_status'])) && ff.functionality['_connection_status'].apply(this, args);
	}
}

function DataHive(){
	var self = this;
  this.functionalities = {};
  this.master = new (require('./datamaster').Collection)();
  var t = this;
  var mytxnid = '_';
  var lastinit = {};

	var connection_status_cbs = [];
  function initcb(){
    if(lastinit.txnid===mytxnid){
      return lastinit.data;
    }
    var dd = t.master.dump();
    mytxnid = dd[dd.length-1];
    lastinit.data = dd;
    lastinit.txnid = mytxnid;
    return lastinit.data;
  };
  this.master.onNewTransaction.attach(function masterTxnHandler(path,txnalias,txnprimitives,datacopytxnprimitives,txnid){
    mytxnid = txnid;
    delete lastinit.txnid;
    //console.log(path,txnalias,txnprimitives,datacopytxnprimitives);
    //console.log('new txn',path,txnalias,util.inspect(datacopytxnprimitives,false,null,true),txnid);
    t.consumers.processTransaction(txnalias,txnprimitives,datacopytxnprimitives,txnid,initcb);
  });
  this.master.onNewFunctionality.attach(function(path,fctnobj,key){
    //console.log(path,fctnobj);
    t.functionalities[path.join('/')] = {key:key,functionality:fctnobj};
  });
  var consumers = new Consumers( function (name, c_status) {
		console.log('NAME ',name,' changed is online ', c_status)
		call_on_all_functionalities.call(t, '_connection_status', name, c_status);
	});
  this.consumers = consumers;
  this.dataMasterInit = initcb;
  this.consumerinterface = {
    newKey : function(){
      return RandomBytes(12).toString('hex');
    },
    setKey : function(username,key){
      var ci = consumers.identities[username];
      if(ci){
        ci.addKey(key);
      }
    },
    removeKey : function(username,key){
      var ci = consumers.identities[username];
      if(ci){
        ci.removeKey(key);
      }
    },
  };
}

DataHive.prototype.attach = function (objorname,config,key,environmentmodulename){
  return this.master.attach(objorname,config,key,environmentmodulename,this.consumerinterface);
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
//name : username
//if name is not found, the method returns
//if name value is found, the users are searched for this value
//if a user is not found, expected key is
//roles: array of role names
//the roles declared will be given to the newly created ConsumerIdentity
  var ic = this.consumers.identityAndConsumerFor(credentials,this.dataMasterInit);
  if(!ic){
    return;
  }
  function dumpq(){
    if(typeof paramobj === 'function'){
      ic[1].dumpqueue(paramobj);
    }
  }
  var t = this;
  var lios = method.lastIndexOf('/');
  if(lios<0){
    return dumpq();
  }
  var functionalityname = method.slice(0,lios);
  var methodname = method.slice(lios+1);

	if (methodname.charAt(0) === '_') return;
  console.log(functionalityname,methodname);
  var f = this.functionalities[functionalityname];
  if(f){
    if(typeof f.key !== 'undefined'){
      if(!(ic[0] && ic[0].keyring && ic[0].keyring.contains(f.key))){
        console.log('keyfail with',f.key,ic[0]);
        return;
      }
    }
    var fm = f.functionality[methodname];
    if(typeof fm !== 'function'){
      return;
    }
    fm(paramobj,function(errcode,errmess){},ic[0].name);
  }else{
    dumpq();
  }
};


var bridge_methods = {
	'_connection_status' : function (credentials, connection_active) {
		if (connection_active) return;
		var ic = this.consumers.identityAndConsumerFor(credentials, this.dataMasterInit);
		if (!ic) return;
		ic[1].die();
	}
}

DataHive.prototype.inneract = function (method) {
	if ('function' === typeof(bridge_methods[method])) {
		return bridge_methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
	}else{
		call_on_all_functionalities.apply(this, arguments);
	}
}

module.exports = DataHive;
