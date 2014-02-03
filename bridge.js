var Listener = require('./listener'),
  BigCounter = require('./BigCounter'),
  HookCollection = require('./hookcollection');

var BC = new BigCounter();
var __Bridges = {};

function Bridge(listener,data){
  if(!(listener&&data)){
    return;
  }
  BC.inc();
  this.__counter = BC.toString();
  __Bridges[this.__counter] = this;
  Listener.call(this);
  this.createListener('__listenerdestroyed',function(){this.destroy();},listener.destroyed);
  this.createListener('__datadestroyed',function(){this.destroy();},data.destroyed);
};
Bridge.prototype = new Listener();
Bridge.prototype.destroy = function(){
  delete __Bridges[this.__counter];
}

function Data_Scalar(listener,scalar,cb){
  if(!(listener&&scalar&&typeof cb === 'function')){return;}
  Bridge.call(this,listener,scalar);
  this.value = scalar.value();
  cb.call(this,this.value);
  this.createListener('__scalarchanged',function(el){
    var v = el.value();
    if(v===this.value){return;}
    this.value = v;
    cb.call(this,v);
  },scalar.changed);
  this.destroyed = scalar.destroyed;
};
Data_Scalar.prototype = new Bridge();

function dcew_handleelement(listener,element,path,cb){
  if(path.length){
    new Data_CollectionElementWaiter(this,element,path,cb);
  }else{
    switch(element.type()){
      case 'Collection':
        cb.call(this,element);
        break;
      case 'Scalar':
        new Data_Scalar(this,element,cb);
        break;
    }
  }
}

function dcew_waitforname(listener,collection,path,cb){
  return function(){
    this.destroyListener('__followeesnewelement');
    var fel = collection.element([path[0]]);
    if(fel){
      dcew_handleelement.call(this,listener,fel,path.slice(1),cb);
    }
    var _p = path,_l=listener,_cb=cb;
    this.createListener('__followeesnewelement',function(name,el){
      if(name===_p[0]){
        dcew_handleelement.call(this,_l,el,_p.slice(1),_cb);
      }
    },collection.newElement);
  };
}

function dcew_handlenamedelement(listener,name,element,path,cb){
  var t = this,_n=name;
  var _cb = function(){
    //console.log('calling',cb.toString(),'with',_n,arguments);
    cb.apply(t,[_n].concat(Array.prototype.slice.call(arguments,0)));
  }
  if(path.length){
    new Data_CollectionElementWaiter(this,element,path,_cb);
  }else{
    switch(element.type()){
      case 'Collection':
        cb.call(this,name,element);
        break;
      case 'Scalar':
        target = new Data_Scalar(this,element,_cb);
        break;
    }
  }
}

function applyfilter(filter,name,el){
  var tf = filter.type;
  if(tf && el.type()!==tf){
    //console.log('filter',filter,'fails on',name,el);
    return false;
  }
  var nf = filter.name;
  if(nf){
    switch(typeof nf){
      case 'string':
        if(nf!==name){
          //console.log('filter',filter,'fails on',name,el);
          return false;
        }
        break;
      case 'object':
        if(nf instanceof Array){
          if(nf.indexOf(name)<0){
            //console.log('filter',filter,'fails on',name,el);
            return false;
          }
        }else if(nf.test && !nf.test(name)){
          //console.log('filter',filter,'fails on',name,el);
          return false;
        }
        break;
    }
  }
  //console.log('filter',filter,'passes',name,el);
  return true;
}

function constraintapplicator(filter,cb){
  if(filter){
    switch(typeof filter){
      case 'string':
        var t = this;
        return function(){
          var val = arguments.length>1 ? arguments[1] : arguments[0];
          //console.log('checking constraint',filter,'on',arguments);
          if(filter===val){
            cb.apply(t,arguments);
          }
        };
        break;
      default:
        return cb;
    }
  }else{
    return cb;
  }
};

function handlefilteronnamedelement(name,el,filter,listener,collection,path,cb){
  if(applyfilter(filter,name,el)){
    dcew_handlenamedelement.call(this,listener,name,el,path.slice(1),constraintapplicator.call(this,filter.valueconstraint,cb));
  }
};

function dcew_waitfiltered(filter,listener,collection,path,cb){
  return function(){
    var t = this;
    collection.traverseElements(function(name,el){
      handlefilteronnamedelement.call(t,name,el,filter,listener,collection,path,cb);
    });
    var _p = path,_l=listener,_cb=cb;
    this.createListener('__followeesnewelement',function(name,el){
      handlefilteronnamedelement.call(this,name,el,filter,_l,collection,_p,_cb);
    },collection.newElement);
  };
}

function dcew_waitforcollections(listener,collection,path,cb){
  return function(){
    var t = this;
    collection.traverseElements(function(name,el){
      if(el.type()==='Collection'){
        dcew_handlenamedelement.call(t,listener,name,el,path.slice(1),cb);
      }
    });
    var _p = path,_l=listener,_cb=cb;
    this.createListener('__followeesnewelement',function(name,el){
      if(el.type()==='Collection'){
        dcew_handlenamedelement.call(this,_l,name,el,_p.slice(1),_cb);
      }
    },collection.newElement);
  };
}

function dcew_waitforall(listener,collection,path,cb){
  return function(){
    var t = this;
    collection.traverseElements(function(name,el){
      dcew_handlenamedelement.call(t,listener,name,el,path.slice(1),cb);
    });
    var _p = path,_l=listener,_cb=cb;
    this.createListener('__followeesnewelement',function(name,el){
      dcew_handlenamedelement.call(this,_l,name,el,_p.slice(1),_cb);
    },collection.newElement);
  };
};

function filterfrom(str){
  var ret = {};
  var ioc = str.indexOf(':');
  if(ioc>0){
    ret.type = str.substring(0,ioc);
    str = str.substring(ioc+1);
  }
  var ioe = str.indexOf('=');
  if(ioe>0){
    ret.name = str.substring(0,ioe);
    ret.valueconstraint = str.substring(ioe+1);
  }else{
    ret.name = str;
  }
  return ret;
};

function Data_CollectionElementWaiter(listener,collection,path,cb){
  if(!(listener&&collection&&path&&typeof cb === 'function')){return;}
  Bridge.call(this,listener,collection);
  this.destroyed = collection.destroyed;
  var fn = path[0],tofn = typeof fn,sniff;
  switch(tofn){
    case 'string':
      if(fn==='*'){
        if(path.length>1){
          sniff = dcew_waitforcollections(listener,collection,path,cb);
        }else{
          sniff = dcew_waitforall(listener,collection,path,cb);
        }
      }else{
        var ioc = fn.indexOf(':');
        if(ioc>0){
          var type = fn.substring(0,ioc);
          //console.log('type',type);
        }else{
          var ioe = fn.indexOf('=');
          if(ioe>0){
            var name = fn.substring(0,ioe);
            var eq = fn.substring(ioe+1);
            sniff = dcew_waitfiltered.call(this,{name:name,valueconstraint:eq},listener,collection,path,cb);
          }else{
            sniff = dcew_waitforname.call(this,listener,collection,path,cb);
          }
        }
      }
      break;
    case 'object':
      if(fn instanceof Array){
        var map = {},fns=[],t = this;
        var check = function(){
          for(var i in fns){
            if(typeof map[fns[i]] === 'undefined'){
              //console.log('cannot trigger,',fns[i],'is still undefined');
              return;
            }
          }
          //console.log('triggering',cb.toString(),'with',map);
          cb.call(t,map);
        };
        for(var i in fn){
          var _mn = (filterfrom(fn[i]))['name'];
          if(!_mn){continue;}
          fns.push(_mn);
        }
        for(var i in fns){
          var _en = fn[i];
          var w = new Data_CollectionElementWaiter(listener,collection,[_en],(function(mn){
            var _mn = mn;
            return function(){
              //console.log(arguments);
              var arglen = arguments.length;
              if(arglen>1){
                //console.log(arguments[0],'=>',arguments[1]);
                map[arguments[0]]=arguments[1];
              }else{
                //console.log(_mn,'=>',arguments[0]);
                map[_mn] = arguments[0];
              }
              check();
            };
          })(fns[i]));
          w.destroyed.attach(function(){delete map[_mn]});
        }
      }
      break;
  }
  sniff && sniff.call(this);
};
Data_CollectionElementWaiter.prototype = new Bridge();

module.exports = {
  Data_CollectionElementWaiter: Data_CollectionElementWaiter
};
