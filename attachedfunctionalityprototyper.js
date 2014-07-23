var executable = require('./executable'),
  isExecutable = executable.isA,
  execRun = executable.run,
  execCall = executable.call,
  execApply = executable.apply,
  dummy = executable.dummyFunc,
  Path = require('path'),
  SuperUser = require('./SuperUser'),
  UserEngagement = require('./UserEngagement');

var __Cache = {};

function defaultChecker(mname,__pn,__pd){
  if(typeof __pd === 'undefined'){
    console.log('paramobj provided to',mname,'is missing the value for',__pn);
    return;
  }
  return __pd;
};

function paramBuilder(mname,pa,pd,__pn,__p){
  if(typeof __p === 'undefined'){
    __p = defaultChecker(mname,__pn,pd[__pn]);
  }
  pa.push(__p);
};

function __doParams(mname,_p,ctor,obj,errcb,caller){
  var pa = [];
  if(_p.params){
    if(_p.params==='originalobj'){
      if(typeof obj !== 'object'){
        throw 'First parameter to '+mname+' has to be an object';
      }
      pa.push(obj);
    }else{
      var _ps = _p.params;
      if(typeof obj !== 'object'){
        console.trace();
        throw 'First parameter to '+mname+' has to be an object with the following keys: '+_ps.join(',')
      }
      for(var i=0; i<_ps.length; i++){
        paramBuilder(mname,pa,_p.defaults||{},_ps[i],obj[_ps[i]]);
      }
    }
  }
  pa.push(ctor.localerrorhandler(errcb),caller);
  return pa;
};

var __produceFunctionalityResultMessage = typeof process.env['DCP_GENERATE_MESSAGES'] !== 'undefined';

function __errorhandler(exctbl,map,errorkey,errorparams){
  if(!errorkey){
    execApply(exctbl,[0,'ok']);
    return;
  }
  if(typeof map[errorkey] !== 'object'){
    console.trace();
    throw 'Error key '+errorkey+' not specified in the error map';
  }
  var eo = map[errorkey];
  var errmess = eo.message;
  var eop = eo.params;
  if(eop && eop.length){
    if(errorparams.length!==eo.params.length){
      console.log(errorparams);
      console.log(errorparams.length,'<>',eo.params.length+1);
      throw 'Improper number of error parameters provided for '+errorkey;
    }
    if(__produceFunctionalityResultMessage){
      var eopl = eop.length;
      for(var i=0; i<eopl; i++){
        errmess = errmess.replace(new RegExp('\\['+eop[i]+'\\]','g'),errorparams[i]);
      }
    }else{
      errmess = '';
    }
  }
  execApply(exctbl,[errorkey,errorparams,errmess]);
}

function __attachedMethodResolver(ctor,mname,_p){
  if(mname==='validate_config'){return;}
  if (mname.charAt(0) == '_') {
    ctor.prototype[mname] = function(){return _p.apply(this.SELF,arguments);};
  }else if(mname!=='init'){
    ctor.prototype[mname] = function(obj,errcb,caller){
      _p.apply(this.SELF,__doParams(mname,_p,ctor,obj,errcb,caller));
    };
  }else{
    ctor.prototype[mname] = function(errcb,caller){
      _p.call(this.SELF,ctor.localerrorhandler(errcb),caller);
    };
  }
};

function trueReturner(){return true;}

function selfApplicator(f){
  f.apply(this.SELF,arguments);
}

function AFSelfBare(data,fqnname,functionality){
  this.data = data;
  this.self = functionality;
  this.superUser = new SuperUser(data,null,null,fqnname,'dcp');
};
AFSelfBare.prototype.destroy = function(){
  this.data = null;
  this.self = null;
  this.superUser = null;
}

function AFSelfWReqs(data,fqnname,functionality,requirements){
  AFSelfBare.call(this,data,fqnname,functionality);
  if(!data.element(['__requirements'])){
    data.commit('requirements_create',[
      ['set',['__requirements']]
    ]);
  }
  var re = data.elementRaw('__requirements');
  re.attach('./requirements',{functionality:functionality,requirements:requirements});
  var rf = re.functionalities.requirements;
  this.openBid = function(){rf.start.apply(rf,arguments);};
  this.offer = function(){rf.startwoffer.apply(rf,arguments)};
  this.closeBid = function(){rf._close.apply(rf,arguments)};
};
AFSelfWReqs.prototype.destroy = function(){
  this.openBid = null;
  this.offer = null;
  this.closeBid = null;
  AFSelfBare.prototype.destroy.call(this);
};

function getConstructor(modulename){
  var c = __Cache[modulename];
  if(c){
    return c;
  }
  c = function(fqnname,data,config,key){
    this.fqnname = fqnname;
    this.key = key;
    if (!this.validate_config(config)) {
      console.log('Configuration validation failed, functionality: '+modulename, config);
    }else{
      for(var i in config){
        this[i] = config[i];
      }
    }
    var ctor = __Cache[modulename];
    var req,off,reqs, close;
    if (ctor.requirements) {
      this.SELF = new AFSelfWReqs(data,fqnname,this,ctor.requirements);
    }else{
      this.SELF = new AFSelfBare(data,fqnname,this);
    }
    this.engagement = new UserEngagement(this.SELF.superUser._parent);
    this.init();
    data.functionalities[fqnname] = this;
  };
  c.prototype.__DESTROY__ = function(){
    if(!this.SELF){return;}
    var f = this.SELF.data.functionalities[this.fqnname];
    if(f){
      delete this.SELF.data.functionalities[this.fqnname];
    }
    this.engagement.destroy();
    this.SELF.destroy();
    for(var i in this){
      this[i] = null;
    }
  };

  var m = require(modulename);
  if(typeof m.errors !== 'object'){
    throw modulename+" does not have the 'errors' map";
  }
  var _errors = m.errors;
  c.localerrorhandler = function(originalerrcb){
    var ecb = (isExecutable(originalerrcb)) ? originalerrcb : dummy;
    return function(errkey){
      __errorhandler(ecb,_errors,errkey,Array.prototype.slice.call(arguments,1));
    };
  };
  c.prototype.validate_config = typeof(m.validate_config) === 'function' ? m.validate_config : trueReturner;
  c.requirements = m.requirements;

  for(var i in m){
    var p = m[i];
    if((typeof p !== 'function')) continue;
    __attachedMethodResolver(c,i,p);
  }
  if(!c.prototype.init){
    c.prototype.init = dummy;
  }
  __Cache[modulename] = c;
  return c;
};

function Create(functionalityname,data,config,key){
  var c;
  switch(typeof functionalityname){
    case 'string':
      c = getConstructor(functionalityname);
      return new c(Path.basename(functionalityname),data,config,key);
      break;
    case 'object':
      if(functionalityname.functionalityname && functionalityname.instancename){
        c = getConstructor(functionalityname.functionalityname);
        return new c(functionalityname.instancename,data,config,key);
      }
      break;
    default:
      return;// {};
  }
}

module.exports = Create;
