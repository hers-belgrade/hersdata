var os = require('os');

var errors = {
};

function init(){
  this.data.commit('system init',[
    ['set',['memoryusage'],[0,undefined,'system']],
    ['set',['memoryavailable'],[0,undefined,'system']]
  ]);
  console.log(this.data);
  this.data.onNewTransaction.attach((function(_d){
    var data = _d;
    return function(){
      var actions = [];
      var mu = _d.element(['memoryusage']).value();
      var mmu = Math.floor(process.memoryUsage().rss/1024/1024);
      if(mu!==mmu){
          actions.push(['set',['memoryusage'],[mmu,undefined,'system']]);
      }
      var ma = _d.element(['memoryavailable']).value();
      var mma = Math.floor(os.freemem()/1024/1024);
      if(ma!==mma){
          actions.push(['set',['memoryavailable'],[mma,undefined,'system']]);
      }
      if(actions.length){
        _d.commit('memoryusagechanged',actions);
      }
    };
  })(this.data));
};

function connectionCountChanged(){
};

module.exports = {
  errors : errors,
  init : init,
  connectionCountChanged : connectionCountChanged
};
