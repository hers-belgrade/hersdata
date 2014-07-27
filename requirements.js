var executable = require('./executable'),
  isExecutable = executable.isA,
  execCall = executable.call,
  execApply = executable.apply,
  dummy = executable.dummyFunc;

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

function removeRequirement(reqname){
  if(!this.elementRaw(reqname)){
    console.log('no requirement',reqname,'on',this.dataDebug());
    process.exit(0);
  }
  this.commit('requirement_'+reqname+'_done',[
    ['remove',[reqname]]
  ]);
};

function start(requirements,cb){
  if(!isExecutable(cb)){
    return;
  }
  var createactions = [];
  for(var i in requirements){
    var mr = this.self.requirements[i];
    if(typeof mr === 'undefined'){
      execApply(cb,['REQUIREMENT_NOT_RECOGNIZED',i]);
      return;
    }
    if(this.data.element([i])){
      execApply(cb,['REQUIREMENT_ALREADY_PENDING',i]);
      return;
    }
    createactions.push(['set',[i],requirements[i]==='null'?undefined:requirements[i]]);
  }
  this.data.commit('creating_requirement',createactions);
  for(var i in requirements){
    var mr = this.self.requirements[i];
    var d = this.data;
    this.data.element([i]).attach('./requirement',{
      functionality:this.self.functionality,
      cbs:mr,
      notifyDone:[this.data,removeRequirement,[i]]
    });
  }
  execCall(cb,'OK');
}
start.params = 'originalobj';

function cbApplicator(){
  execApply(this,[arguments[0]].concat(arguments[1]));
};

function startwoffer(requirementswoffers,cb,user){
  var createactions = [];
  for(var i in requirementswoffers){
    var mr = this.self.requirements[i];
    if(typeof mr === 'undefined'){
      cb('REQUIREMENT_NOT_RECOGNIZED',i);
      return;
    }
    var key = requirementswoffers[i].key,de=this.data.elementRaw(i);
    if(de){
      var r = requirementswoffers[i];
      delete requirementswoffers[i];
      if(de.access_level()!==key){
        createactions.push(['set',[i],key==='null'?undefined:key]);
      }
      de.functionalities.requirement.setOffer(r.offer,dummy,user);
    }else{
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
    //console.log(user.username(),'attaching requirement',i,'on',this.data.dataDebug());
    var f = this.data.element([i]).attach('./requirement',{
      functionality:this.self.functionality,
      cbs:mr,
      notifyDone:[this.data,removeRequirement,[i]]
    });
    f.setOffer(r.offer,[cb,cbApplicator],user);
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
