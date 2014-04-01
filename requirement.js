var RandomBytes = require('crypto').randomBytes,
  Timeout = require('herstimeout');

var errors = {
  'NO_BIDDING_ON_THIS_REQUIREMENT':{message:'This requirement does not support bidding'},
  'NO_OFFERS_ON_THIS_REQUIREMENT':{message:'This requirement does not support offers'},
  'INTERNAL_ERROR':{message:'An internal error has occured: [error]. Please contact the software vendor'},
  'BID_REFUSED':{message:'Your bid has been refused'},
  'DO_OFFER':{message:'Give your final offer on [offerid]',params:['offerid']},
  'ACCEPTED':{message:'Your bid [bid] has been accepted, reference: [reference]',params:['reference','bid']},
  'INVALID_OFFER_ID':{message:'Your offer id [offerid] is invalid',params:['offerid']},
  'OFFER_SET':{message:'Offer set at [offerid]',params:['offerid']},
  'OFFER_ALREADY_SET':{message:'Offer is already set'}
};


function init(){
  this.self.counter = 0;
};

function setOffer(jsondata,offerid,cb,user){
  if(typeof jsondata === 'object'){
    jsondata = JSON.stringify(jsondata);
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
  actions.push(['set',['offers',offerid,'data'],[jsondata,undefined,user.username+'@'+user.realmname]]);
  this.data.commit('set_offer',actions);
  cb('OFFER_SET',offerid);
}
setOffer.params=['jsondata','offerid'];
setOffer.defaults = {offerid:null};

function doCall(callname,cb,user){
  var t = this;
  var args = Array.prototype.slice.call(arguments,3);
  args.unshift(user);
  args.push(function accept(acceptobj){
    t.self.counter++;
    cb('ACCEPTED',RandomBytes(8).toString('hex')+t.self.counter,acceptobj,'Bid accepted');
    t.notifyDone();
  },function dooffer(jsondata,options){
    var u = user;
    t.self.setOffer({jsondata:jsondata},function(errc,errp){
      if(errc==='OFFER_SET'){
        cb('DO_OFFER',errp[0]);
        if(options){
          if(options.timeout){
            Timeout.set(function(t,oid){t.self.offer({offerid:oid})},options.timeout,t,errp[0]);
          }
        }
      }
    },user);
  },function refuse(){
    var args = Array.prototype.slice.call(arguments);
    args.unshift('BID_REFUSED');
    cb.apply(null,args);
  });
  this.self.cbs[callname].apply(this,args);
};

function bid(paramobj,cb,user){
  if(!this.self.cbs.onBid){
    cb('NO_BIDDING_ON_THIS_REQUIREMENT');
  }else{
    doCall.call(this,'onBid',cb,user,paramobj);
  }
};
bid.params = 'originalobj';

function offer(paramobj,cb,user){
  if(!this.self.cbs.onOffer){
    cb('NO_OFFERS_ON_THIS_REQUIREMENT');
    return;
  }
  var offerid = paramobj.offerid;
  var offerel = this.data.element(['offers',offerid]);
  if(!offerel){
    cb('INVALID_OFFER_ID',offerid);
    return;
  }
  delete paramobj.offerid;
  doCall.call(this,'onOffer',cb,user,paramobj,JSON.parse(offerel.element(['data']).value()));
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
