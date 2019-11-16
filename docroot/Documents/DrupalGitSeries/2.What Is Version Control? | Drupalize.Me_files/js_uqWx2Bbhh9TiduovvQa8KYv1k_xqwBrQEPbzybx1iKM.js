/*jslint white: true, plusplus: true, browser: true */
/*globals Drupal, jQuery */

/**
 * Log a system message.
 *
 * @see watchdog()
 * @see https://api.drupal.org/api/drupal/includes%21bootstrap.inc/function/watchdog/7
 *
 * Use Drupal.watchdog.ERROR, Drupal.watchdog.WARNING etc for severity.
 */
Drupal.watchdog = function (type, message, variables, severity, link) {
  "use strict";
  var data, i;
  data = {
    type: type,
    message: message,
    severity: severity || Drupal.watchdog.NOTICE,
    link: link || window.location.pathname
  };

  // Serialize the variables object.
  for (i in variables) {
    if (variables.hasOwnProperty(i)) {
      data['variables[' + i + ']'] = variables[i];
    }
  }

  // Some basic flood control.  The module does this fully.
  if (Drupal.settings.jswatchdogLimit > 0) {
    jQuery.post(Drupal.settings.basePath + 'ajax/jswatchdog', data);
  }

  Drupal.settings.jswatchdogLimit--;
};

// @see watchdog_severity_levels();
Drupal.watchdog.EMERG    = 0;
Drupal.watchdog.ALERT    = 1;
Drupal.watchdog.CRITICAL = 2;
Drupal.watchdog.ERROR    = 3;
Drupal.watchdog.WARNING  = 4;
Drupal.watchdog.NOTICE   = 5;
Drupal.watchdog.INFO     = 6;
Drupal.watchdog.DEBUG    = 7;
;
