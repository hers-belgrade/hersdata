var util = require('util');
var vm = require('vm');
var fs = require('fs');

function codeOf(filename){
  try{
    return fs.readFileSync(filename);
  }
  catch(e){
    return '';
  }
};

module.exports = {
  codeOf : codeOf,
  Hive : require('./datahive'),
	helpers: require('./helpers')
};

