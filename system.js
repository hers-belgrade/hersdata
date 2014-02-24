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
  var mu = data.element(['memoryusage']).value();
  var mmu = Math.floor(process.memoryUsage().rss/1024/1024);
  var actions = [];
  if(m.utilization){
    actions.push(['set',['CPU'],[m.utilization,undefined,'dcp']]);
  }
  if(m.delay){
    actions.push(['set',['exec_delay'],[m.delay,undefined,'dcp']]);
  }
  if(m.queue && m.queue.current){
    actions.push(['set',['exec_queue'],[m.queue.current,undefined,'dcp']]);
  }
  if(nm.traffic){
    if(nm.traffic.rx){
      actions.push(['set',['network_in'],[nm.traffic.rx,undefined,'dcp']]);
    }
    if(nm.traffic.tx){
      actions.push(['set',['network_out'],[nm.traffic.tx,undefined,'dcp']]);
    }
  };
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
