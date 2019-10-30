/*
 * Copyright 2017-2018  Andrew Stubbs <andrew.stubbs@gmail.com>
 * Copyright 2018 Simon Dierl <simon.dierl@cs.tu-dortmund.de>
 * Copyright 2015 Stephen Herbein <stephen272@gmail.com>
 * Copyright 2015 Steffen Coenen <steffen@steffen-coenen.de>
 * Copyright 2016 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict'

;(function (Nuvola) {
// Translations
  var _ = Nuvola.Translate.gettext
  var C_ = Nuvola.Translate.pgettext

  var COUNTRY_VARIANT = 'app.country_variant'
  var HOME_PAGE = 'https://music.amazon.{1}/'
  var COUNTRY_VARIANTS = [
    ['de', C_('Amazon variant', 'Germany')],
    ['fr', C_('Amazon variant', 'France')],
    ['co.uk', C_('Amazon variant', 'United Kingdom')],
    ['com', C_('Amazon variant', 'United States')],
    ['it', C_('Amazon variant', 'Italy')],
    ['ca', C_('Amazon variant', 'Canada')],
    ['in', C_('Amazon variant', 'India')],
    ['com.br', C_('Amazon variant', 'Brazil')]
  ]

  var ACTION_THUMBS_UP = 'thumbs-up'
  var ACTION_THUMBS_DOWN = 'thumbs-down'

  // Create media player component
  var player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  var PlaybackState = Nuvola.PlaybackState
  var PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  var WebApp = Nuvola.$WebApp()

  // Have we read the volume yet?
  WebApp.volumeKnown = false

  // Countdown number of "update" cycles before closing volume controls.
  WebApp.autoCloseVolume = 0

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)
    Nuvola.config.setDefaultAsync(COUNTRY_VARIANT, '').catch(console.log.bind(console))
    this.state = PlaybackState.UNKNOWN

    var state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // TODO: only set this after the user has logged in
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)

    var actions = [ACTION_THUMBS_UP, ACTION_THUMBS_DOWN]
    player.addExtraActions(actions)

    // Start update routine
    this.update()
  }

  WebApp._onInitializationForm = function (emitter, values, entries) {
    if (!Nuvola.config.hasKey(COUNTRY_VARIANT)) {
      this.appendPreferences(values, entries)
    }
  }

  WebApp.appendPreferences = function (values, entries) {
    values[COUNTRY_VARIANT] = Nuvola.config.get(COUNTRY_VARIANT)
    entries.push(['header', _('Amazon Cloud Player')])
    entries.push(['label', _('Preferred national variant')])
    for (var i = 0; i < COUNTRY_VARIANTS.length; i++) {
      entries.push(['option', COUNTRY_VARIANT, COUNTRY_VARIANTS[i][0], COUNTRY_VARIANTS[i][1]])
    }
  }

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.core.connect('InitializationForm', this)
    Nuvola.core.connect('PreferencesForm', this)

    Nuvola.actions.addAction('playback', 'win', ACTION_THUMBS_UP, C_('Action', 'Thumbs up'), null, null, null, true)
    Nuvola.actions.addAction('playback', 'win', ACTION_THUMBS_DOWN, C_('Action', 'Thumbs down'), null, null, null, true)
  }

  WebApp._onPreferencesForm = function (emitter, values, entries) {
    this.appendPreferences(values, entries)
  }

  WebApp._onHomePageRequest = function (emitter, result) {
    result.url = Nuvola.format(HOME_PAGE, Nuvola.config.get(COUNTRY_VARIANT))
  }

  // Extract data from the web page
  WebApp.update = function () {
    var track = {
      title: null,
      artist: null,
      album: null,
      artLocation: null,
      length: null
    }

    var timeElapsed = null
    try {
      var elm = document.querySelector('#dragonflyTransport .trackTitle')
      track.title = elm ? elm.textContent : null
      elm = document.querySelector('#dragonflyTransport .trackArtist')
      track.artist = elm ? elm.textContent : null
      elm = document.querySelector('#dragonflyTransport .trackAlbumArt img')
      track.artLocation = elm ? elm.src : null
      elm = document.querySelector('#dragonflyTransport .trackSourceLink a')
      track.album = elm ? elm.textContent : null
      elm = document.querySelector('.timeRemaining')
      timeElapsed = document.querySelector('.timeElapsed')
      if (Nuvola.parseTimeUsec && elm && timeElapsed) {
        track.length = Nuvola.parseTimeUsec(elm ? elm.textContent : null) +
                       Nuvola.parseTimeUsec(timeElapsed ? timeElapsed.textContent : null)
        timeElapsed = timeElapsed.textContent
      }
    } catch (e) {
      // ~ console.log("Failed to get track info");
      // ~ console.log(e.message);
    }

    player.setTrack(track)

    var playButton = this._getPlayButton()
    var pauseButton = this._getPauseButton()
    if (pauseButton) {
      this.state = PlaybackState.PLAYING
    } else if (playButton) {
      this.state = PlaybackState.PAUSED
    } else {
      this.state = PlaybackState.UNKNOWN
    }

    player.setTrackPosition(timeElapsed)
    player.setCanSeek(this.state !== PlaybackState.UNKNOWN)

    elm = document.querySelector('.volumeHandle')
    if (elm) {
      player.updateVolume(elm.style.bottom.split('%')[0] / 100.0)
      player.setCanChangeVolume(true)

      // Close volume control, if we opened it.
      if (!this.volumeKnown) {
        elm = document.querySelector('.volume')
        if (elm) Nuvola.clickOnElement(elm)
        this.volumeKnown = true
      }
    } else if (!this.volumeKnown) {
      // Open volume control to read the setting.
      elm = document.querySelector('.volume')
      if (elm) Nuvola.clickOnElement(elm)
    }
    if (this.autoCloseVolume > 0) {
      this.autoCloseVolume--
      if (this.autoCloseVolume === 0) {
        // Close volume slider now
        elm = document.querySelector('.volume')
        if (elm) Nuvola.clickOnElement(elm)
      }
    }

    player.setPlaybackState(this.state)
    player.setCanPause(!!pauseButton)
    player.setCanPlay(!!playButton)
    player.setCanGoPrev(!!this._getPrevButton)
    player.setCanGoNext(!!this._getNextButton)

    try {
      var actionsEnabled = {}
      var actionsStates = {}

      elm = document.querySelector('.thumbsUpButton')
      actionsEnabled[ACTION_THUMBS_UP] = !!elm
      actionsStates[ACTION_THUMBS_UP] = (elm ? elm.attributes['aria-checked'].value === 'true' : false)

      elm = document.querySelector('.thumbsDownButton')
      actionsEnabled[ACTION_THUMBS_DOWN] = !!elm
      actionsStates[ACTION_THUMBS_DOWN] = (elm ? elm.attributes['aria-checked'].value === 'true' : false)

      elm = document.querySelector('.shuffleButton')
      actionsEnabled[PlayerAction.SHUFFLE] = !!elm
      actionsStates[PlayerAction.SHUFFLE] = (elm ? elm.attributes['aria-checked'].value === 'true' : false)

      elm = document.querySelector('.repeatButton')
      actionsEnabled[PlayerAction.REPEAT] = !!elm
      actionsStates[PlayerAction.REPEAT] = (elm && elm.attributes['aria-checked'].value === 'true' ? Nuvola.PlayerRepeat.PLAYLIST : Nuvola.PlayerRepeat.NONE)

      Nuvola.actions.updateEnabledFlags(actionsEnabled)
      Nuvola.actions.updateStates(actionsStates)
    } catch (e) {}

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  WebApp._getButton = function (selector) {
    var elm = document.querySelector(selector)
    return elm ? (elm.classList.contains('disabled') ? null : elm) : null
  }

  WebApp._getPlayButton = function () {
    var elm = document.querySelector('.playButton.playerIconPlay')
    if (elm && elm.classList.contains('disabled')) {
      // Check if currently playing since there always is a disabled .playerIconPlay
      if (this._getPauseButton()) {
        return null
      } else {
        return this._getButton('.headerPlayAll') || this._getButton('.playAll')
      }
    } else {
      return elm
    }
  }

  WebApp._getPauseButton = function () {
    return this._getButton('.playButton.playerIconPause')
  }

  WebApp._getPrevButton = function () {
    return this._getButton('.previousButton')
  }

  WebApp._getNextButton = function () {
    return this._getButton('.nextButton')
  }

  WebApp._onActionActivated = function (emitter, name, param) {
    var button = null
    switch (name) {
    /* Base media player actions */
      case PlayerAction.TOGGLE_PLAY:
        button = this._getPauseButton()
        if (!button) button = this._getPlayButton()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.PLAY:
        button = this._getPlayButton()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        button = this._getPauseButton()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.PREV_SONG:
        button = this._getPrevButton()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.NEXT_SONG:
        button = this._getNextButton()
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.SEEK:
        var timeRemaining = document.querySelector('.timeRemaining')
        var timeElapsed = document.querySelector('.timeElapsed')
        var total = Nuvola.parseTimeUsec(timeRemaining ? timeRemaining.textContent : null) +
                    Nuvola.parseTimeUsec(timeElapsed ? timeElapsed.textContent : null)
        if (param > 0 && param <= total) {
          Nuvola.clickOnElement(document.querySelector('.sliderTrack'), param / total, 0.5)
        }
        break
      case PlayerAction.CHANGE_VOLUME:
        var control = document.querySelector('.volumeTrack')
        if (!control) {
          // Try opening the control, and try again.
          var elm = document.querySelector('.volume')
          if (elm) Nuvola.clickOnElement(elm)
          control = document.querySelector('.volumeTrack')

          // Start the close count down
          this.autoCloseVolume = 1
        }
        if (control) {
          // A regular clickOnElement is not effective here.
          var y = 1.0 - param
          Nuvola.triggerMouseEvent(control, 'mouseenter', 0.5, y)
          Nuvola.triggerMouseEvent(control, 'mousedown', 0.5, y)
          Nuvola.triggerMouseEvent(control, 'mouseup', 0.5, y)
          Nuvola.triggerMouseEvent(control, 'mouseout', 0.5, y)

          // Reset the close count down every time the volume changes
          if (this.autoCloseVolume > 0) this.autoCloseVolume = 5
        }
        break
      case ACTION_THUMBS_UP:
        button = document.querySelector('.thumbsUpButton')
        if (button) Nuvola.clickOnElement(button)
        break
      case ACTION_THUMBS_DOWN:
        button = document.querySelector('.thumbsDownButton')
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.SHUFFLE:
        button = document.querySelector('.shuffleButton')
        if (button) Nuvola.clickOnElement(button)
        break
      case PlayerAction.REPEAT:
        button = document.querySelector('.repeatButton')
        if (button) {
          var state = (button.attributes['aria-checked'].value === 'true' ? Nuvola.PlayerRepeat.PLAYLIST : Nuvola.PlayerRepeat.NONE)
          if (param !== Nuvola.PlayerRepeat.TRACK && param !== state) Nuvola.clickOnElement(button)
        }
        break
    }
  }

  WebApp.start()
})(this) // function(Nuvola)
