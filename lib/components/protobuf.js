var fs = require('fs');
var path = require('path');
var protobuf = require("protobufjs");
var SERVER = 'server';
var CLIENT = 'client';
var MSG_PREFIX = 'a';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

module.exports = function(app, opts) {
  return new Component(app, opts);
};

var Component = function(app, opts) {
  this.app = app;
  this.version = 0;
  this.watchers = {};
  opts = opts || {};
  this.serverProtosPath = opts.serverProtos || '/config/serverProtos.json';
  this.clientProtosPath = opts.clientProtos || '/config/clientProtos.json';
  this.serverProtoMap = {};
  this.clientProtoMap = {};
  this.keyCount = 0;
};

var pro = Component.prototype;

pro.name = '__decodeIO__protobuf__';

pro.start = function(cb) {
  this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
  this.setProtos(CLIENT, path.join(this.app.getBase(), this.clientProtosPath));

  this.encodeBuilder = protobuf.loadProto(this.serverProtos);
  this.decodeBuilder = protobuf.loadProto(this.clientProtos);
  process.nextTick(cb);
};

pro.check = function(type, route) {
  var msgName = this.getMessageName(type, route);
  switch(type) {
    case SERVER:
      if(!this.encodeBuilder) {
        logger.warn('decodeIO encode builder is undefined.');
        return null;
      }
      return this.encodeBuilder.lookup(msgName);
      break;
    case CLIENT:
      if(!this.decodeBuilder) {
        logger.warn('decodeIO decode builder is undefined.');
        return null;
      }
      return this.decodeBuilder.lookup(msgName);
      break;
    default:
      throw new Error('decodeIO meet with error type of protos, type: ' + type + ' route: ' + route);
      break;
  }
};

pro.getMessageName = function(type, route) {
  switch(type) {
    case SERVER:
      return this.serverProtoMap[route];
      break;
    case CLIENT:
      return this.clientProtoMap[route];
      break;
    default:
      throw new Error('decodeIO meet with error type of protos, type: ' + type + ' route: ' + route);
      break;
    }
  }
}

pro.encode = function(route, message) {
  var msgName = this.getMessageName(route);
  var Encoder = this.encodeBuilder.build(msgName);
  var encoder = new Encoder(message);
  return encoder.encodeNB();
};

pro.decode = function(route, message) {
  var msgName = this.getMessageName(route);
  return this.decodeBuilder.build(msgName).decode(message);
};

pro.getProtos = function() {
  return {
    server : this.serverProtos,
    client : this.clientProtos,
    version : this.version
  };
};

pro.getVersion = function() {
  return this.version;
};

pro.setProtos = function(type, path) {
  if(!fs.existsSync(path)) {
    return;
  }

  if(type === SERVER) {
    this.serverProtos = this.parse(require(path));
  }

  if(type === CLIENT) {
    this.clientProtos = this.parse(require(path));
  }

  //Set version to modify time
  var time = fs.statSync(path).mtime.getTime();
  if(this.version < time) {
    this.version = time;
  }

  //Watch file
  var watcher = fs.watch(path, this.onUpdate.bind(this, type, path));
  if (this.watchers[type]) {
    this.watchers[type].close();
  }
  this.watchers[type] = watcher;
};

pro.onUpdate = function(type, path, event) {
  if(event !== 'change') {
    return;
  }

  fs.readFile(path, 'utf8' ,function(err, data) {
    try {
      if(type === SERVER) {
        this.serverProtos = JSON.parse(data);
      } else {
        this.clientProtos = JSON.parse(data);
      }

      this.version = fs.statSync(path).mtime.getTime();
      logger.debug('change proto file , type : %j, path : %j, version : %j', type, path, this.version);
    } catch(e) {
      logger.warn("change proto file error! path : %j", path);
      logger.warn(e);
    }
  });
};

pro.parse = function(type, protos) {
  var proto = '';
  var targetProtoMap;
  if (type == CLIENT)
    targetProtoMap = this.clientProtoMap;
  else 
    targetProtoMap = this.serverProtoMap;
  for (var key in protos) {
    targetProtoMap[key] = MSG_PREFIX + this.keyCount;
    this.keyCount ++;
    proto += 'message ' + targetProtoMap[key] + '{';
    for (var field in protos[key]) {
      proto += (field + '=' + protos[key][field] + ';');
    }
    proto += '}';
  }
  console.log(proto);
  return proto;
}

pro.stop = function(force, cb) {
  for (var type in this.watchers) {
    this.watchers[type].close();
  }
  this.watchers = {};
  process.nextTick(cb);
};
