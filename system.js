var os = require('os'),
  Timeout = require('herstimeout'),
  ReplicatorCommunication = require('./replicatorcommunication');

var errors = {
};

function doMetrics(data){
  var m = Timeout.metrics();
  console.log('timeout metrics',m);
  var nm = ReplicatorCommunication.metrics();
  console.log('network metrics',nm);
  var actions = [];
  var mu = data.element(['memoryusage']).value();
  var mmu = Math.floor(process.memoryUsage().rss/1024/1024);
  console.log('memory usage',mmu);
  if(mu!==mmu){
    actions.push(['set',['memoryusage'],[mmu,undefined,'system']]);
  }
  var ma = data.element(['memoryavailable']).value();
  var mma = Math.floor(os.freemem()/1024/1024);
  if(ma!==mma){
    actions.push(['set',['memoryavailable'],[mma,undefined,'system']]);
  }
  if(actions.length){
    //console.log('commiting memoryusagechanged',now);
    console.log('dcp',data.instanceCounts());
    data.commit('system_metrics_changed',actions);
  }
  Timeout.set(doMetrics,10000,data);
};

function init(){
  this.data.commit('system_init',[
    ['set',['memoryusage'],[0,undefined,'system']],
    ['set',['memoryavailable'],[0,undefined,'system']]
  ]);
  doMetrics(this.data);
};

module.exports = {
  errors : errors,
  init : init
};
