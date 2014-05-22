var errors = {
  'OK' : {message:'OK'},
  'INVALID_REQUIREMENTNAMES' : {message:'Requirements to start may be a string, commadelimited string or an array'},
  'REQUIREMENT_NOT_RECOGNIZED' : {message:'Requirement [requirement] cannot be started because it is not in the initial map', params:['requirement']},
  'REQUIREMENT_ALREADY_PENDING' : {message:'Requirement [requirement] is already pending', params:['requirement']},
  'OFFER_SET':{message:'Offer set at [offerid]',params:['offerid']},
  'DUPLICATE_OFFER_ID': {message:'Offer could not be set, there is already offer [offerid] pending',params:['offerid']}
};

function init(){
  /*
  var actions = [];
  this.data.commit('requirements_init',actions);
  */
};
function _close(requirement, cb) {
  this.data.commit ('close_bid', [
    ['remove', [requirement]]
  ]);
}

function start(requirements,cb){
  var createactions = [];
  for(var i in requirements){
    var mr = this.self.requirements[i];
    if(typeof mr === 'undefined'){
      cb('REQUIREMENT_NOT_RECOGNIZED',i);
      return;
    }
    if(this.data.element([i])){
      cb('REQUIREMENT_ALREADY_PENDING',i);
      return;
    }
    createactions.push(['set',[i],requirements[i]==='null'?undefined:requirements[i]]);
  }
  this.data.commit('creating_requirement',createactions);
  for(var i in requirements){
    var mr = this.self.requirements[i];
    var d = this.data;
    this.data.element([i]).attach('./requirement',{
      cbs:mr,
      notifyDone:(function(_i){
      var i=_i;
      return function(){
        d.commit('requirement_'+i+'_done',[
          ['remove',[i]]
        ]);
      };
    })(i)});
  }
  cb('OK');
}
start.params = 'originalobj';

function startwoffer(requirementswoffers,cb,user){
  var createactions = [];
  for(var i in requirementswoffers){
    var mr = this.self.requirements[i];
    if(typeof mr === 'undefined'){
      cb('REQUIREMENT_NOT_RECOGNIZED',i);
      return;
    }
    if(this.data.element([i])){
      var r = requirementswoffers[i];
      delete requirementswoffers[i];
      this.data.element([i]).functionalities.requirement.f.setOffer(r.offer,function(){},user);
      //cb('REQUIREMENT_ALREADY_PENDING',i);
      //return;
    }else{
      var key = requirementswoffers[i].key;
      createactions.push(['set',[i],key==='null'?undefined:key]);
    }
  }
  if(createactions.length){
    this.data.commit('creating_requirement',createactions);
  }
  for(var i in requirementswoffers){
    var r = requirementswoffers[i];
    var mr = this.self.requirements[i];
    var d = this.data;
    //console.log('attaching requirement on',i);
    var f = this.data.element([i]).attach('./requirement',{
      cbs:mr,
      notifyDone:(function(_i){
      var i=_i;
      return function(){
        d.commit('requirement_'+i+'_done',[
          ['remove',[i]]
        ]);
      };
    })(i)});
    f.setOffer(r.offer,function(){
      cb.apply(null,[arguments[0]].concat(arguments[1]));
    },user);
  }
  //console.log('requirementwoffer set',this.data.dataDebug());
}
startwoffer.params = 'originalobj';


module.exports = {
  errors:errors,
  init:init,
  start:start,
  _close:_close,
  startwoffer:startwoffer
};
