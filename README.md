## Un-Validate

We've had to tackle the client validations problem in almost every Ember app
we've ever written, and we've done it in a bunch of different ways. This is
the way we ended up liking most. There are a few things that we really wanted
to have in a validation framework:

* Not tied to models or any modelling framework
* Promise-based
* Not reliant on extending Ember itself
* No dependencies outside of Ember
* Minimal view helpers (i.e. no form builder)

### Scenario

Suppose we have a signup workflow in our Ember app. We have some validations
that we'd like to run locally, some that require XHR, and when we decide to
post our signup data, if some validation fails on the sever we'd like to display
those errors to the user as well.

### Controller

```javascript
App.SignupController = Em.Controller.extend(Em.Validatable, {
  actions: {
    save: function() {
      this.save();
    }
  },

  email: null,
  username: null,
  bio: null,
  password: null,
  passwordConfirm: null,

  // Here's where your client-side validations go, this could also be placed
  // at the model level, but I'm just not quite sure yet if that's actually
  // a good idea.
  willValidate: function() {
    // There are some helpers to handle common use-cases:
    this.validatesEmail('email');
    this.validatesLength('bio', { allowBlank: true, max: 250 });
    this.validatesLength('username', { max: 20 });

    // It's very straight-forward to write your own validations:
    this.validates(function(outcome) {
      if (this.get('password') === this.get('passwordConfirm')) {
        outcome.valid();
      } else {
        outcome.invalid('passwordConfirm', 'does not match password');
      }
    });

    // Even ones that are a bit more involved:
    this.validates(function(outcome) {
      var xhr = $.getJSON('/api/users/exists', { u: this.get('username') });

      // Returning the promise here allows any crazy to be caught and handled.
      return xhr.then(function(payload) {
        if (payload.exists) {
          outcome.valid();
        } else {
          outcome.invalid('username', 'is already taken');
        }
      });
    });
  },

  // This brings us to persisting this data to the server and dealing with
  // any validation errors we might encounter.
  asJSON: function() {
    var json = this.getProperties([
      'email',
      'username',
      'bio',
      'password'
    ]);

    return { signup: json };
  },

  save: function() {
    var controller = this,
        validate   = this.validate();

    validate.then(function(isValid) {
      if (!isValid) return;

      var xhr = $.ajax({
        url: '/api/signups',
        data: this.asJSON(),
        type: 'post',
        context: controller
      });

      // If our API call succeeds, then we can do what we need to do:
      xhr.then(function(payload) {
        App.auth.logIn(payload.session);
      });

      // If our API call fails, then we can add the errors. It's probably a good
      // idea to check for the correct status code here before trying to parse
      // any errors. For example if you actually got a 5XX error instead of the
      // 422 you were expecting.
      //
      // It's also important to point out that the format I'm expecting back
      // from our pretend server is:
      //
      // {
      //   "errors": [
      //     {
      //       "field": "underscored_property_name",
      //       "message": "is not proper, proper is best"
      //     },
      //     ...
      //   ]
      // }
      //
      // Obviously you could munge whatever you get into what we need, which is:
      //
      // [{ property: 'nameOfProperty', message: 'is not valid' }, ...]
      xhr.fail(function(http) {
        var payload = JSON.parse(http.responseText);
            errors  = payload.errors.map(function(error) {
              return {
                property: error.field ? error.field.camelize() : null,
                message: error.message
              };
            });

        // The validationErrors object has an easy to use API
        this.get('validationErrors').add(errors);
      });
    });

    validate.fail(function(exception) {
      // Something went wonky during validation, such as an XHR request failed.
    });
  }
});
```

### Template

Now, we need to display this stuff to the user, I really wanted this to be as
minimal as possible, I ended up with three helpers: `{{validation-errors}}`,
`{{field}}`, and `{{label}}`. Here's how they work:

#### {{vaidation-errors}}

Responsible for displaying error messages, by default it only displays errors
that don't belong to a property. It's workings exist in
`Em.Validate.ErrorsView`.

#### {{field}}

Responsible for displaying a form control and rendering any errors associated
with it, also responsible for resetting errors on a field once it regains focus.
The workings of `{{field}}` exist in Em.Validation.FieldView.

#### {{label}}

Associates a label to a field element, this is sort of a classic tricky problem
in Ember.

```html
<!-- signup.hbs -->

<form {{action "save" on="submit"}}>
  <fieldset>
    <legend>Sign Up For This Cloud Service</legend>
    <!-- Any errors that don't belong to a specific property are displayed here -->
    {{validation-errors}}
    <ul>
      <li>
        {{label for="email"}}
        {{field for="email" placeholder="someone@example.com"}}
      </li>
      <li>
        {{label for="username"}}
        {{field for="username" placeholder="eg: tomdale, wycats, ebryn"}}
      </li>
      <li>
        {{label for="bio"}}
        {{field for="bio" type="textarea" placeholder="A short summary of yourself."}}
      </li>
      <li>
        {{label for="password"}}
        {{field for="password" type="password" placeholder="Password"}}
        {{field for="passwordConfirm" type="password" placeholder="Confirm Password"}}
      </li>
    </ul>
    <p>
      <button type="submit">
        Sign Up
      </button>
    </p>
  </fieldset>
</form>
```

### TODO

* Package
* Full test suite
* JSBin example
* Make the `{{field}}` helper a lot better
* More configurability
* Discuss reflection and how to integrate it
* More validation helpers based off real-world use-cases
* Consider support for validating single properties without affecting others
* Consider support for sequential validations per property

❤ ❤ ❤ @heycarsten & @unspace ❤ ❤ ❤
