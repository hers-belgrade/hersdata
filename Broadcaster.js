var DataUser = require('./DataUser'),
  HookCollection = require('./hookcollection');

function PathTranslator(path,replaceleading,cb){
  this.translate = typeof replaceleading === 'undefined' ? function(cb){
    var _cb = cb,mypath = path;
    return function(item){
      _cb([mypath,item[1]]);
    };
  } : function(cb){
    var _cb = cb,mypath = path;
    return function(item){
      _cb([item[0] && item[0].slice ? mypath.concat(item[0].slice(replaceleading)) : mypath,item[1]]);
    };
  };
  this.cb = this.translate(cb);
  this.hook = new HookCollection();
  this.count = 0;
};
PathTranslator.prototype.attach = function(cb){
  this.count++;
  return this.hook.attach(cb);
};
PathTranslator.prototype.detach = function(cbid){
  this.count--;
  this.hook.detach(cbid);
};
PathTranslator.prototype.fire = function(item){
  if(!this.count){
    return;
  }
  this.hook.fire(this.cb(item));
};

function Broadcaster(data,createcb,username,realmname,roles){
  if(!data){
    console.log('no data');
    return;
  }
  console.log('Broadcaster calling DataUser',username,realmname,roles);
  this.broadcast = new HookCollection();
  this.dcptree = {};
  DataUser.call(this,data,createcb,undefined,username,realmname,roles);
}
Broadcaster.prototype = new DataUser();
Broadcaster.prototype.constructor = Broadcaster;
Broadcaster.prototype.say = function(item){
  if(this.remotepath){
    this.commit(item);
  }
  this.broadcast.fire(item);
  if(this.translators){
    for(var i in this.translators){
      this.translators[i].fire(item);
    }
  }
};
Broadcaster.prototype.commit = function(item){
  console.log('commit');
  var path = item[0], data = item[1];
  var elem = this.findelem(path);
  if(!elem){return;}
  switch(data.length){
    case 1:
      delete elem[data[0]];
      break;
    case 2:
      elem[data[0]] = data[1];
      break;
  }
};
Broadcaster.prototype.findelem = function(path,cursor,elem){
  cursor = cursor || 0;
  elem = elem || this.dcptree;
  if(cursor>=path.length){
    return;
  }
  var pe = path[cursor];
  var ret = elem[pe];
  if(!ret){
    ret = {};
    elem[pe] = ret;
  }
  if(cursor===path.length-1){
    return ret;
  }
  return this.findelem(path,cursor+1,elem);
};
Broadcaster.prototype.describeElem = function(elem,cb){
  for(var i in elem){
    cb([this.path,[i,elem[i]]]);
  }
  for(var i in elem){
    var e = elem[i];
    if(typeof e === 'object'){
      this.describeElem(e,cb);
    }
  }
};
Broadcaster.prototype.describe = function(cb,translatorname){
  if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      cb = t.translate(cb);
    }
  }
  cb([undefined,[':reset',[]]]);
  if(this.remotepath){
    this.describeElem(this.dcptree,cb);
  }else{
    DataUser.prototype.describe.call(this,cb);
  }
};
Broadcaster.prototype.attach = function(cb,translatorname){
  this.describe(cb,translatorname);
  if(!translatorname){
    return this.broadcast.attach(cb);
  }else if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      return t.attach(cb);
    }
  }
};
Broadcaster.prototype.detach = function(id,translatorname){
  if(!translatorname){
    this.broadcast.detach(id);
  }else if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      t.detach(id);
    }
  }
};
Broadcaster.prototype.createTranslator = function(name,path,replaceleading){
  if(!this.translators){
    this.translators = {};
  }
  this.translators[name] = new PathTranslator(path,replaceleading);
};

module.exports = Broadcaster;
