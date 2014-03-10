var os = require('os'),
  Timeout = require('herstimeout'),
  ReplicatorCommunication = require('./ReplicatorCommunication');

var errors = {
};

function doMetrics(data){
  var m = Timeout.metrics();
  //console.log('timeout metrics',m);
  var nm = ReplicatorCommunication.metrics();
  //console.log('network metrics',nm);
  var mu = data.element(['memoryusage']).value();
  var mmu = Math.floor(process.memoryUsage().rss/1024/1024);
  var actions = [];
  actions.push(['set',['CPU'],[m.utilization||0,undefined,'dcp']]);
  actions.push(['set',['exec_delay'],[((~~(m.delay*100)/100)||0),undefined,'dcp']]);
  actions.push(['set',['exec_queue'],[m.queue && m.queue.current ? m.queue.current : 0,undefined,'dcp']]);
  actions.push(['set',['network_in'],[(nm.traffic&&nm.traffic.rx ? nm.traffic.rx : 0),undefined,'dcp']]);
  actions.push(['set',['network_out'],[(nm.traffic&&nm.traffic.tx ? nm.traffic.tx : 0),undefined,'dcp']]);
  //console.log('memory usage',mmu);
  if(mu!==mmu){
    actions.push(['set',['memoryusage'],[mmu,undefined,'system']]);
  }
  var ma = data.element(['memoryavailable']).value();
  var mma = Math.floor(os.freemem()/1024/1024);
  if(ma!==mma){
    actions.push(['set',['memoryavailable'],[mma,undefined,'system']]);
  }
  var ic = data.instanceCounts();
  //console.log('commiting memoryusagechanged',now);
  //console.log('dcp',data.instanceCounts());
  actions.push(['set',['dcp_branches'],[ic && ic.collections ? ic.collections : 0,undefined,'dcp']]);
  actions.push(['set',['dcp_leaves'],[ic && ic.scalars ? ic.scalars : 0,undefined,'dcp']]);
  data.commit('system_metrics_changed',actions);
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
