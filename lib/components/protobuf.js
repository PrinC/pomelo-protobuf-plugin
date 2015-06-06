var fs = require('fs');
var path = require('path');
var protobuf = require("protobufjs");
var SERVER = 'server';
var CLIENT = 'client';
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
};

var pro = Component.prototype;

pro.name = '__decodeIO__protobuf__';

pro.start = function(cb) {
  this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
  this.setProtos(CLIENT, path.join(this.app.getBase(), this.clientProtosPath));

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
/*
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
  */
  return route.replace(/\./g, '_');
}

pro.encode = function(route, message) {
  var msgName = this.getMessageName(SERVER, route);
  var Encoder = this.encodeBuilder.build(msgName);
  var encoder = new Encoder(message);
  return encoder.encodeNB();
};

pro.decode = function(route, message) {
  var msgName = this.getMessageName(CLIENT, route);
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
    this.serverProtos = require(path);
    this.encodeBuilder = protobuf.loadJson(this.serverProtos);
  }

  if(type === CLIENT) {
    this.clientProtos = require(path);
    this.decodeBuilder = protobuf.loadJson(this.clientProtos);
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

pro.stop = function(force, cb) {
  for (var type in this.watchers) {
    this.watchers[type].close();
  }
  this.watchers = {};
  process.nextTick(cb);
};
