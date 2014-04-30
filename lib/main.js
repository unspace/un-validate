void function() {

Em.TEMPLATES['ember/validate/field'] = Em.Handlebars.compile(
  '{{view view.controlView viewName="control"}}\n' +
  '{{#if view.isInvalid}}\n' +
    '{{#unbound if view.isInline}}\n' +
      '{{#view Em.Validate.InlineErrorView}}\n' +
        '{{view.errorMessage}}\n' +
      '{{/view}}\n' +
    '{{/unbound}}\n' +
  '{{/if}}\n'
);

Em.TEMPLATES['ember/validate/errors'] = Em.Handlebars.compile(
  '{{#if view.errors}}\n' +
    '<ul class="validation-error-messages">\n' +
      '{{#each error in view.errors}}\n' +
        '<li class="validation-error-message">\n' +
          '{{#if error.property}}\n' +
            '{{error.propertyName}}\n' +
          '{{/if}}\n' +
          '{{error.message}}\n' +
        '</li>\n' +
      '{{/each}}\n' +
    '</ul>\n' +
  '{{/if}}\n'
);

Em.Validate = {};

var decamelize = Em.String.decamelize,
    capitalize = Em.String.capitalize,
    trim       = Em.$.trim,
    utils,
    computed,
    config;

config = {
  EMAIL_RE: /^[^@]+@[^@]+$/,
  DEFAULT_INLINE_ERROR_TAG_NAME: 'div',
  DEFAULT_FIELD_TAG_NAME: 'span',
  DEFAULT_FIELD_TARGET: 'controller',
  DEFAULT_FIELD_TEMPLATE_NAME: 'ember/validate/field',
  DEFAULT_ERRORS_TEMPLATE_NAME: 'ember/validate/errors',
  BLANK_ERROR_MESSAGE: 'must be provided'
};

config.lookup = function(name) {
  var value = config[name];
  if (value === undefined) {
    throw new Error('Em.Validate.config.' + value + ' does not exist');
  }
  return value;
};

utils = {
  isThenable: function(value) {
    return (typeof value === 'object') && (value.then !== undefined);
  },

  isBlank: function(val) {
    return trim(val) === '';
  },

  isPresent: function(val) {
    return trim(val) !== '';
  },

  toHumanString: function(val) {
    return capitalize(decamelize(val).replace(/_/g, ' '));
  },

  toTitleCase: function (str) {
    return str.replace(/\w\S*/g, function(word) {
      return capitalize(word);
    });
  },

  resolveTarget: function(context, pathOrObj) {
    if (!pathOrObj) {
      pathOrObj = config.DEFAULT_FIELD_TARGET;
    }

    var isString = (typeof pathOrObj === 'string');
    return isString ? context.get(pathOrObj) : pathOrObj;
  }
};

computed = {
  resolveTarget: function() {
    return Em.computed(function() {
      return utils.resolveTarget(this, this.get('target'));
    }).property('target');
  },

  configLookup: function(name) {
    return Em.computed(function() {
      return config.lookup(name);
    }).property();
  }
};

Em.Validate.utils    = utils;
Em.Validate.computed = computed;
Em.Validate.config   = config;

}.call(this);


/// core
void function() {

var utils         = Em.Validate.utils,
    config        = Em.Validate.config,
    isThenable    = utils.isThenable,
    isBlank       = utils.isBlank,
    isPresent     = utils.isPresent,
    toHumanString = utils.toHumanString,
    toTitleCase   = utils.toTitleCase,
    EMAIL_RE            = config.EMAIL_RE,
    BLANK_ERROR_MESSAGE = config.BLANK_ERROR_MESSAGE;

function buildErrorMessage(context, defaultMsg) {
  var value = (context.options.message || defaultMsg),
      type  = Em.typeOf(value),
      mkmsg = type === 'function' ? value : (function() { return value; });

  return mkmsg(context);
}

function newOutcomePromise(validator) {
  return new Em.RSVP.Promise(function(resolve, reject) {
    var outcomeProxy = {
      error: function(e) {
        reject(e);
      },

      valid: function() {
        resolve({ isValid: true });
      },

      invalid: function(property, message) {
        var err = { isValid: false };
        if (arguments.length === 1) {
          err.property = null;
          err.message  = property;
        } else {
          err.property = property;
          err.message  = message;
        }
        resolve(err);
      }
    };

    var response = validator(outcomeProxy);

    if (isThenable(response)) {
      response.then(null, function(e) {
        outcomeProxy.error(e);
      });
    }
  });
}

Em.Validate.Error = Em.Object.extend({
  property: null,
  message:  null,

  propertyName: Em.computed(function() {
    var property = this.get('property');

    if (!property) {
      return null;
    } else {
      return toHumanString(property);
    }
  }).property('property')
});

Em.Validate.Errors = Em.ArrayProxy.extend({
  hasItems: Em.computed.bool('length'),
  isEmpty:  Em.computed.not('hasItems'),

  add: function(errors) {
    [].concat(errors).forEach(function(error) {
      this.pushObject(Em.Validate.Error.create(error));
    }, this);
  },

  on: function(prop) {
    return this.filterBy('property', prop);
  },

  clearOn: function(prop) {
    var existing = this.on(prop);
    existing.forEach(function(obj) {
      this.removeObject(obj);
    }, this);
  }
});

Em.Validate.Validatable = Em.Mixin.create({
  init: function() {
    this._super();
    this.set('validationErrors', Em.Validate.Errors.create({ content: [] }));
    this.set('validationOutcomes', []);
  },

  isValidating: false,
  isValid:      Em.computed.oneWay('validationErrors.isEmpty'),
  isInvalid:    Em.computed.not('isValid'),

  willValidate: Em.K,
  didValidate:  Em.K,

  validates: function(validator) {
    var promise = newOutcomePromise(validator.bind(this));

    this.get('validationOutcomes').push(promise);
    return promise;
  },

  clearValidations: function() {
    this.get('validationErrors').clear();
    this.get('validationOutcomes').clear();
  },

  validate: function() {
    var obj      = this,
        outcomes = this.get('validationOutcomes'),
        errors   = obj.get('validationErrors');

    return new Em.RSVP.Promise(function(resolve, reject) {
      function done(results) {
        results.forEach(function(result) {
          if (!result.isValid) {
            errors.add(result);
          }
        });

        obj.set('isValidating', false);
        obj.didValidate(obj.get('isValid'), errors);
        resolve(obj.get('isValid'), errors);
      }

      function fail(exception) {
        obj.set('isValidating', false);
        reject(exception);
      }

      obj.set('isValidating', true);
      obj.clearValidations();
      obj.willValidate();
      Em.RSVP.all(outcomes).then(done, fail);
    });
  },

  validatesProperty: function(property, options, validator) {
    if (!options) {
      options = {};
    }

    var value = this.get(property);

    this.validates(function(outcome) {
      if (options.allowBlank && !isBlank(value)) {
        return outcome.valid();
      } else if (isBlank(value)) {
        return outcome.invalid(property, BLANK_ERROR_MESSAGE);
      }

      validator.call({
        options: options,

        property: {
          name:  property,
          value: value
        },

        valid: function() {
          outcome.valid();
        },

        invalid: function(defaultMsg) {
          outcome.invalid(property, buildErrorMessage({
            property: property,
            value:    value,
            options:  options
          }, defaultMsg));
        }
      }, value);
    });
  },

  validatesFormat: function(property, options) {
    this.validatesProperty(property, options, function(value) {
      var regex = this.options.regex;

      if (regex.test(value)) {
        this.valid();
      } else {
        this.invalid('has incorrect format');
      }
    });
  },

  validatesLength: function(property, options) {
    if (!options) {
      options = {};
    }

    var min = options.min,
        max = options.max;

    this.validatesProperty(property, options, function(value) {
      if (!value || !value.length) {
        return this.invalid('must be provided');
      }

      if (value.length === 1 && min === 1) {
        return this.invalid('must be provided');
      }

      if (value.length < min) {
        return this.invalid('must be at least ' + min + ' characters');
      }

      if (value.length > max) {
        return this.invalid('must be no longer than ' + max + ' characters');
      }

      this.valid();
    });
  },

  validatesEmail: function(property, options) {
    if (!options) {
      options = {};
    }

    if (!options.message) {
      options.message = 'is not a valid address';
    }

    if (!options.regex) {
      options.regex = EMAIL_RE;
    }

    this.validatesFormat(property, options);
  },

  validatesNumeric: function(property, options) {
    this.validatesProperty(property, options, function(value) {
      if (Em.$.isNumeric(value)) {
        this.valid();
      } else {
        this.invalid('is not a number');
      }
    });
  },

  validatesPresence: function(property, options) {
    if (!options) {
      options = {};
    }

    options.allowBlank = false;

    this.validatesProperty(property, options, function(value) {
      if (isPresent(value)) {
        this.valid();
      } else {
        this.invalid('must be provided');
      }
    });
  }
});

Em.Validatable = Em.Validate.Validatable;

}.call(this);

// helpers
void function() {

var propertiesFromHTMLOptions = Em.Handlebars.ViewHelper.propertiesFromHTMLOptions,
    fmt           = Em.String.fmt,
    config        = Em.Validate.config,
    utils         = Em.Validate.utils,
    computed      = Em.Validate.computed,
    toHumanString = utils.toHumanString,
    toTitleCase   = utils.toTitleCase;

var EXTENDED_CONTROLS = [
  'TextField', // Em.Validate.TextField
  'TextArea',  // Em.Validate.TextArea
  'Select',    // Em.Validate.Select
  'Checkbox'   // Em.Validate.Checkbox
];

Em.Validate.ControlSupport = Em.Mixin.create({
  value:   Em.computed.alias('parentView.value'),
  isValid: Em.computed.oneWay('parentView.isValid'),

  classNameBindings: ['isValid:valid:invalid'],

  focusIn: function() {
    this.get('parentView').clearErrors();
  }
});

EXTENDED_CONTROLS.forEach(function(name) {
  Em.Validate[name] = Em[name].extend(Em.Validate.ControlSupport);
});

Em.Validate.FieldView = Em.View.extend({
  templateName:      computed.configLookup('DEFAULT_FIELD_TEMPLATE_NAME'),
  classNameBindings: ['isValid:valid:invalid'],
  controlProperties: null,
  controlType:       null,
  isInline:          true,
  inline:            Em.computed.alias('isInline'),
  isInvalid:         Em.computed.oneWay('_target.isInvalid'),
  firstError:        Em.computed.oneWay('errors.firstObject'),
  errorMessage:      Em.computed.oneWay('firstError.message'),
  _target:           computed.resolveTarget(),

  init: function() {
    var errorsPath   = '_target.validationErrors',
        propertyName = this.get('for'),
        valuePath    = '_target.' + propertyName;

    this.reopen({
      errors:  Em.computed.filterBy(errorsPath, 'property', propertyName),
      value:   Em.computed.alias(valuePath)
    });

    this.set('tagName', config.lookup('DEFAULT_FIELD_TAG_NAME'));
    this._super();
  },

  clearErrors: function() {
    var property = this.get('for'),
        errors   = this.get('_target.validationErrors');

    errors.clearOn(property);
  },

  controlView: Em.computed(function() {
    var props = this.get('controlProperties'),
        type  = this.get('controlType'),
        view;

    if (type === 'checkbox') {
      view = 'Checkbox';
    } else if (type === 'select') {
      view = 'Select';
    } else if (type === 'textarea') {
      view = 'TextArea';
    } else {
      props.type = type;
      view = 'TextField';
    }

    return Em.Validate[view].extend(props);
  }).property('type')
});

Em.Validate.ErrorsView = Em.View.extend({
  templateName: computed.configLookup('DEFAULT_ERRORS_TEMPLATE_NAME'),
  isInline:     true,
  inline:       Em.computed.alias('isInline'),
  allErrors:    Em.computed.oneWay('_target.validationErrors'),
  _target:      computed.resolveTarget(),

  init: function() {
    var cp;

    if (this.get('isInline')) {
      cp = Em.computed.filter('allErrors', function(error) {
        return !error.property;
      });
    } else {
      cp = Em.computed.oneWay('allErrors');
    }

    this.reopen({ errors: cp });
    this._super();
  }
});

Em.Validate.InlineErrorView = Em.View.extend({
  classNames: ['validation-error-message'],
  errorMessage: Em.computed.oneWay('parentView.errorMessage'),

  init: function() {
    this.set('tagName', config.lookup('DEFAULT_INLINE_ERROR_TAG_NAME'));
    this._super();
  }
});

Em.Validate.LabelView = Em.View.extend({
  tagName: 'label',
  'for':   null,
  caption: null,
  template: Em.Handlebars.compile('{{unbound view._caption}}'),
  attributeBindings: ['controlElementId:for'],

  _caption: Em.computed(function() {
    var caption  = this.get('caption'),
        property;

    if (caption) {
      return caption;
    }

    property = this.get('for');
    return property && toTitleCase(toHumanString(property));
  }).property('caption'),

  init: function() {
    var fieldName     = this.get('for') + 'Field',
        controlIdPath = fmt('parentView.%@.control.elementId', [fieldName]),
        controlIdCP   = Em.computed(function() {
          return this.get(controlIdPath);
        }).property(controlIdPath);

    this.reopen({
      controlElementId: controlIdCP
    });

    this._super();
  }
});

Em.Handlebars.registerHelper('field', function(options) {
  Ember.assert('You can only pass attributes to the `field` helper, not arguments', arguments.length < 2);
  Ember.assert('You must specify a `for` attribute to define the property to be used for the field helper', !options.['for']);

  var hash = options.hash,
      type = hash.type,
      view,
      controlProperties;

  delete hash.type;
  controlProperties = propertiesFromHTMLOptions(options, this);
  hash.viewName = (controlProperties['for'] + 'Field');

  view = Em.Validate.FieldView.extend({
    controlType: type,
    controlProperties: controlProperties
  });

  return Em.Handlebars.ViewHelper.helper(this, view, options);
});

Em.Handlebars.helper('validation-errors', Em.Validate.ErrorsView);
Em.Handlebars.helper('label', Em.Validate.LabelView);

}.call(this);
