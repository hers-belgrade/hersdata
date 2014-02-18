var Listener = require('./listener'),
  BigCounter = require('./BigCounter'),
  HookCollection = require('./hookcollection');

var BC = new BigCounter();
var __Bridges = {};
var __BridgeInstanceCounter=0;

function Bridge(listener,data){
  if(!(listener&&data)){
    return;
  }
  BC.inc();
  //__BridgeInstanceCounter++;
  //this.__counter = BC.toString();
  //__Bridges[this.__counter] = this;
  this.destroyed = new HookCollection();
  Listener.call(this);
  this.createListener('__listenerdestroyed',function(){this.destroy();},listener.destroyed);
  this.createListener('__datadestroyed',function(){this.destroy();},data.destroyed);
};
Bridge.prototype = new Listener();
Bridge.prototype.constructor = Bridge;
Bridge.prototype.destroy = function(){
  //console.log(this.__counter,'destroyed');
  this.destroyed.fire();
  this.destroyed.destruct();
  //delete __Bridges[this.__counter];
  //__BridgeInstanceCounter--;
  //console.log(__BridgeInstanceCounter);
  Listener.prototype.destroy.call(this);
  for(var i in this){
    delete this[i];
  }
}

function Data_Scalar(listener,scalar,cb,valueconstraint){
  if(!(listener&&scalar&&typeof cb === 'function')){return;}
  Bridge.call(this,listener,scalar);
  this.createListener('__scalarchanged',function(el,changedmap){
    if(!changedmap.private){return;}
    cb.call(this,el.value());
  },scalar.changed);
  cb.call(this,scalar.value());
};
Data_Scalar.prototype = new Bridge();
Data_Scalar.prototype.constructor = Data_Scalar;

function typefilter(type){
  var t = type;
  return function(name,el){
    return el.type()===t;
  };
};

function nameeqfilter(name){
  var n = name;
  return function(name,el){
    return name===n;
  };
};

function nameneqfilter(name){
  var n = name;
  return function(name,el){
    return name===n;
  };
};

function waiter_callback(name,cb){
  var t = this;
  if(!this.name){
    return function(){
      var args = Array.prototype.slice.call(arguments,0);
      args.unshift(name);
      //console.log('applying',args);
      cb.apply(t,args);
    };
  }else{
    return function(){
      cb.apply(t,arguments);
    }
  };
};

function collectionhandler(path,cb){
  var t = this, _p = path, _cb = cb;
  return function(name,el){
    new Data_CollectionElementWaiter(t,el,_p,waiter_callback.call(t,name,_cb));
  };
};

function scalarhandler(path,cb){
  var t = this, _p = path, _cb = cb;
  return function(name,el){
    new Data_Scalar(t,el,waiter_callback.call(t,name,_cb));
  };
};

function filterer(filters,cb){
  var ffs = filters;
  var t = this, _cb = cb;
  return function(name,el){
    for(var i in ffs){
      var ff = ffs[i];
      if(!ff(name,el)){
        return;
      }
    }
    _cb.call(t,name,el);
  };
};

function Data_CollectionElementWaiter(listener,collection,path,cb){
  if(!(listener&&collection&&path&&typeof cb === 'function')){
    return;
  }
  //console.log('new Waiter',path);
  Bridge.call(this,listener,collection);
  var fn = path[0],tofn = typeof fn;
  switch(tofn){
    case 'string':
      var filters = [],handler;
      if(path.length>1){
        filters.push(typefilter('Collection'));
        handler = collectionhandler.call(this,path.slice(1),cb);
      }
      var ioc = fn.indexOf(':');
      if(ioc>0){
        var type = fn.substring(0,ioc);
        //console.log('type',type);
        fn = fn.substring(ioc+1);
        if(path.length===1){
          filters.push(typefilter(type));
          var hh;
          switch(type){
            case 'Collection':
              hh = collectionhandler;
              break;
            case 'Scalar':
              hh = scalarhandler;
              break;
          }
          handler = hh.call(this,path.slice(1),cb);
        }
      }
      if(fn==='*'){
        fn='';
        if(path.length===1){
          handler = cb;
        }
      }
      if(fn){
        var ioe = fn.indexOf('=');
        if(ioe>0){
          var name = fn.substring(0,ioe),
            val = fn.substring(ioe+1),
            t = this;
          filters.push(nameeqfilter(name));
          this.name = name;
          handler = scalarhandler.call(this,path.slice(1),function(v){
            //console.log('scalar',name,'said',v);
            if(val===v){
              cb.call(t,v);
            }
          });
        }else{
          this.name = fn;
          filters.push(nameeqfilter(fn));
        }
      }
      var _h = filterer.call(this,filters,handler||scalarhandler.call(this,path.slice(1),cb));
      collection.traverseElements(_h);
      this.createListener('__followeesnewelement',_h,collection.newElement);
      break;
    case 'object':
      if(fn instanceof Array){
        if(path.length===1){
          var t = this, map = {}, handled=[], shouldhandle=fn.length;
          for(var i in fn){
            var _en = fn[i];
            var w = new Data_CollectionElementWaiter(this,collection,[_en],function(){
              var val = arguments[arguments.length-1],_n;
              if(this.name){
                _n = this.name;
              }else{
                _n = _en;
              }
              map[_n] = val;
              if(handled.indexOf(_n)<0){
                var h = handled;
                this.destroyed.attach(function(){
                  var i = h.splice(h.indexOf(_n),1);
                });
                handled.push(_n);
              }
              if(handled.length===shouldhandle){
                var args = Array.prototype.slice.call(arguments,0,arguments.length-1);
                args.push(map);
                cb.apply(t,args);
              }
            });
          }
        }
      }
      break;
  }
};
Data_CollectionElementWaiter.prototype = new Bridge();
Data_CollectionElementWaiter.prototype.constructor = Data_CollectionElementWaiter;

module.exports = {
  Bridge:Bridge,
  Data_CollectionElementWaiter: Data_CollectionElementWaiter
};
