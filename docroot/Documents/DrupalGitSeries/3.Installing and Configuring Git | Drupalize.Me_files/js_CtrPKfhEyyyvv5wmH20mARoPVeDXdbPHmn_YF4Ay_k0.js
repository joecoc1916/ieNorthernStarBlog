/*!
Math.uuid.js (v1.4)
http://www.broofa.com
mailto:robert@broofa.com

Copyright (c) 2010 Robert Kieffer
Dual licensed under the MIT and GPL licenses.
*/

/*
 * Generate a random uuid.
 *
 * USAGE: Math.uuid(length, radix)
 *   length - the desired number of characters
 *   radix  - the number of allowable values for each character.
 *
 * EXAMPLES:
 *   // No arguments  - returns RFC4122, version 4 ID
 *   >>> Math.uuid()
 *   "92329D39-6F5C-4520-ABFC-AAB64544E172"
 *
 *   // One argument - returns ID of the specified length
 *   >>> Math.uuid(15)     // 15 character ID (default base=62)
 *   "VcydxgltxrVZSTV"
 *
 *   // Two arguments - returns ID of the specified length, and radix. (Radix must be <= 62)
 *   >>> Math.uuid(8, 2)  // 8 character ID (base=2)
 *   "01001010"
 *   >>> Math.uuid(8, 10) // 8 character ID (base=10)
 *   "47473046"
 *   >>> Math.uuid(8, 16) // 8 character ID (base=16)
 *   "098F4D35"
 */
(function() {
  // Private array of chars to use
  var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

  Math.uuid = function (len, radix) {
    var chars = CHARS, uuid = [], i;
    radix = radix || chars.length;

    if (len) {
      // Compact form
      for (i = 0; i < len; i++) uuid[i] = chars[0 | Math.random()*radix];
    } else {
      // rfc4122, version 4 form
      var r;

      // rfc4122 requires these characters
      uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
      uuid[14] = '4';

      // Fill in random data.  At i==19 set the high bits of clock sequence as
      // per rfc4122, sec. 4.1.5
      for (i = 0; i < 36; i++) {
        if (!uuid[i]) {
          r = 0 | Math.random()*16;
          uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
        }
      }
    }

    return uuid.join('');
  };

  // A more performant, but slightly bulkier, RFC4122v4 solution.  We boost performance
  // by minimizing calls to random()
  Math.uuidFast = function() {
    var chars = CHARS, uuid = new Array(36), rnd=0, r;
    for (var i = 0; i < 36; i++) {
      if (i==8 || i==13 ||  i==18 || i==23) {
        uuid[i] = '-';
      } else if (i==14) {
        uuid[i] = '4';
      } else {
        if (rnd <= 0x02) rnd = 0x2000000 + (Math.random()*0x1000000)|0;
        r = rnd & 0xf;
        rnd = rnd >> 4;
        uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
      }
    }
    return uuid.join('');
  };

  // A more compact, but less performant, RFC4122v4 solution:
  Math.uuidCompact = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  };
})();
;
/**
 * @file
 * Core javascript for vidhist module. Provides a framework that can be
 * extended to provide logging for various video players.
 */

"use strict";

(function ($) {

Drupal.behaviors.vidHist = {
  attach: function (context, settings) {
    if (typeof Drupal.vidHist === 'undefined' && settings.vidHist) {
      Drupal.vidHist = (function () {
        var container = {};
        var playerStates = [];
        var dataPath = settings.vidHist.dataPath;
        var dataInterval = settings.vidHist.dataInterval;
        var dataMinimumReportTime = settings.vidHist.dataMinimumReportTime;
        var positionPath = settings.vidHist.positionPath;
        var securityToken = settings.vidHist.securityToken;
        var urlParams = {};
        // @see http://stackoverflow.com/questions/901115/get-query-string-values-in-javascript/2880929#2880929
        (function () {
          var e;
          var a = /\+/g;  // Regex for replacing addition symbol with a space
          var r = /([^&=]+)=?([^&]*)/g;
          var d = function (s) { return decodeURIComponent(s.replace(a, " ")); };
          var q = window.location.search.substring(1);
          while ((e = r.exec(q))) {
            urlParams[d(e[1])] = d(e[2]);
          }
        })();

        /**
         * Creates a unique identifier for a play session.
         */
        var generateSessionToken = function () {
          //return Math.floor(Math.random() * 100000) + 1;
          return Math.uuidFast();
        };

        /**
         * The reproduction has started or resumed.
         */
        var playerNoteStart = function (position) {
          if (this.state === 'initialized' || this.state === 'paused') {
            if (this.state === 'initialized') {
              // Generate a token for this session.
              this.token = generateSessionToken();
              // Set position from last session if available.
              if (this.initialPosition !== -1) {
                position = this.initialPosition;
                this.initialPosition = -1;
                this.state = '_pending_';
                this.setPosition(position);
              }
              this.start = (typeof position == 'undefined') ? 0 : position;
              this.end = this.start;
            }
            this.state = 'playing';
            // Start timer after all data initialialized.
            this.startTimer();
          }
        };

        /**
         * The reproduction has completed or paused.
         */
        var playerNoteStop = function (complete) {
          // This can be called from onPause(), onComplete(), or
          // window.unload(). If the player is playing or paused we might
          // have to send final data for the session.
          if (this.state === 'playing' || this.state === 'paused') {
            if (this.state === 'playing') {
              this.state = '_pending_';
              this.stopTimer();
            }
            this.sendData(complete);
            this.state = complete ? 'initialized' : 'paused';
          }
        };

        /**
         * User is seeking to new position.
         */
        var playerNoteSeek = function (position) {
          // Seeking only matters when playing or paused. In any other case, the
          // previous play session was terminated in noteStop() and a new one
          // will be created in noteStart(), requiring us to do nothing.
          if (this.state === 'playing' || this.state === 'paused') {
            this.noteStop(true);
            // Initialize new session if player started playing automatically.
            // We have to ask the player itself if it's playing, because
            // there's no other way to guess it and no consistent behavior among
            // different player implementations.
            if (this.isPlaying()) {
              this.noteStart(position);
            }
          }
        };

        /**
         * Note every new playhead position change.
         *
         * We do this just so we have an accurate current position if a seek
         * occurs. If we wait until the seek occurs, it's may be too late to
         * retrieve the former position (depending on the player).
         */
        var playerNotePositionChange = function (position) {
          this.end = position;
        };

        /**
         * Fire a timer to periodically send data to the server.
         *
         * Strictly speaking this shouldn't be necessary, since data is sent in
         * the noteStop() event, but it provides reasonable protection if
         * there is a problem during the noteStop() event, or if it doesn't
         * occur at all for some other reason such as a browser crash or network
         * failure.
         */
        var playerStartTimer = function () {
          if (dataInterval > 0) {
            var that = this;
            this.histTimer = setInterval(function () {
              if (that.state === 'playing') {
                that.sendData(false);
              }
            }, dataInterval);
          }
        };

        /**
         * Stop any timer associated with a player state.
         */
        var playerStopTimer = function () {
          if (this.histTimer) {
            clearInterval(this.histTimer);
            this.histTimer = null;
          }
        };

        /**
         * Post playing information back to the server.
         */
        var playerSendData = function (complete) {
          // Don't send any play less than dataMinimumReportTime seconds.
          if (dataMinimumReportTime == 0 || this.end - this.start >= dataMinimumReportTime) {
            $.post(dataPath, {
              nid : this.nid,
              htmlid : this.htmlid,
              url: this.url,
              start : this.start,
              end: this.end,
              duration: this.duration,
              complete: complete ? 1 : 0,
              token: this.token,
              securityToken: securityToken
            });
          }
        };

        /**
         * Initialize playing position.
         */
        var playerSetInitialPosition = function () {
          var that = this; // only used by $.post success closure.
          if (typeof urlParams.htmlid !== 'undefined' && typeof urlParams.position !== 'undefined') {
            // URL is requesting resumed play.
            if (urlParams.htmlid === this.htmlid && !isNaN(parseInt(urlParams.position, 10)) && urlParams.position >= 0) {
              this.initialPosition = urlParams.position;
              this.noteStart(0);
            }
          }
          else {
            // We don't lookup resume position for anon users.
            if (settings.vidHist.uid == 0) {
              this.noteStart(0);
            }
            else {
              // Retrieve and save last position for when video is eventually played.
              $.post(positionPath, {
                  nid: this.nid,
                  htmlid: this.htmlid,
                  securityToken: securityToken
                },
                function (data) {
                  if (data.position !== -1 && that.state === 'initialized') {
                    that.initialPosition = data.position;
                  }
                }
              );
            }
          }
        };

        /**
         * Register a player and return playerState object used for callbacks.
         */
        var registerPlayer = function (spec) {
          var playerState = (function () {
            var that = {
              nid: spec.nid,
              htmlid: spec.htmlid,
              url: spec.url,
              start: 0,
              end: 0,
              duration: spec.duration,
              auto: false,
              token: 0,
              state: 'initialized',
              initialPosition: -1,
              histTimer: null,
              // Assign the methods.
              noteStart: playerNoteStart,
              noteStop: playerNoteStop,
              notePositionChange: playerNotePositionChange,
              noteSeek: playerNoteSeek,
              sendData: playerSendData,
              setInitialPosition: playerSetInitialPosition,
              startTimer: playerStartTimer,
              stopTimer: playerStopTimer,
              setPosition: spec.setPosition,
              isPlaying: spec.isPlaying
            };

            that.setInitialPosition();

            return that;
          })();

          playerStates.push(playerState);

          return playerState;
        };

        /**
         * Check for duplicate player registrations.
         */
        var isPlayerRegistered = function (id) {
          var k;
          for (k = 0; k < playerStates.length; k += 1) {
            if (playerStates[k].id === id) {
              return true;
            }
          }
          return false;
        };

        /**
         * Bind to window unload to send data just before user exits page.
         */
        $(window).unload(function () {
          var k;
          for (k = 0; k < playerStates.length; k += 1) {
            playerStates[k].noteStop(true);
            // Stop the timer just in case something went wrong somewhere and
            // it's still hanging around.
            playerStates[k].stopTimer();
          }
          playerStates = [];
        });

        // Make some methods public
        container.registerPlayer = registerPlayer;
        container.isPlayerRegistered = isPlayerRegistered;

        return container;
      })();
    }
  }
};

})(jQuery);
;
