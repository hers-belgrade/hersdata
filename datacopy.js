function ScalarCopy(value){
  var tov = typeof value;
  if(!((tov==='string')||(tov==='number'))){
    throw 'Scalar can be nothing but a string or a number';
  }
  var data = value;
  var changed = new HookCollection();
  this.changed = changed;
  var destroyed = new HookCollection();
  this.destroy = function(){
    destroyed.fire();
    changed.destroy();
    changed = undefined;
    destroyed.destroy();
    destroyed = undefined;
  }
  this.destroyed = destroyed;
  this.value = function(){
    return data;
  };
  this.stringify = function(){
    return JSON.stringify(data);
  };
  this.parse = function(value){
    data = JSON.parse(value);
  };
}

function CollectionCopy(defaultelementconstructor,value){
  var data = {};
  var defaultconstuctor = defaultelementconstructor || function(){
    throw 'No default constructor provided';
  };
  var newElement = new HookCollection();
  var elementDestroyed = new HookCollection();
  var add = function(name,value,constructor){
    if(typeof constructor !== 'function'){
      constructor = Collection;
    }
    var element = new constructor(value);
    data[name] = element;
    newElement.fire(name,element.stringify());
  };
  this.addScalar = function(name,value){
    add(name,value,Scalar);
  };
  var destroy = function(name){
    var el = data[name];
    if(typeof el === 'undefined'){
      return;
    }
    delete data[name];
    el.destroy();
    elementDestroyed.fire(name);
  };
  this.element = function(name){
    return data[name];
  };
  this.newElement = newElement;
  this.elementDestroyed = elementDestroyed;
  this.stringify = function(){
    var ret = {};
    for(var i in data){
      ret[i] = data[i].stringify();
    }
    return JSON.stringify(ret);
  };
  this.parse = function(value){
    var vj = JSON.parse(value);
    for(var i in vj){
      if(data[i]){
        data[i].parse(vj[i]);
      }else{
        add(i,vj[i],defaultconstuctor);
      }
    }
  };
  if(value){
    this.parse(value);
  }
}

function SeriesCopy(defaultelementconstructor,value){
  CollectionCopy.apply(this,[defaultelementconstructor]);
  this.addScalar('capacity',0);
  if(value){
    this.parse(value);
  }
}
