var RandomBytes = require('crypto').randomBytes,
  Timeout = require('herstimeout');

var errors = {
  'NO_BIDDING_ON_THIS_REQUIREMENT':{message:'This requirement does not support bidding'},
  'NO_OFFERS_ON_THIS_REQUIREMENT':{message:'This requirement does not support offers'},
  'INTERNAL_ERROR':{message:'An internal error has occured: [error]. Please contact the software vendor'},
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

function setOffer(data4json,timeout,offerid,cb,user){
  if(typeof data4json === 'object'){
    data4json = JSON.stringify(data4json);
  }
  var actions = [];
  var offersel = this.data.element(['offers']);
  if(!offersel){
    actions.push(['set',['offers']]);
  }
  if(offerid===null){
    this.self.counter++;
    if(this.self.counter>1000000000){
      this.self.counter=1;
    }
    offerid = this.self.counter;
  }
  actions.push(['set',['offers',offerid]]);
  actions.push(['set',['offers',offerid,'data'],[data4json,undefined,user.username+'@'+user.realmname]]);
  if(timeout>0){
    if(!this.self.offertimeouts){
      this.self.offertimeouts = {};
    }
    this.self.offertimeouts[offerid] = Timeout.set(function(t,oid){
      console.log('timed out, should cancel the offer ...',oid);
      t&&t.self && t.self.offer && t.self.offer({offerid:oid})
    },timeout,this,offerid);
  }
  this.data.commit('set_offer',actions);
  cb('OFFER_SET',offerid);
}
setOffer.params=['data4json','timeout','offerid'];
setOffer.defaults = {offerid:null,timeout:0};


removeOffer = function (oid) {
  this.data.commit ('remove_offer', [ ['remove', ['offers', oid]] ]);
}

function doCall(callname,cb, id, user){
  var t = this;
  var args = Array.prototype.slice.call(arguments,3);
  args.push(function accept(acceptobj){
    t.self.counter++;
    (callname === 'onOffer') && removeOffer.call(t, id);
    cb('ACCEPTED',RandomBytes(8).toString('hex')+t.self.counter,acceptobj);
  },function dooffer(offerobj){
    var u = user;
    t.self.setOffer(offerobj,function(errc,errp){
      if(errc==='OFFER_SET'){
        cb('DO_OFFER',errp[0]);
      }
    },user);
  },function refuse(){
    (callname === 'onOffer') && removeOffer.call(t, id);
    var args = Array.prototype.slice.call(arguments);
    args.unshift(callname === 'onBid' ? 'BID_REFUSED' : 'OFFER_REFUSED');
    cb.apply(null,args);
  });
  //console.log(args);
  this.self.cbs[callname].apply(this,args);
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
  if(!this.self.cbs.onOffer){
    cb('NO_OFFERS_ON_THIS_REQUIREMENT');
    return;
  }
  //console.log('offer',paramobj,offerid);
  var offerid = paramobj.offerid;
  if(this.self.offertimeouts && this.self.offertimeouts[offerid]){
    Timeout.clear(this.self.offertimeouts[offerid]);
    delete this.self.offertimeouts[offerid];
  }
  var offerel = this.data.element(['offers',offerid]);
  if(!offerel){
    cb('INVALID_OFFER_ID',offerid);
    return;
  }
  delete paramobj.offerid;
  if (Object.keys(paramobj).length === 0) paramobj = null;
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
