var HookCollection = require('./hookcollection');
var throw_if_invalid_scalar = require('./helpers').throw_if_invalid_scalar;

function throw_if_invalid_scalar_or_undefined(val){
  var tov = typeof val;
  if (('undefined' !== tov)&&('string' !== tov)&&('number' !== tov)&&('boolean' !== tov)){
    console.trace();
    throw val+' can be nothing but a string or a number ';
  }
}

function throw_if_any_invalid (rv,pv,al) {
  throw_if_invalid_scalar_or_undefined (rv);
  throw_if_invalid_scalar_or_undefined (pv);
  throw_if_invalid_scalar_or_undefined (al);
}

function equals(a,b){
  if(typeof a === 'undefined' && typeof b === 'undefined'){
    return true;
  }
  return a===b;
}

function nullconversion(a){
  return (a===null) ? undefined : a;
}

function Scalar(res_val,pub_val, access_lvl) {
  Scalar.__instanceCount++;

  var public_value = nullconversion(pub_val);
  var restricted_value = nullconversion(res_val);
  var access_level = nullconversion(access_lvl);

  this.changed = new HookCollection();
  this.destroyed = new HookCollection();

  function set_from_vals (rv,pv,al,path) {
    rv = nullconversion(rv);
    pv = nullconversion(pv);
    al = nullconversion(al);
    throw_if_any_invalid(rv,pv,al);
    var changedmap = {};
    var changed = false;
    if(!equals(rv,restricted_value)){
      changed = true;
      changedmap.private = 1;
    }
    if(!equals(pv,public_value)){
      changed = true;
      changedmap.public = 1;
    }
    if(!equals(al,access_level)){
      changed = true;
      changedmap.key = 1;
    }
    if(!changed){
      return;
    }
    //console.trace();
    //console.log('[',public_value,restricted_value,access_level,'] changed to [',pv,rv,al,']');
    restricted_value = rv;
    public_value = pv;
    access_level = al;
    //console.log(this.changed.counter);
    this.changed.fire(this,changedmap);
  }

  set_from_vals.call(this,res_val, pub_val, access_lvl);

  this.access_level = function(){
    return access_level;
  };
  this.alter = function (r_v,p_v,a_l,path) { 
    r_v = (r_v===null) ? undefined : r_v;
    p_v = (p_v===null) ? undefined : p_v;
    a_l = (a_l===null) ? undefined : a_l;
    return set_from_vals.call(this,r_v,p_v,a_l,path);
  };
  this.value = function(){
    return restricted_value;
  };
  this.public_value = function(){
    return public_value;
  };
  this.debugValue = function(){
    return restricted_value+'/'+access_level+'/'+public_value;
  };
  this.toMasterPrimitives = function(path){
    return [['set',path,[restricted_value,public_value,access_level]]];
  }

  this.destroy = function  () {
    this.destroyed.fire();
    public_value = undefined;
    restricted_value = undefined;
    access_level = undefined;
    this.changed.destruct();
    this.destroyed.destruct();
    for(var i in this){
      this[i] = null;
    }
    Scalar.__instanceCount--;
  }
};
Scalar.prototype.type = function(){
  return 'Scalar';
};
Scalar.__instanceCount=0;

module.exports = Scalar;
