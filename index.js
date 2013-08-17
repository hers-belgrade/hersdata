var util = require('util');
var vm = require('vm');
var fs = require('fs');

/*NEED REWORK ....*/
function codeAppendedFromFiles(paths){
  var code = '';
  for(var i in paths){
    code += fs.readFileSync(paths[i]);
    code += "\n";
  }
  return code;
}

function glueCode(paths){
  var code = codeAppendedFromFiles([__dirname+'/hooks.js',__dirname+'/datacopy.js',__dirname+'/datamaster.js']);
  if(util.isArray(paths)){
    code += codeAppendedFromFiles(paths);
  }
  if(typeof paths === 'string'){
    code += fs.readFileSync(paths);
  }
  return code;
}

function execCode(code){
  var ret = function() {
    vm.runInThisContext(code, 'glueCode');
  }.bind(this);
  return ret;
};


module.exports = {
  glueCode : glueCode,
  execCode : execCode,
  Hive : require('./datahive'),
	helpers: require('./helpers')
};

