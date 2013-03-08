var _ = require('underscore');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? Backbone = require('backbone') : Backbone = window.Backbone;

var Errors = require('../util/errors');
var GitCommands = require('../git/commands');
var GitOptionParser = GitCommands.GitOptionParser;

var ParseWaterfall = require('../level/parseWaterfall').ParseWaterfall;

var CommandProcessError = Errors.CommandProcessError;
var GitError = Errors.GitError;
var Warning = Errors.Warning;
var CommandResult = Errors.CommandResult;

var Command = Backbone.Model.extend({
  defaults: {
    status: 'inqueue',
    rawStr: null,
    result: '',
    createTime: null,

    error: null,
    warnings: null,
    parseWaterfall: new ParseWaterfall(),

    generalArgs: null,
    supportedMap: null,
    options: null,
    method: null

  },

  initialize: function(options) {
    this.initDefaults();
    this.validateAtInit();

    this.on('change:error', this.errorChanged, this);
    // catch errors on init
    if (this.get('error')) {
      this.errorChanged();
    }

    this.parseOrCatch();
  },

  initDefaults: function() {
    // weird things happen with defaults if you dont
    // make new objects
    this.set('generalArgs', []);
    this.set('supportedMap', {});
    this.set('warnings', []);
  },

  validateAtInit: function() {
    if (this.get('rawStr') === null) {
      throw new Error('Give me a string!');
    }
    if (!this.get('createTime')) {
      this.set('createTime', new Date().toString());
    }
  },

  setResult: function(msg) {
    this.set('result', msg);
  },

  finishWith: function(deferred) {
    this.set('status', 'finished');
    deferred.resolve();
  },

  addWarning: function(msg) {
    this.get('warnings').push(msg);
    // change numWarnings so the change event fires. This is bizarre -- Backbone can't
    // detect if an array changes, so adding an element does nothing
    this.set('numWarnings', this.get('numWarnings') ? this.get('numWarnings') + 1 : 1);
  },

  getFormattedWarnings: function() {
    if (!this.get('warnings').length) {
      return '';
    }
    var i = '<i class="icon-exclamation-sign"></i>';
    return '<p>' + i + this.get('warnings').join('</p><p>' + i) + '</p>';
  },

  parseOrCatch: function() {
    this.expandShortcuts(this.get('rawStr'));
    try {
      this.processInstants();
    } catch (err) {
      Errors.filterError(err);
      // errorChanged() will handle status and all of that
      this.set('error', err);
      return;
    }

    if (this.parseAll()) {
      // something in our parse waterfall succeeded
      return;
    }

    // if we reach here, this command is not supported :-/
    this.set('error', new CommandProcessError({
        msg: 'The command "' + this.get('rawStr') + '" isn\'t supported, sorry!'
      })
    );
  },

  errorChanged: function() {
    var err = this.get('error');
    if (err instanceof CommandProcessError ||
        err instanceof GitError) {
      this.set('status', 'error');
    } else if (err instanceof CommandResult) {
      this.set('status', 'finished');
    } else if (err instanceof Warning) {
      this.set('status', 'warning');
    }
    this.formatError();
  },

  formatError: function() {
    this.set('result', this.get('error').toResult());
  },

  expandShortcuts: function(str) {
    str = this.get('parseWaterfall').expandAllShortcuts(str);
    this.set('rawStr', str);
  },

  processInstants: function() {
    var str = this.get('rawStr');
    // first if the string is empty, they just want a blank line
    if (!str.length) {
      throw new CommandResult({msg: ""});
    }

    // then instant commands that will throw
    this.get('parseWaterfall').processAllInstants(str);
  },

  parseAll: function() {
    var str = this.get('rawStr');
    var results = this.get('parseWaterfall').parseAll(str);

    if (!results) {
      // nothing parsed successfully
      return false;
    }

    _.each(results.toSet, function(obj, key) {
      // data comes back from the parsing functions like
      // options (etc) that need to be set
      this.set(key, obj);
    }, this);
    return true;
  }
});

// command entry is for the commandview
var CommandEntry = Backbone.Model.extend({
  defaults: {
    text: ''
  }
});

exports.CommandEntry = CommandEntry;
exports.Command = Command;
