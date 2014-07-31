var RandomBytes = require('crypto').randomBytes,
  executable = require('hersexecutable'),
  isExecutable = executable.isA,
  execRun = executable.run,
  execCall = executable.call,
  execApply = executable.apply,
  Timeout = require('herstimeout');

var errors = {
  'NO_BIDDING_ON_THIS_REQUIREMENT':{message:'This requirement does not support bidding'},
  'NO_OFFERS_ON_THIS_REQUIREMENT':{message:'This requirement does not support offers'},
  'INTERNAL_ERROR':{message:'An internal error has occured: [error]. Please contact the software vendor'},
  'DUPLICATE_OFFER_ID': {message:'Offer could not be set, there is already offer [offerid] pending',params:['offerid']},
  'BID_REFUSED':{message:'Your bid has been refused'},
  'OFFER_REFUSED':{message:'Your offer has been refused'},
  'DO_OFFER':{message:'Give your final offer on [offerid]',params:['offerid']},
  'ACCEPTED':{message:'Your bid [bid] has been accepted, reference: [reference]',params:['reference','bid']},
  'INVALID_OFFER_ID':{message:'Your offer id [offerid] is invalid',params:['offerid']},
  'OFFER_SET':{message:'Offer set at [offerid]',params:['offerid']},
  'OFFER_ALREADY_SET':{message:'Offer is already set'}
};


function init(){
  this.self.counter = 0;
};

function offerTickOut(t,to,oid,tocb, user){
  if(typeof to !== 'number'){return;}
  if(!t.self.offertimeouts[oid]){
    return;
  }
  execCall(tocb,to);
  if(to>0){
    to--;
    t.self.offertimeouts[oid] = {timeout:Timeout.set(offerTickOut,1000,t,to,oid,tocb),cb:tocb};
  }else{
    nullOfferTriggerer(t,oid,user);
  }
};

function nullOfferTriggerer(t,oid, tuser){
  //console.log('timed out, should cancel the offer ...',oid);
  if(t&&t.self && t.self.offer){
    t.self.offer({offerid:oid}, undefined, tuser);
  }
}

function setOffer(data4json,timeout,timeoutcb,offerid,cb,user){
  if(!isExecutable(cb)){
    return;
  }
  if(typeof data4json === 'object'){
    data4json = JSON.stringify(data4json);
  }
  if(offerid===null){
    this.self.counter++;
    if(this.self.counter>1000000000){
      this.self.counter=1;
    }
    offerid = this.self.counter;
  }
  var actions = [];
  var offersel = this.data.element(['offers']);
  if(!offersel){
    actions.push(['set',['offers']]);
  }else{
    if(offersel.element([offerid])){
      execApply(cb,['DUPLICATE_OFFER_ID',offerid]);
      return;
      console.trace();
      console.log(offersel.dataDebug());
      console.log('duplicate offerid',offerid);
      process.exit(0);
    }
  }
  actions.push(['set',['offers',offerid],user.fullname()]);
  actions.push(['set',['offers',offerid,'data'],[data4json,undefined,user.fullname()]]);
  if(timeout>0){
    if(!this.self.offertimeouts){
      this.self.offertimeouts = {};
    }
    if(!isExecutable(timeoutcb)){
      this.self.offertimeouts[offerid] = {timeout:Timeout.set(nullOfferTriggerer,timeout,this,offerid,user)};
    }else{
      this.self.offertimeouts[offerid] = {timeout:Timeout.set(offerTickOut,1000,this,timeout,offerid,timeoutcb),cb:timeoutcb};
      offerTickOut(this,timeout,offerid,timeoutcb, user);
    }
  }
  this.data.commit('set_offer',actions);
  execApply(cb,['OFFER_SET',offerid]);
}
setOffer.params=['data4json','timeout','timeoutcb','offerid'];
setOffer.defaults = {offerid:null,timeout:0,timeoutcb:null};


removeOffer = function (oid) {
  this.data.commit ('remove_offer', [ ['remove', ['offers', oid]] ]);
}

function bidAccepter(cb,acceptobj){
  this.self.counter++;
  execApply(cb,['ACCEPTED',RandomBytes(8).toString('hex')+this.self.counter,acceptobj]);
  execRun(this.self.notifyDone);
};

function offerAccepter(cb,id,acceptobj){
  this.self.counter++;
  removeOffer.call(this,id);
  execApply(cb,['ACCEPTED',RandomBytes(8).toString('hex')+this.self.counter,acceptobj]);
};

function offerer(cb,user,offerobj){
  this.self.setOffer(offerobj,function(errc,errp){
    if(errc==='OFFER_SET'){
      execApply(cb,['DO_OFFER',errp[0]]);
    }
  },user);
};

function bidRefuser(cb,args){
  args = Array.prototype.slice.call(args);
  args.unshift('BID_REFUSED');
  execApply(cb,args);
}

function offerRefuser(id,cb,args){
  args = Array.prototype.slice.call(args);
  removeOffer.call(this, id);
  args.unshift('OFFER_REFUSED');
  execApply(cb,args);
}

function doCall(callname,cb, id, user){
  var t = this;
  var args = Array.prototype.slice.call(arguments,3);
  switch(callname){
    case 'onBid':
      args.push(function(acceptobj){bidAccepter.call(t,cb,acceptobj)},function(offerobj){offerer.call(t,cb,user,offerobj)},function(){bidRefuser.call(t,cb,arguments)});
      break;
    case 'onOffer':
      args.push(function(acceptobj){offerAccepter.call(t,cb,id,acceptobj)},function(offerobj){offerer.call(t,cb,user,offerobj)},function(){offerRefuser.call(t,id,cb,arguments)});
      break;
  }
  this.self.cbs[callname].apply(this.self.functionality.SELF,args);
};

function bid(paramobj,cb,user){
  if(!this.self.cbs.onBid){
    cb('NO_BIDDING_ON_THIS_REQUIREMENT');
  }else{
    doCall.call(this,'onBid',cb, null, user,paramobj);
  }
};
bid.params = 'originalobj';

function offer(paramobj,cb,user){
  if(!isExecutable(cb)){
    return;
  }
  if(!this.self.cbs.onOffer){
    execCall(cb,'NO_OFFERS_ON_THIS_REQUIREMENT');
    return;
  }
  //console.log('offer',paramobj,offerid);
  var offerid = paramobj.offerid;
  if(this.self.offertimeouts && this.self.offertimeouts[offerid]){
    var to = this.self.offertimeouts[offerid];
    Timeout.clear(to.timeout);
    if(to.cb){
      execRun(to.cb);
    }
    delete this.self.offertimeouts[offerid];
  }
  var offerel = this.data.element(['offers',offerid]);
  if(!offerel){
    console.log('no offerid',offerid,'on',this.data.element(['offers']).dataDebug(),'for',user.fullname(),this.self.counter);
    execApply(cb,['INVALID_OFFER_ID',offerid]);
    //process.exit(0);
    return;
  }
  delete paramobj.offerid;
  //if (Object.keys(paramobj).length === 0) paramobj = null;
  //console.log('offer',paramobj,offerid);
  doCall.call(this,'onOffer',cb, offerid, user,paramobj,JSON.parse(offerel.element(['data']).value()));
};
offer.params = 'originalobj';

function confirm(paramobj,cb){
};
confirm.params = 'originalobj';

module.exports = {
  errors:errors,
  init:init,
  bid:bid,
  offer:offer,
  setOffer:setOffer
};
