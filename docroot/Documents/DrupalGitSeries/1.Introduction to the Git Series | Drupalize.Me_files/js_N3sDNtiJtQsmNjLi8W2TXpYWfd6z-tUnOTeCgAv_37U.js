/**
 * @file
 * Custom JS script only loaded for card view mode display.
 *
 * Requires Knockout JS library.
 *
 * @see collection-playlist.tpl.php
 */

/**
 * Create a new playlist object.
 *
 * Handles the collapse/expand functionality of a playlist, as well as
 * retrieving the playlist data from the server and rendering it as an
 * interactive widget.
 *
 * @param string selector
 *   The jQuery selector string of the DOM element that will be used to render
 *   the playlist.
 * @param int collection_id
 *   The ID of the collection node that we are creating a playlist for.
 *
 * @constructor
 */
function Playlist(selector, collection_id) {
  var self = this;
  self.$playlist = jQuery(selector);
  self.collection_id = collection_id;
}

/**
 * Retrieve a playlist's data from the server and apply our knockout bindings.
 */
Playlist.prototype.loadData = function(callback) {
  var self = this;
  this.$playlist.find('.playlist--loading').show();
  ko.applyBindings(new CollectionViewMode(self.collection_id, self), this.$playlist[0]);
  this.$playlist.data('loaded', true);
  this.$playlist.addClass('processed');
}

/**
 * Collapse the list of items in a playlist.
 */
Playlist.prototype.collapse = function() {
  this.$playlist.find('.playlist--list').slideUp('fast').data('state', 'closed');
}

/**
 * Expand the listof items in a playlist.
 */
Playlist.prototype.expand = function() {
  var $playlist = this.$playlist;
  $playlist.find('.playlist--list').slideDown('fast').data('state', 'open');

  // Scroll the active playlist item into view on video pages where the playlist
  // is contained in a fixed height container next to the video player.
  $playlist.parent().once(function() {
    if ($playlist.find('li.active').length) {
      $playlist.parent().scrollTop($playlist.find('li.active').position().top - 160);
    }
  });
}

/**
 * Toggle between collapse/expanded state of a playlist.
 *
 * This method will also load a playlists data with this.loadData() if the list
 * hasn't been previously loaded. This allows for a link to be added to the page
 * to serve as a toggle, but to only ever bother loading data if someone
 * actually goes to view the playlist.
 */
Playlist.prototype.toggle = function() {
  if (this.$playlist.data('loaded') === false) {
    // this.loadData() will call this.expand() when it's done, so this has the
    // effect of opening the playlist after it's been populated.
    this.loadData();
    return;
  }

  if (this.$playlist.find('.playlist--list').data('state') == 'open') {
    this.collapse();
  }
  else {
    this.expand();
  }
}

var VideoModel = function(data, collectionNid) {
  data = data ? data : {};
  var self = this;
  self.type = ko.observable(data.type || '');
  self.title = ko.observable( data.title || '');
  self.duration = ko.observable(data.duration || 0);
  self.totalTime = ko.observable(data.total_time);
  self.isFree = ko.observable(data.is_free);
  self.watched = ko.observable(data.watched);
  self.watchedPercent = ko.observable(data.watched_percent || 0);
  // If we're in a current collection, let's make sure we stay there.
  var url = data.url + '?p=' + collectionNid;
  self.url = ko.observable(url || '#');
  self.resumeAt = ko.observable(data.resume_at || 0);
  self.comingSoon = ko.observable(data.coming_soon || false);
  //self.readFlag = ko.observable(data.readFlag ? 'playlist--item--completed' : 'playlist--item--incomplete');
  self.readFlag = ko.computed(function() {
    if (typeof data.readFlag !== 'undefined') {
      // This is a tutorial, we've got a read flag, and we can set the icon
      // based on that.
      return data.readFlag ? 'playlist--item--completed' : 'playlist--item--incomplete';
    }

    if (typeof data.watched_percent !== 'undefined') {
      return (data.watched_percent >= 80) ? 'playlist--item--completed' : 'playlist--item--incomplete';
    }
  });

  self.addClasses = function() {
    var classes = self.type();
    if (window.location.href.lastIndexOf(self.url(), 0) === 0) {
      classes = classes + ' active';
    }
    return classes;
  }
};

var CollectionViewMode = function(collectionNid, playlist) {
  var self = this;
  self.isLoading = ko.observable(true);
  self.collectionNid = ko.observable(collectionNid);
  self.videos = ko.observableArray();
  self.collections = ko.observableArray();

  // Fetch a list of playlist items from the server.
  self.fetchVideos = function() {
    var url = Drupal.settings.basePath + 'api/v1/video.json?series=' + self.collectionNid();
    jQuery.getJSON(url, function(data, status, response) {
      if (data.items) {
        ko.utils.arrayForEach(data.items, function(video_item) {
          self.videos.push(new VideoModel(video_item, collectionNid))
        });
      }
      self.isLoading(false);

      // After the playlist is loaded, expand it.
      playlist.expand();
    });
  };

  if (self.isLoading() == true) {
    self.fetchVideos();
  }
};

(function($) {

  Drupal.behaviors.playlist = {
    attach: function(context, settings) {
      // Find any playlist toggle on the page and bind a click handler to it.
      $('.playlist--toggle', context).on('click', function() {
        var playlist_id = $(this).data('playlist');
        var playlist = new Playlist('#playlist-' + playlist_id, playlist_id);
        playlist.toggle();

        // Flip the up/down arrow if there is one.
        var linkElement = $('.playlist--container .dme-font-arrow');
        _toggleArrow(linkElement);
        return false;
      });

      // You can trigger any playlist element to automatically load it's data
      // and display by adding the .playlist--autoload class to the
      // #playlist DOM element.
      $('.playlist--autoload', context).each(function() {
        var playlist_id = $(this).data('playlist');
        var playlist = new Playlist('#playlist-' + playlist_id, playlist_id);
        playlist.loadData();
      });

      var $reveal = $('.playlist--reveal', context);
      if ($reveal) {
        $(window).scroll(function () {
          if ($(window).scrollTop() > 200) {
            $reveal.slideDown('fast');
          }
        });
        $(window).scroll(function () {
          if ($(window).scrollTop() < 100) {
            $reveal.slideUp('fast');
            $reveal.find('.playlist--list').slideUp().data('state', 'closed');
          }
        });
      }
    }
  }

})(jQuery);
;
