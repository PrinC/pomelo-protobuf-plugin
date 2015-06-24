var fs = require('fs');
var path = require('path');
var protobuf = require("protobufjs");
var SERVER = 'server';
var CLIENT = 'client';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);
var crypto = require('crypto');

module.exports = function(app, opts) {
  return new Component(app, opts);
};

var Component = function(app, opts) {
  this.app = app;
  this.version = 0;
  this.watchers = {};
  opts = opts || {}; this.serverProtosPath = opts.serverProtos || '/config/serverProtos.json';
  this.clientProtosPath = opts.clientProtos || '/config/clientProtos.json';
};

var pro = Component.prototype;

pro.name = '__decodeIO__protobuf__';

pro.start = function(cb) {
  this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
  this.setProtos(CLIENT, path.join(this.app.getBase(), this.clientProtosPath));
  this.updateVersion();
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
};

pro.updateVersion = function() {
  var md5 = crypto.createHash('md5');    
  md5.update(JSON.stringify(this.serverProtos) + JSON.stringify(this.clientProtos));
  this.version = md5.digest('hex'); 
}
