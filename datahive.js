var util = require('util');
var RandomBytes = require('crypto').randomBytes;

function call_on_all_functionalities (method) {
	var args = Array.prototype.slice.call(arguments, 1);
	for (var i in this.functionalities) {
		var ff = this.functionalities[i];
		('function' === typeof(ff.functionality['_connection_status'])) && ff.functionality['_connection_status'].apply(this, args);
	}
}

function DataHive(){
  this.data = new (require('./datamaster').Collection)();
  this.consumers = this.data.attach('./consumer',{},'system');
  this.system = this.data.attach('./system',{},'system');
}

function OldDataHive(){
	var self = this;
  this.functionalities = {};
  this.master = new (require('./datamaster').Collection)();
  this.consumers = this.master.attach('./consumer',{},'system');
  return;
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
  /*
  var consumers = new Consumers( function (name, c_status) {
		call_on_all_functionalities.call(t, '_connection_status', name, c_status);
	});
  */
  //this.consumers = consumers;
  this.dataMasterInit = initcb;
  this.consumerinterface = {
    newKey : function(keyring){
			if (arguments.length == 0 || 'object' != typeof(keyring)) return RandomBytes(12).toString('hex');
			var ret = '';
			for (var i in keyring) {
				if (ret.length) ret+=';'
				ret += ('#'+keyring[i].tag+':'+keyring[i].val);
			}
			return ret;
    },
    setKey : function(username,key){
      var ci = consumers.identities[username];
      if(ci){
        ci.addKey(key,initcb);
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

OldDataHive.prototype.attach = function (objorname,config,key,environmentmodulename){
  return this.master.attach(objorname,config,key,environmentmodulename,this.consumerinterface);
};
OldDataHive.prototype.consumerIdentityForSession = function(sess){
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
OldDataHive.prototype.methodHandler = function(method,paramobj){
  var t = this;
  var lios = method.lastIndexOf('/');
  if(lios<0){
    return;
  }
  var functionalityname = method.slice(0,lios);
  var methodname = method.slice(lios+1);
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
    }else{
      console.log('functionality',functionalityname,'does not exist');
    }
  };
}
OldDataHive.prototype.interact = function (credentials,method,paramobj,cb){
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
  var po = {method:method,params:paramobj,cb:cb};
  for(var i in credentials){
    po[i] = credentials[i];
  }
  this.consumers.interact(po,function(){console.log('status',arguments);});
  return;
  var ic = this.consumers.identityAndConsumerFor(credentials,this.dataMasterInit);
  if(typeof paramobj !== 'function'){
    //console.log('interact',credentials,method,paramobj);
  }
  if(!ic){
    console.log('No identity for',credentials);
    if(typeof paramobj === 'function'){paramobj();}
    if(typeof cb === 'function'){cb();}
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
      console.log('there is no functionality on',functionalityname);
      return;
    }
    fm(paramobj,cb?cb:function(errcode,errmess){},ic[0].name);
  }else{
    console.log('functionality',functionalityname,'does not exist on',this.functionalities);
    dumpq();
  }
};


var bridge_methods = {
	'_connection_status' : function (credentials, connection_active) {
		if (connection_active) return;
		var ic = this.consumers.identityAndConsumerFor(credentials, this.dataMasterInit);
		if (!ic) return;
    console.log('bridge _connection_status',credentials.name,'should die');
		ic[1].die();
	}
}

OldDataHive.prototype.inneract = function (method) {
  console.log('inneract',method);
  return;
	if ('function' === typeof(bridge_methods[method])) {
		return bridge_methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
	}else{
		call_on_all_functionalities.apply(this, arguments);
	}
}

module.exports = DataHive;
