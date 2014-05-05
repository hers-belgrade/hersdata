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
  //BC.inc();
  __BridgeInstanceCounter++;
  //this.__counter = BC.toString();
  //__Bridges[this.__counter] = this;
  this.destroyed = new HookCollection();
  Listener.call(this);
  this.createListener('__listenerdestroyed',function(){this.destroy();},listener.destroyed);
  this.createListener('__datadestroyed',function(){this.destroy();},data.destroyed);
};
Bridge.prototype = Object.create(Listener.prototype,{constructor:{
  value:Bridge,
  enumerable:false,
  writable:false,
  configurable:false
}});
Bridge.prototype.destroy = function(){
  //console.log(this.__counter,'destroyed');
  this.destroyed.fire();
  this.destroyed.destruct();
  //delete __Bridges[this.__counter];
  __BridgeInstanceCounter--;
  //console.log('Bridge instance count',__BridgeInstanceCounter);
  Listener.prototype.destroy.call(this);
  for(var i in this){
    delete this[i];
  }
}

function Data_Element(listener,scalar,cb){
  Bridge.call(this,listener,scalar);
  this._cb = cb;
};
Data_Element.prototype = Object.create(Bridge.prototype,{constructor:{
  value:Data_Element,
  enumerable:false,
  writable:false,
  configurable:false
}});
Data_Element.prototype.destroy = function(){
  /*
  console.trace();
  console.log('destruction',this._cb.toString());
  */
  this._cb.call(this,null);
  Bridge.prototype.destroy.call(this);
};
/**/

function Data_Scalar(listener,scalar,cb,valueconstraint){
  if(!(listener&&scalar&&typeof cb === 'function')){return;}
  Data_Element.call(this,listener,scalar,cb);
  this.createListener('__scalarchanged',function(el,changedmap){
    if(!changedmap.private){return;}
    cb.call(this,listener.contains(el.access_level()) ? el.value() : el.public_value());
  },scalar.changed);
  cb.call(this,listener.contains(scalar.access_level()) ? scalar.value() : scalar.public_value());
  /*
  if(!listener.contains(scalar.access_level())){
    console.trace();
    console.log('should have said',scalar.public_value(),'instead of',scalar.value(),'because',scalar.access_level());
  }
  */
};
Data_Scalar.prototype = Object.create(Data_Element.prototype,{constructor:{
  value:Data_Scalar,
  enumerable:false,
  writable:false,
  configurable:false
}});

function typefilter(type){
  var t = type;
  return function(name,el){
    return el && el.type ? el.type()===t : false;
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
    return name!==n;
  };
};

function waiter_callback(name,cb){
  var t = this;
  var _waiter_callback = !this.name ? 
    function(){
      if(!t){return;}
      var args = Array.prototype.slice.call(arguments,0);
      args.unshift(name);
      //console.log('applying',args);
      cb.apply(t,args);
    }
  :
    function(){
      if(!t){return;}
      cb.apply(t,arguments);
    }
  ;
  this.destroyed.attach(function(){
    t=null;
    _waiter_callback = null;
  });
  return _waiter_callback;
};

function collectionhandler(path,cb){
  var t = this, _p = path, _cb = cb;
  var _collectionhandler = function(name,el){
    if(!t){return;}
    if(el && el.type()==='Collection'){
      new Data_CollectionElementWaiter(t,el,_p,waiter_callback.call(t,name,_cb));
    }
  };
  this.destroyed.attach(function(){
    t=null;
    _collectionhandler = null;
  });
  return _collectionhandler;
};

function scalarhandler(path,cb){
  var t = this, _cb = cb;
  var _scalarhandler = function(name,el){
    if(!t){return;}
    if(el && el.type()==='Scalar'){
      new Data_Scalar(t,el,waiter_callback.call(t,name,_cb));
    }
  };
  this.destroyed.attach(function(){
    t=null;
    _scalarhandler = null;
  });
  return _scalarhandler;
};

function elementhandler(path,cb){
  var t = this, _p = path, _cb = cb;
  var _elemhandler = function(name,el){
    if(!t){return;}
    if(el){
     if(el.type()==='Scalar'){
      new Data_Scalar(t,el,waiter_callback.call(t,name,_cb));
     }
     if(el.type()==='Collection'){
       if(name==='clear'){
         console.log('path is',_p);
       }
      new Data_CollectionElementWaiter(t,el,_p,waiter_callback.call(t,name,_cb));
     }
    }
  };
  this.destroyed.attach(function(){
    t=null;
    _elemhandler=null;
  });
  return _elemhandler;
};

function filterer(filters,cb){
  var ffs = filters;
  var t = this, _cb = cb;
  var _filterer = function(name,el){
    if(!t){return;}
    for(var i in ffs){
      var ff = ffs[i];
      if(!ff(name,el)){
        return;
      }
    }
    _cb.call(t,name,el);
    if(el && el.destroyed){
      var _t = t, _ccb = _cb;
      el.destroyed.attach(function(){
        _ccb.call(_t,name,null);
      });
    }
  };
  this.destroyed.attach(function(){
    t=null;
    _filterer = null;
  });
  return _filterer;
};

function Data_CollectionElementWaiter(listener,collection,path,cb){
  if(!(listener&&collection&&path&&typeof cb === 'function')){
    console.trace();
    console.log('not good, listener',listener,'collection',collection,'path',path,'cb',cb);
    return;
  }
  if(!listener.contains){
    console.trace();
    console.log('ooops, new school');
    throw('?');
    process.exit(0);
  }
  //console.log('new Waiter',path);
  Data_Element.call(this,listener,collection,cb);
  this.contains = function(key){return listener.contains(key);};
  var fn = path[0],tofn = typeof fn;
  switch(tofn){
    case 'undefined':
      cb.call(this,collection);
      break;
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
      var _h = filterer.call(this,filters,handler||elementhandler.call(this,path.slice(1),cb));
      this._cb = _h;
      collection.traverseElements(_h);
      this.createListener('__followeesnewelement',_h,collection.newElement);
      break;
    case 'object':
      if(fn instanceof Array){
        if(path.length===1){
          var t = this, map = {}, oldmap = {}, handled=[], shouldhandle=fn.length, sendold=false;
          for(var i in fn){
            var _en = fn[i];
            var w = new Data_CollectionElementWaiter(this,collection,[_en],function(){
              var val = arguments[arguments.length-1],_n;
              if(this.name){
                _n = this.name;
              }else{
                _n = _en;
              }
              if(typeof map[_n] !== 'undefined'){
                sendold = (oldmap[_n] !== map[_n]);
                oldmap[_n] = map[_n];
              }else{
                oldmap[_n] = val;
              }
              if(typeof val === 'undefined'){
                delete map[_n];
                var ni = handled.indexOf(_n);
                if(ni>=0){
                  handled.splice(ni,1);
                }
              }else{
                map[_n] = val;
                if(handled.indexOf(_n)<0){
                  var h = handled;
                  this.destroyed.attach(function(){
                    var i = h.splice(h.indexOf(_n),1);
                  });
                  handled.push(_n);
                }
              }
              if(handled.length===shouldhandle){
                var args = Array.prototype.slice.call(arguments,0,arguments.length-1);
                args.push(map);
                if(sendold){
                  args.push(oldmap);
                }
                cb.apply(t,args);
              }
            });
          }
        }
      }
      break;
  }
};
Data_CollectionElementWaiter.prototype = Object.create(Data_Element.prototype,{constructor:{
  value:Data_CollectionElementWaiter,
  enumerable:false,
  writable:false,
  configurable:false
}});

module.exports = {
  Bridge:Bridge,
  Data_CollectionElementWaiter: Data_CollectionElementWaiter
};
