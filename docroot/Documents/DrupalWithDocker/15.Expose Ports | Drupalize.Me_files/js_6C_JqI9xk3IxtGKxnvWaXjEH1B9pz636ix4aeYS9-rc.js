/**
 * @file
 * Ejector seat Javascript functions.
 *
 * Poll a Drupal site via AJAX at a specified interval to determine if the user
 * currently accessing the site still has an active session and reload the page
 * if they don not. Effectively logging the user out of the site.
 */
(function ($) {

  Drupal.behaviors.ejectorseat = {
    attach: function (context, settings) {
      Drupal.ejectorSeat = {
        windowFocus: true,
        overdue: false
      };
      var ejectorInterval = settings.ejectorSeat.interval ? settings.ejectorSeat.interval * 1000 : 60000;
      var intervalId;
      $(window)
        .blur(function(){
          Drupal.ejectorSeat.windowFocus = false;
        })
        .focus(function(){
          Drupal.ejectorSeat.windowFocus = true;
          if (Drupal.ejectorSeat.overdue) {
            Drupal.ejectorSeat.overdue = false;
            ejectorCheck();
            restartTimer();
          }
        });

      function ejectorCheck() {
        var ignoreFocus = settings.ejectorSeat.ignoreFocus;
        
        if (Drupal.ejectorSeat.windowFocus || ignoreFocus) {
          // Do the AJAX test.
          $.get(settings.ejectorSeat.url, function(data){
            // If the test returns 0 the user's session has ended so refresh the
            // page.
            if (data === '0') {
              window.location.reload(true);
            }
          });
        }
        else {
          Drupal.ejectorSeat.overdue = true;
        }
      }

      function startTimer() {
        intervalId = setInterval(ejectorCheck, ejectorInterval);
      }

      function restartTimer() {
        clearInterval(intervalId);
        startTimer();
      }

      startTimer();
    }
  };

}(jQuery));
;
/**
 * @file
 * Vidhist support for JWPlayer.
 *
 * Basically as long as there is a JWPlayer isntance on the page and it's
 * embeded using the jwplayer() JS call this code will find it and strack
 * playback.
 */

"use strict";

(function ($) {

/**
 * Register event listener for jwplayer API callbacks.
 */
Drupal.behaviors.vidHist_jwplayer = {
  attach: function (context, settings) {
    if (typeof Drupal.vidHist !== 'undefined' && typeof jwplayer !== 'undefined' && typeof jwplayer().onReady !== 'undefined') {
      var readyHelper = function (player) {
        // Ensure each player is registered just once to avoid duplicate data.
        if (!Drupal.vidHist.isPlayerRegistered($(player).attr('id'))) {
          var playerState = Drupal.vidHist.registerPlayer({
            htmlid: $(player).attr('id'),
            url: player.getPlaylistItem().file,
            nid: settings.vidHist.nid,
            // Set this to -1 initially, we'll set it to an actual value
            // later.
            duration: -1,
            setPosition: function (position) {
              player.onReady(function() {
                player.seek(position);
              });
            },
            isPlaying: function () { var state = player.getState(); return state === 'BUFFERING' || state === 'PLAYING'; }
          });

          player.onTime(function () {
            // It takes jwplayer a fraction of a second to actually start
            // reporting the playhead position so we set the duration and
            // start position in the onTime event instead of onPlay since
            // sometimes the player doesn't yet know the duration.
            if (playerState.duration == -1) {
              playerState.noteStart(player.getPosition());
              playerState.duration = player.getDuration();
            }
          });

          player.onPause(function (oldstate) {
            playerState.noteStop(false);
          });

          player.onComplete(function () {
            playerState.noteStop(true);
          });

          if (typeof player.onSeek !== 'undefined') {
            // Use native onSeek() for jwplayer >= v5.6.1683.
            player.onSeek(function (params) {
              playerState.noteSeek(params.position);
            });
            player.onTime(function (params) {
              playerState.notePositionChange(params.position);
            });
          }
          else {
            // Emulate onSeek() when it's unavailable.
            player.onTime(function (params) {
              var position = params.position;
              if (typeof playerState.lastPosition !== 'undefined' && Math.abs(playerState.lastPosition - position) > 10) {
                playerState.noteSeek(position);
              }
              else {
                playerState.notePositionChange(position);
              }
              playerState.lastPosition = position;
            });
          }
        }
      };

      // Once the player is ready, attach vidhist functionality.
      jwplayer().onReady(readyHelper(jwplayer()));
    }
  }
};

})(jQuery);
;
/**
 * @file
 * Javascript that will record read state progress for tutorials.
 */

"use strict";

(function ($) {

  // Source: https://stackoverflow.com/a/40658647/8616016
  $.fn.isInViewport = function() {
    var elementTop = $(this).offset().top;
    var elementBottom = elementTop + $(this).outerHeight();

    var viewportTop = $(window).scrollTop();
    var viewportBottom = viewportTop + $(window).height();

    return elementBottom > viewportTop && elementTop < viewportBottom;
  };

  // Source: https://davidwalsh.name/javascript-debounce-function
  function debounce(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  Drupal.behaviors.drupalizeTutorial = {
    attach: function (context, settings) {
      // This selector represents an element that is always in the DOM, and is
      // always visually below the content of the tutorial. If this element
      // becomes visible we know the user has seen the whole content of the
      // tutorial even if scrolling hasn't actually gotten them to 80% of the
      // viewport or the bottom of the page.
      var bottomElementSelector = 'div#bottom-of-tutorial';

      var notified = false;
      var dataPath = '/_tutorial_progress';

      // Send an initial ping so we can track last access time.
      $.post(dataPath, {
        nid: Drupal.settings.dme.nid,
        // If the footer element is already in the viewport then the whole
        // tutorial is already visible and they might not ever scroll the page
        // so just mark it as read.
        progress: $(bottomElementSelector).isInViewport() ? 100 : 1
      });

      // Use the debounce function to ensure we only allow this code to trigger
      // at most once ever 1/4 second.
      $(window).scroll(debounce(function() {
        var scrollTop = $(window).scrollTop();
        var tutorialHeight = $('div.tutorial--body').height();
        var bottomedOut = $(bottomElementSelector).isInViewport();

        // Send a data update at 50%
        if (notified == false && scrollTop > tutorialHeight / 2) {
          notified = true;

          $.post(dataPath, {
            nid: Drupal.settings.dme.nid,
            progress: 50,
          });
        } else if (bottomedOut || scrollTop > tutorialHeight * 0.8) {
          var progress = 100;

          $.post(dataPath, {
            nid: Drupal.settings.dme.nid,
            progress: 100
          });

          // Unbind the scroll event so we don't send any more updates.
          $(window).unbind('scroll');
          // Mark the current item in the playlist as read so we don't have to
          // refresh. *NOTE* This breaks the knockout observable but we're not
          // changing that dynamically anyway.
          $('.playlist--item.tutorial.active .playlist--item--incomplete').removeClass('playlist--item--incomplete').addClass('playlist--item--completed');
        }
      }, 250));
    }
  };
})(jQuery);
;
(function ($) {

/**
 * Terminology:
 *
 *   "Link" means "Everything which is in flag.tpl.php" --and this may contain
 *   much more than the <A> element. On the other hand, when we speak
 *   specifically of the <A> element, we say "element" or "the <A> element".
 */

/**
 * The main behavior to perform AJAX toggling of links.
 */
Drupal.flagLink = function(context) {
  /**
   * Helper function. Updates a link's HTML with a new one.
   *
   * @param element
   *   The <A> element.
   * @return
   *   The new link.
   */
  function updateLink(element, newHtml) {
    var $newLink = $(newHtml);

    // Initially hide the message so we can fade it in.
    $('.flag-message', $newLink).css('display', 'none');

    // Reattach the behavior to the new <A> element. This element
    // is either whithin the wrapper or it is the outer element itself.
    var $nucleus = $newLink.is('a') ? $newLink : $('a.flag', $newLink);
    $nucleus.addClass('flag-processed').click(flagClick);

    // Find the wrapper of the old link.
    var $wrapper = $(element).parents('.flag-wrapper:first');
    // Replace the old link with the new one.
    $wrapper.after($newLink).remove();
    Drupal.attachBehaviors($newLink.get(0));

    $('.flag-message', $newLink).fadeIn();
    setTimeout(function(){ $('.flag-message.flag-auto-remove', $newLink).fadeOut() }, 3000);
    return $newLink.get(0);
  }

  /**
   * A click handler that is attached to all <A class="flag"> elements.
   */
  function flagClick(event) {
    // Prevent the default browser click handler
    event.preventDefault();

    // 'this' won't point to the element when it's inside the ajax closures,
    // so we reference it using a variable.
    var element = this;

    // While waiting for a server response, the wrapper will have a
    // 'flag-waiting' class. Themers are thus able to style the link
    // differently, e.g., by displaying a throbber.
    var $wrapper = $(element).parents('.flag-wrapper');
    if ($wrapper.is('.flag-waiting')) {
      // Guard against double-clicks.
      return false;
    }
    $wrapper.addClass('flag-waiting');

    // Hide any other active messages.
    $('span.flag-message:visible').fadeOut();

    // Send POST request
    $.ajax({
      type: 'POST',
      url: element.href,
      data: { js: true },
      dataType: 'json',
      success: function (data) {
        data.link = $wrapper.get(0);
        $.event.trigger('flagGlobalBeforeLinkUpdate', [data]);
        if (!data.preventDefault) { // A handler may cancel updating the link.
          data.link = updateLink(element, data.newLink);
        }

        // Find all the link wrappers on the page for this flag, but exclude
        // the triggering element because Flag's own javascript updates it.
        var $wrappers = $('.flag-wrapper.flag-' + data.flagName.flagNameToCSS() + '-' + data.contentId).not(data.link);
        var $newLink = $(data.newLink);

        // Hide message, because we want the message to be shown on the triggering element alone.
        $('.flag-message', $newLink).hide();

        // Finally, update the page.
        $wrappers = $newLink.replaceAll($wrappers);
        Drupal.attachBehaviors($wrappers.parent());

        $.event.trigger('flagGlobalAfterLinkUpdate', [data]);
      },
      error: function (xmlhttp) {
        alert('An HTTP error '+ xmlhttp.status +' occurred.\n'+ element.href);
        $wrapper.removeClass('flag-waiting');
      }
    });
  }

  $('a.flag-link-toggle:not(.flag-processed)', context).addClass('flag-processed').click(flagClick);
};

/**
 * Prevent anonymous flagging unless the user has JavaScript enabled.
 */
Drupal.flagAnonymousLinks = function(context) {
  $('a.flag:not(.flag-anonymous-processed)', context).each(function() {
    this.href += (this.href.match(/\?/) ? '&' : '?') + 'has_js=1';
    $(this).addClass('flag-anonymous-processed');
  });
}

String.prototype.flagNameToCSS = function() {
  return this.replace(/_/g, '-');
}

/**
 * A behavior specifically for anonymous users. Update links to the proper state.
 */
Drupal.flagAnonymousLinkTemplates = function(context) {
  // Swap in current links. Cookies are set by PHP's setcookie() upon flagging.

  var templates = Drupal.settings.flag.templates;

  // Build a list of user-flags.
  var userFlags = Drupal.flagCookie('flags');
  if (userFlags) {
    userFlags = userFlags.split('+');
    for (var n in userFlags) {
      var flagInfo = userFlags[n].match(/(\w+)_(\d+)/);
      var flagName = flagInfo[1];
      var contentId = flagInfo[2];
      // User flags always default to off and the JavaScript toggles them on.
      if (templates[flagName + '_' + contentId]) {
        $('.flag-' + flagName.flagNameToCSS() + '-' + contentId, context).after(templates[flagName + '_' + contentId]).remove();
      }
    }
  }

  // Build a list of global flags.
  var globalFlags = document.cookie.match(/flag_global_(\w+)_(\d+)=([01])/g);
  if (globalFlags) {
    for (var n in globalFlags) {
      var flagInfo = globalFlags[n].match(/flag_global_(\w+)_(\d+)=([01])/);
      var flagName = flagInfo[1];
      var contentId = flagInfo[2];
      var flagState = (flagInfo[3] == '1') ? 'flag' : 'unflag';
      // Global flags are tricky, they may or may not be flagged in the page
      // cache. The template always contains the opposite of the current state.
      // So when checking global flag cookies, we need to make sure that we
      // don't swap out the link when it's already in the correct state.
      if (templates[flagName + '_' + contentId]) {
        $('.flag-' + flagName.flagNameToCSS() + '-' + contentId, context).each(function() {
          if ($(this).find('.' + flagState + '-action').size()) {
            $(this).after(templates[flagName + '_' + contentId]).remove();
          }
        });
      }
    }
  }
}

/**
 * Utility function used to set Flag cookies.
 *
 * Note this is a direct copy of the jQuery cookie library.
 * Written by Klaus Hartl.
 */
Drupal.flagCookie = function(name, value, options) {
  if (typeof value != 'undefined') { // name and value given, set cookie
    options = options || {};
    if (value === null) {
      value = '';
      options = $.extend({}, options); // clone object since it's unexpected behavior if the expired property were changed
      options.expires = -1;
    }
    var expires = '';
    if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
      var date;
      if (typeof options.expires == 'number') {
        date = new Date();
        date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
      } else {
        date = options.expires;
      }
      expires = '; expires=' + date.toUTCString(); // use expires attribute, max-age is not supported by IE
    }
    // NOTE Needed to parenthesize options.path and options.domain
    // in the following expressions, otherwise they evaluate to undefined
    // in the packed version for some reason...
    var path = options.path ? '; path=' + (options.path) : '';
    var domain = options.domain ? '; domain=' + (options.domain) : '';
    var secure = options.secure ? '; secure' : '';
    document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
  } else { // only name given, get cookie
    var cookieValue = null;
    if (document.cookie && document.cookie != '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var cookie = jQuery.trim(cookies[i]);
        // Does this cookie string begin with the name we want?
        if (cookie.substring(0, name.length + 1) == (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }
};

Drupal.behaviors.flagLink = {};
Drupal.behaviors.flagLink.attach = function(context) {
  // For anonymous users with the page cache enabled, swap out links with their
  // current state for the user.
  if (Drupal.settings.flag && Drupal.settings.flag.templates) {
    Drupal.flagAnonymousLinkTemplates(context);
  }

  // For all anonymous users, require JavaScript for flagging to prevent spiders
  // from flagging things inadvertently.
  if (Drupal.settings.flag && Drupal.settings.flag.anonymous) {
    Drupal.flagAnonymousLinks(context);
  }

  // On load, bind the click behavior for all links on the page.
  Drupal.flagLink(context);
};

})(jQuery);
;
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
