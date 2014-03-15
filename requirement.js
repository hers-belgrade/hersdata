var RandomBytes = require('crypto').randomBytes,
  Timeout = require('herstimeout');

var errors = {
  'NO_BIDDING_ON_THIS_REQUIREMENT':{message:'This requirement does not support bidding'},
  'NO_OFFERS_ON_THIS_REQUIREMENT':{message:'This requirement does not support offers'},
  'INTERNAL_ERROR':{message:'An internal error has occured: [error]. Please contact the software vendor'},
  'BID_REFUSED':{message:'Your bid has been refused'},
  'DO_OFFER':{message:'Give your final offer, your receipt is [receipt]',params:['receipt','offer']},
  'ACCEPTED':{message:'Your bid [bid] has been accepted, reference: [reference]',params:['reference','bid']},
  'INVALID_OFFER_ID':{message:'Your offer id [offerid] is invalid',params:['offerid']}
};


function init(){
  this.self.counter = 0;
  this.self.offers = {};
};

function doCall(callname,cb){
  var t = this;
  var args = Array.prototype.slice.call(arguments,2);
  args.push(function accept(acceptobj){
    t.self.counter++;
    cb('ACCEPTED',RandomBytes(8).toString('hex')+t.self.counter,acceptobj,'Bid accepted');
    t.notifyDone();
  },function dooffer(offerobj,options){
    t.self.counter++;
    var offerid = RandomBytes(8).toString('hex')+t.self.counter;
    t.self.offers[offerid] = offerobj;
    cb('DO_OFFER',t.self.offerid,offerobj);
    if(options){
      if(options.timeout){
        Timeout.set(function(t){t.offer({offerid:t.self.offerid})},options.timeout,t);
      }
    }
  },function refuse(){
    var args = Array.prototype.slice.call(arguments);
    args.unshift('BID_REFUSED');
    cb.apply(null,args);
  });
  this.self.cbs[callname].apply(this,args);
};

function bid(paramobj,cb){
  if(!this.self.cbs.onBid){
    cb('NO_BIDDING_ON_THIS_REQUIREMENT');
  }else{
    doCall.call(this,'onBid',cb,paramobj);
  }
};
bid.params = 'originalobj';

function offer(paramobj,cb){
  if(!this.self.cbs.onOffer){
    cb('NO_OFFERS_ON_THIS_REQUIREMENT');
    return;
  }
  var offerid = paramobj.offerid;
  var offer = this.offers[offerid];
  if(!offer){
    cb('INVALID_OFFER_ID',offerid);
  }
  delete paramobj.offerid;
  delete this.self[offerid];
  doCall.call(this,'onOffer',cb,paramobj,offer);
};
offer.params = 'originalobj';

function confirm(paramobj,cb){
};
confirm.params = 'originalobj';

module.exports = {
  errors:errors,
  init:init,
  bid:bid,
  offer:offer
};
