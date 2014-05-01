var errors = {
  'OK' : {message:'OK'},
  'INVALID_REQUIREMENTNAMES' : {message:'Requirements to start may be a string, commadelimited string or an array'},
  'REQUIREMENT_NOT_RECOGNIZED' : {message:'Requirement [requirement] cannot be started because it is not in the initial map', params:['requirement']},
  'REQUIREMENT_ALREADY_PENDING' : {message:'Requirement [requirement] is already pending', params:['requirement']}
};

function init(){
  /*
  var actions = [];
  this.data.commit('requirements_init',actions);
  */
};

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
      cb('REQUIREMENT_ALREADY_PENDING',i);
      return;
    }
    var key = requirementswoffers[i].key;
    createactions.push(['set',[i],key==='null'?undefined:key]);
  }
  this.data.commit('creating_requirement',createactions);
  for(var i in requirementswoffers){
    var r = requirementswoffers[i];
    var mr = this.self.requirements[i];
    var d = this.data;
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
    f.setOffer(r.offer,function(){},user);
  }
  console.log('requirementwoffer set',this.data.dataDebug());
  cb('OK');
}
startwoffer.params = 'originalobj';


module.exports = {
  errors:errors,
  init:init,
  start:start,
  startwoffer:startwoffer
};
