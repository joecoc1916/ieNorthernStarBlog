/**
 * @file
 * Javascript for our video pages.
 *
 * This also contains code for pushing video player events to the dataLayer
 * object used by Google Tag Manager. Which isn't exactly "theme" code, but this
 * was the best place to put it for now.
 */
(function($) {

  // Switch to stacked layout if it was previously used.
  if (localStorage.getItem('videoLayout') === 'stacked') {
    $('.l-hero').addClass('stacked');
  }

  // Automate calculation of embed height when the width is changed.
  $('.share--embed .width').keyup(function() {
    if (/\D/g.test(this.value)) {
      // Filter non-digits from input value.
      this.value = this.value.replace(/\D/g, '');
    }

    // Calculate the embed width using a 16:9 ratio.
    var height = Math.round((this.value / 16) * 9);

    // Update DOM with new values.
    $('.share--embed .height').val(height);
    var str = $('.share--embed textarea').val();
    var res = str.replace(/width="\d*"/, 'width="' + this.value + '"');
    res = res.replace(/height="\d*"/, 'height="' + height + '"');
    $('.share--embed textarea').val(res);
  });

  // Transcript language menu dropdown.
  $('.transcript--menu .language').click(function() {
    $(this).next('ul').toggleClass('open');
    return false;
  });

  // Switching the transcript language.
  $('.transcript--language-menu a').click(function() {
    $('.transcript--list').removeClass('active').filter('.' + $(this).attr('data-language')).addClass('active');
    $(this).parents('ul.open').removeClass('open');
    $('.transcript--language-menu a.active').removeClass('active');
    $(this).addClass('active');
    $('.transcript--language-name').html($(this).html());
    return false;
  });

  // Automatically activate the first transcript in the list.
  $('.transcript--language-menu li:first-child a').addClass('active');
  $('.transcript--list-wrapper ul:first-child').addClass('active');
  $('.transcript--language-name').html($('.transcript--language-menu li:first-child a').html());

  Drupal.behaviors.video_player = {
    attach: function (context, settings) {

      $('#drupalizeme-video-player', context).once('video_player', function() {
        // Global variables.
        var themePath = settings.dmemain.themePath;
        var currentItem = $('.playlist--content li.active > a');
        var resumePosition = currentItem.attr('data-resume');
        var playerTime = 0;
        var videoId = $(this).data('video');

        // Helper function to preload a given array of images.
        function preload(arrayOfImages) {
          $(arrayOfImages).each(function(){
            $('<img/>')[0].src = this;
          });
        }

        // Preload the hover state JWPlayer dock icons.
        preload([
          themePath + "/images/video/jwplayer/speed-fast.png",
          themePath + "/images/video/jwplayer/speed-fastest.png",
          themePath + "/images/video/jwplayer/layout-normal.png",
        ]);

        // Clears any playlist sources that were previously added.
        settings.jwplayer.playlist[0].sources = [];

        // Call our API to retrieve newly signed URLs for our video assets.
        // We have to make this call to avoid any caching mechanisms that could
        // prevent us from getting a recently signed URL such as the Drupal page
        // cache or Varnish.
        $.ajax({
          url: '/api/v1/videoasset/' + videoId + '.json',
          dataType: 'json',
          success: function(data) {
            // Populate the playlist with new SD and/or HD signed URLs.
            if (typeof data.mp4.low != 'undefined') {
              settings.jwplayer.playlist[0].sources.push({'file': data.mp4.low.signed});
            }
            if (typeof data.mp4.high != 'undefined') {
              settings.jwplayer.playlist[0].sources.push({'file': data.mp4.high.signed});
            }

            // Initialize jwplayer.
            jwplayer("drupalizeme-video-player")
              .setup(settings.jwplayer)
              .onReady(function(){
                playerSetup(this);
                // We must re-attach any behaviours attached to the player as
                // until this point, jwplayer() was not initialized. This allows
                // functionality such as vidhist to work.
                Drupal.attachBehaviors('#drupalizeme-video-player');
              });
          }
        });

        /**
         * Helper function to push events into the GTM dataLayer.
         *
         * Allows for tracking of player events with Google Tag Manager.
         *
         * @param {jwplayer} playerObject
         *   Object representing the current jwplayer instance.
         * @param {string} eventType
         *   The label, or type, of even to push to the dataLayer.
         * @param {string} eventMessage
         *   Any additional message to go along with the event.
         */
        function playerEventToDataLayer(playerObject, eventType, eventMessage) {
          // Bail out early if there is no dataLayer defined.
          if (typeof dataLayer === 'undefined') {
            return false;
          }

          var eventName;
          // The video name is set by the drupalizevideofield module in
          // _drupalizevideofield_jw_formatter_config().
          if (playerObject.config.entity_label) {
            eventName = playerObject.config.entity_label + ' (' + playerObject.config.entity_id + ')';
          } else {
            eventName = 'not set';
          }

          dataLayer.push({
            event: "video",
            eventCategory: "JW Player",
            eventAction: eventType,
            eventLabel: eventName,
            eventMessage: eventMessage,
          });
        }

        function playerSetup(player) {
          // Used by dataLayer event tracking code to know when to send a % of
          // video played event. 95% matches with Vidhist.
          var markers = [10, 25, 50, 75, 95];
          var playerMarkers = [];

          // Add a speed adjustment button when in HTML5 mode.
          if (player.getRenderingMode() == 'html5') {
            player.addButton(
              themePath + "/images/video/jwplayer/speed-normal.png",
              "Adjust playback speed",
              function() {
                if (player.getState() !== 'IDLE') {
                  var video = document.getElementById('drupalizeme-video-player').querySelector("video");
                  if (video.playbackRate == 1.0) {
                    video.playbackRate = 1.5;
                    $.cookie('playbackRate', 1.5);
                    $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-fast.png')");
                  }
                  else if (video.playbackRate == 1.5) {
                    video.playbackRate = 2.0;
                    $.cookie('playbackRate', 2.0);
                    $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-fastest.png')");
                  }
                  else {
                    video.playbackRate = 1.0;
                    $.cookie('playbackRate', 1.0);
                    $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-normal.png')");
                  }
                  // Trigger a custom event so other code can optionally react
                  // to this change.
                  $(player).trigger('jwplayer.changePlaybackSpeed', video.playbackRate);

                  playerEventToDataLayer(player, 'Playback speed ' + video.playbackRate, 'Playback speed ' + video.playbackRate);
                }
              },
              "speed"
            );
          }
          else {
            // It's possible for playerSetup() to be called more than once in a
            // single page load so we need to make sure we only display this
            // warning once.
            if (!$('.video--player-warning').length) {
              $('#block-dmeblocks-video-player').before('<p class="video--player-warning">Have a need for speed? Try out the speed toggle button &mdash; now available in Chrome and Safari in our shiny new HTML5 player.</p>');
            }
          }

          if ($(".hero--has-transcript").length) {
            // Add a transcript toggle button if transcripts exist.
            player.addButton(
              themePath + "/images/video/jwplayer/transcript.png",
              "Toggle transcript",
              function() {
                $('.transcript').toggle();

                if ($('.transcript').is(':visible')) {
                  $('#drupalizeme-video-player_dock_transcript').css('background-color', "#13a0d8");
                  // Trigger event so others can react.
                  $(player).trigger('jwplayer.toggleTranscript', 'show');

                  playerEventToDataLayer(player, 'Show transcript', 'Show transcript');
                }
                else {
                  $('#drupalizeme-video-player_dock_transcript').css('background-color', "transparent");
                  // Trigger event so others can react.
                  $(player).trigger('jwplayer.toggleTranscript', 'hide');

                  playerEventToDataLayer(player, 'Hide transcript', 'Hide transcript');
                }
              },
              "transcript"
            );
          }

          if ($(".hero--has-playlist").length) {
            // Add a layout toggle button if the sidebar exists.
            player.addButton(
              themePath + "/images/video/jwplayer/layout-stacked.png",
              "Switch layout",
              function() {
                $('.l-hero').toggleClass('stacked');
                if ($('.l-hero.stacked').length) {
                  $('#drupalizeme-video-player_dock_layout').css('background-image', "url('" + themePath + "/images/video/jwplayer/layout-normal.png')");
                  localStorage.setItem('videoLayout', 'stacked');
                  // Trigger event so others can react.
                  $(player).trigger('jwplayer.toggleLayout', 'normal');

                  playerEventToDataLayer(player, 'Set normal layout', 'Set normal layout');
                }
                else {
                  $('#drupalizeme-video-player_dock_layout').css('background-image', "url('" + themePath + "/images/video/jwplayer/layout-stacked.png')");
                  localStorage.removeItem('videoLayout');
                  // Trigger event so others can react.
                  $(player).trigger('jwplayer.toggleLayout', 'stacked');

                  playerEventToDataLayer(player, 'Set stacked layout', 'Set stacked layout');
                }
              },
              "layout"
            );
            if ($.cookie('playbackRate')) {
              switch ($.cookie('playbackRate')) {
                case "1.5":
                  $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-fast.png')");
                  break;
                case "2":
                  $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-fastest.png')");
                  break;
                default:
                  $('#drupalizeme-video-player_dock_speed').css('background-image', "url('" + themePath + "/images/video/jwplayer/speed-normal.png')");
                  break;
              }
            }
          }

          // Adds a Resume button to the player. Once this button is clicked,
          // the video seeks to the resume position and removes the button.
          if (typeof Drupal.settings.video_player !== 'undefined' && Drupal.settings.video_player.vidhist_resume < Drupal.settings.video_player.vidhist_duration) {
            $('#drupalizeme-video-player_display').addClass('has-extra-button');
            $('#drupalizeme-video-player_display').before('<div id="drupalizeme-video-player_extra_button">Resume</div>');
            $('#drupalizeme-video-player_extra_button').click(function() {
              player.seek(Drupal.settings.video_player.vidhist_resume);
              return false;
            });
          }

          // When a video completes we add a Next button only if it wasn't already
          // (jwplayer sometimes triggers onComplete twice), the playlist has
          // multiple items and the current active video isn't the last item.
          // Once clicked, the user is taken to the next video in the playlist.
          player.onComplete(function() {
            if (!$('#drupalizeme-video-player_extra_button').length && $('.playlist--content li').length > 1 && !$('.playlist--content li:last-child').hasClass('active')) {
              $('#drupalizeme-video-player_display').addClass('has-extra-button');
              $('#drupalizeme-video-player_display').before('<div id="drupalizeme-video-player_extra_button">Next</div>');
              $('#drupalizeme-video-player_extra_button').click(function() {
                window.location = $('.playlist--content li.active').next().find('a').attr('href');
              });
            }

            playerEventToDataLayer(this, 'Completed video', 'Completed video');
          });

          // Once the video is played, we need to remove any extra button.
          player.onPlay(function() {
            if($.cookie('playbackRate')) {
              var player = document.querySelector('video');
              player.playbackRate = $.cookie('playbackRate');
            }
            if ($('#drupalizeme-video-player_extra_button').length) {
              $('#drupalizeme-video-player_display').removeClass('has-extra-button');
              $('#drupalizeme-video-player_extra_button').remove();
            }

            // Push info about play/resume events to the dataLayer for GTM.
            var playResume;
            if (this.getPosition() < 2) {
              playResume = 'Played video';
            } else {
              playResume = 'Resumed video';
            }
            playerEventToDataLayer(this, 'Played video', playResume);
          });

          player.onPause(function() {
            playerEventToDataLayer(this, 'Paused video', 'Paused video');
          });

          // Every 5 seconds, update our current playlist item's watched progress.
          player.onTime(function(event) {
            // Update the % watched displayed for an item in the playlist in
            // real time while the user watches it.
            if (Math.abs(event.position - playerTime) > 5) {
              playerTime = Math.floor(event.position);
              if (currentItem.length == 0) {
                $currentItem = $('.playlist--content li.active > a');
              }
              var title = $currentItem.find('.playlist--item--title');
              var percent = playerTime / $currentItem.attr('data-total') * 100;
              var status = $currentItem.find('.playlist--item--percent');
              status.html('<span>' + Math.floor(percent) + '</span>% watched').addClass('active');
            }

            // Handle highlighting, and automatic scrolling, of the transcripts.
            // In order to be as performant as possible we only enable this
            // functionality if the transcripts are currently visible.
            var $list = $('.transcript:visible .transcript--list.active');

            if ($list.length > 0) {
              $list.find('li a').each(function () {
                var $line = $(this);

                if ($line.data('offset') <= event.position && $line.data('offset-end') >= event.position) {
                  // player.onTime() gets called frequently. As much as 10 times
                  // per second sometimes. So in order to avoid thrashing we
                  // only change the DOM in cases where the current line item
                  // hasn't already been updated.
                  if (!$line.parent().hasClass('transcript--current')) {
                    // Add/remove classes to indicate current row.
                    $list.find('li').removeClass('transcript--current');
                    $line.parent().addClass('transcript--current');

                    // Scroll the current line to the top of the container.
                    if ($list.attr('data-scrolling') == 'on') {
                      $list.animate({scrollTop: $line.parent().offset().top - $list.offset().top + $list.scrollTop() - 80});
                    }

                    // As soon as we find the current line stop looping, there
                    // is no point in going any further.
                    return false;
                  }
                }
              });
            }

            // Push percent played to dataLayer so we can track these events
            // with Google Tag Manager. But only when the percent played is
            // equal to one of our defined markers.
            var percentPlayed = Math.floor(event.position * 100 / event.duration);
            if (markers.indexOf(percentPlayed) > -1 && playerMarkers.indexOf(percentPlayed) == -1) {
              playerMarkers.push(percentPlayed);
              playerEventToDataLayer(this, percentPlayed + '% played', percentPlayed + '% played');

              // If they are above 95% watched we also mark this as complete.
              if (percentPlayed >= 95 ) {
                playerEventToDataLayer(this, 'Completed video', 'Completed video');
              }
            }
          });

          player.onFullscreen(function(event) {
            if (event.fullscreen) {
              $('.video--player').addClass('video--fullscreen');
            }
            else {
              $('.video--player').removeClass('video--fullscreen');
            }

            playerEventToDataLayer(this, 'Toggle fullscreen', '');
          });

          player.onError(function(error) {
            playerEventToDataLayer(this, 'Video error', e.message);

            if (typeof Drupal.watchdog !== 'undefined') {
              Drupal.watchdog("Video Asset/Playback Problem", error.message, "WATCHDOG_ERROR");
            }
          });
        }

        // Transcript filtering.
        $('#transcript-filter').keyup(function() {
          if ($(this).val().length) {
            // Disable scrolling if someone starts searching.
            toggleTranscriptAutoAdvance('off');
            $('.transcript--list.active li').hide().filter(function () {
              return $(this).text().toLowerCase().indexOf($('#transcript-filter').val().toLowerCase()) != -1;
            }).show();
          }
          else {
            $('.transcript--list.active li').show();
          }
        });

        // Transcript seek links.
        $('.time').click(function() {
          var position = $(this).attr('data-offset');
          jwplayer("drupalizeme-video-player").seek(position);
          return false;
        });

        /**
         * Helper to toggle auto advancement of transcripts on/off.
         *
         * @param {string} force
         *   Optionally force the auto advance tool to a specific state of
         *   either "on" or "off". The default is to switch to the opposite of
         *   whatever the current state is.
         */
        var toggleTranscriptAutoAdvance = function(force) {
          var $transcript = $('.transcript--list');
          var $link = $transcript.parents().find('a.scroll-toggle');

          // Allow for forcing this to a specific state, regardless of whatever
          // the current state is.
          if (typeof force != 'undefined') {
            // Set state to the opposite of whatever is specified by force, and
            // that will force a toggle to the requested state.
            state = 'on';
            if (force == 'on') {
              state = 'off';
            }
          }
          else {
            var state = $transcript.attr('data-scrolling');
          }

          if (state == 'on') {
            $transcript.attr('data-scrolling', 'off');
            $link.html('Auto scroll off');
          }
          else {
            $transcript.attr('data-scrolling', 'on');
            $link.html('Auto scroll on');
          }
        }

        // Link to toggle auto advance feature for transcripts on/off.
        $('.transcript .scroll-toggle').click(function() {
          toggleTranscriptAutoAdvance();
          return false;
        });

        // If the user manually scrolls within the transcript container we
        // need to disable the auto advancing feature. Otherwise it's just going
        // to cause the container to jump around a lot. And, would be a really
        // bad experience for the user.
        $('.transcript').bind('mousewheel DOMMouseScroll', function(event){
          if ($('.transcript:visible .transcript--list').attr('data-scrolling') != 'off') {
            toggleTranscriptAutoAdvance('off');
          }
        });

        // Transcript close link.
        $('.close').click(function() {
          $('.transcript').hide();
          $('#drupalizeme-video-player_dock_transcript').css('background-color', "transparent");
          return false;
        });
      });
    }
  };

})(jQuery);
;
/**
 * @file
 * JS for toggling share modal dialog open/closed.
 */

(function($) {
    // Share modal initializer.
  $('.share-link').magnificPopup({
    type: 'inline',
    midClick: true,

    // Delay in milliseconds before popup is removed.
    removalDelay: 300,

    // Class that is added to popup wrapper and background
    // make it unique to apply your CSS animations just to this exact popup.
    mainClass: 'mfp-fade'
  });

  $('.share--embed textarea').click(function() {
    $(this).select();
    return false;
  });
})(jQuery);
;
/**
 * @file
 * Tutorial feedback form displayed at the bottom of tutorials/videos.
 */

(function($) {
  Drupal.behaviors.dmemainFeedback = {
    attach: function(context) {
      // When the page first loads we hide the submit button and textarea of the
      // feedback form. Then show them later if someone clicks one of the
      // buttons.
      $('.feedback', context).once(function() {
        $(this).find('.webform-component--feedback').addClass('feedback--hidden');
        $(this).find('.form-actions').addClass('feedback--hidden');
      });

      // Show the rest of the form if someone clicks yes or no button.
      $('.feedback input[name="submitted[yes_no]"]', context).bind('change keyup', function() {
        $('.feedback--hidden').removeClass('feedback--hidden');
      });
    }
  };
})(jQuery);
;
