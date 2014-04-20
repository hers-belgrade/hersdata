var errors = {
  'INVALID_REQUIREMENTNAMES' : {message:'Requirements to start may be a string, commadelimited string or an array'},
  'REQUIREMENT_NOT_RECOGNIZED' : {message:'Requirement [requirement] cannot be started because it is not in the initial map', params:['requirement']},
  'REQUIREMENT_ALREADY_PENDING' : {message:'Requirement [requirement] is already pending', params:['requirement']}
};

function init(){
  var actions = [];
  this.data.commit('requirements_init',actions);
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
  var initactions = [];
  for(var i in requirements){
    var r = requirements[i];
    var mr = this.self.requirements[i];
    var d = this.data;
    this.data.element([i]).attach('./requirement',{
      cbs:mr,
      notifyDone:(function(_mr,_i){
      var mr = _mr, i=_i;
      return function(){
        d.commit('requirement_'+i+'_done',[
          ['remove',[i]]
        ]);
      };
    })(mr,i)});
    for(var ri in r){
      var key = r[ri] === null ? undefined : r[ri];
      initactions.push(['set',[i,ri],[key]]);
    }
  }
  this.data.commit('setting_requirement',initactions);
  console.log('requirement set',this.data.dataDebug());
}
start.params = 'originalobj';


module.exports = {
  errors:errors,
  init:init,
  start:start
};
