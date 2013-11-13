var os = require('os');

var errors = {
};

function init(){
  this.data.commit('system init',[
    ['set',['memoryusage'],[0,undefined,'system']],
    ['set',['memoryavailable'],[0,undefined,'system']]
  ]);
  this.data.onNewTransaction.attach((function(_d){
    var data = _d;
    var lastChange;
    return function(){
      var now = (new Date()).getTime();
      if(lastChange&&(now-lastChange<10000)){
        return;
      }
      lastChange = now;
      var actions = [];
      var mu = data.element(['memoryusage']).value();
      var mmu = Math.floor(process.memoryUsage().rss/1024/1024);
      if(mu!==mmu){
        actions.push(['set',['memoryusage'],[mmu,undefined,'system']]);
      }
      var ma = data.element(['memoryavailable']).value();
      var mma = Math.floor(os.freemem()/1024/1024);
      if(ma!==mma){
        actions.push(['set',['memoryavailable'],[mma,undefined,'system']]);
      }
      if(actions.length){
        console.log('commiting memoryusagechanged',now);
        setTimeout(function(){data.commit('memoryusagechanged',actions);},1);
      }
    };
  })(this.data));
};

module.exports = {
  errors : errors,
  init : init
};
