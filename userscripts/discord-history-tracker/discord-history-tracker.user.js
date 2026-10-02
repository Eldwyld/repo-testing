// ==UserScript==
// @name         Discord History Tracker (Standalone)
// @namespace    https://github.com/eldwyld/repo-testing
// @version      47.4.0
// @description  Browser-only build of Discord History Tracker v47.4. Tracks message history and saves it to a file, without the desktop app.
// @license      MIT
// @match        https://discord.com/*
// @match        https://ptb.discord.com/*
// @match        https://canary.discord.com/*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * GENERATED FILE, do not edit. Edit the files in src/ and run build.py instead.
 *
 * Discord History Tracker is (c) Daniel Chýlek, MIT License, https://github.com/chylex/Discord-History-Tracker
 * This is an unofficial repackaging of its tracking script (v47.4) that keeps tracked messages in the browser
 * instead of sending them to the desktop app. Please do not report problems with this build to the upstream project.
 */

(function() {
	const INLINE_TRIGGER_ID = "dht-userscript-trigger";
	const FLOATING_TRIGGER_ID = "dht-userscript-trigger-floating";

	// How long to wait for Discord's Help icon before showing a floating button instead.
	const FLOATING_TRIGGER_DELAY_MS = 15000;

	const ICON_PATHS = `
<path d="M7.446,9.924c-0,0.846 -0.105,1.593 -0.315,2.234c-0.21,0.644 -0.497,1.181 -0.86,1.615c-0.365,0.431 -0.795,0.761 -1.292,0.982c-0.494,0.22 -1.029,0.332 -1.605,0.332l-3.374,-0l0,-10.174l3.021,0c0.645,0 1.239,0.1 1.781,0.296c0.542,0.198 1.011,0.501 1.4,0.911c0.391,0.408 0.695,0.928 0.914,1.56c0.22,0.629 0.33,1.378 0.33,2.244Zm-1.765,-0c0,-0.592 -0.067,-1.1 -0.198,-1.524c-0.134,-0.422 -0.318,-0.77 -0.554,-1.042c-0.236,-0.272 -0.518,-0.473 -0.848,-0.604c-0.332,-0.128 -0.697,-0.195 -1.096,-0.195l-1.237,-0l0,6.882l1.483,0c0.351,0 0.676,-0.076 0.977,-0.224c0.298,-0.15 0.556,-0.372 0.776,-0.668c0.22,-0.295 0.389,-0.663 0.513,-1.101c0.122,-0.439 0.184,-0.947 0.184,-1.524Z"/>
<path d="M14.147,15.087l-0,-4.362l-3.637,-0l-0,4.362l-1.748,-0l-0,-10.174l1.748,0l-0,4.052l3.637,-0l-0,-4.052l1.75,0l0,10.174l-1.75,-0Z"/>
<path d="M21.297,6.559l-0,8.528l-1.748,-0l-0,-8.528l-2.699,-0l0,-1.646l7.15,0l0,1.646l-2.703,-0Z"/>`;

	function startTracker() {
		/*
 * Based on the desktop app's bootstrap.js. Runs every time the tracker is opened from the userscript's DHT button.
 */
(function() {
	if (window.DHT_LOADED) {
		alert("Discord History Tracker is already loaded.");
		return;
	}

	/**
 * Parts copied from Better Discord, licensed under Apache License 2.0.
 *
 * https://github.com/BetterDiscord/BetterDiscord/blob/2752daf64f98625fc67c569361bd56021307d058/renderer/src/modules/webpackmodules.js
 * https://github.com/BetterDiscord/BetterDiscord/blob/2752daf64f98625fc67c569361bd56021307d058/LICENSE
 * 
 * https://github.com/BetterDiscord/BetterDiscord/blob/1b859560148a908f077278fba9625ea82e670222/src/betterdiscord/webpack/shared.ts
 * https://github.com/BetterDiscord/BetterDiscord/blob/1b859560148a908f077278fba9625ea82e670222/LICENSE
 */

// noinspection RedundantIfStatementJS
class WEBPACK {
	static get require() {
		if (this._require) {
			return this._require;
		}
		
		/**
		 * @type {Object}
		 * @property {Object} m
		 * @property {Object} c
		 */
		let hookedRequire;
		
		const id = Symbol("dht-webpackmodules-" + new Date().getTime());
		if (typeof (window["webpackChunkdiscord_app"]) !== "undefined") {
			window["webpackChunkdiscord_app"].push([ [ id ], {}, internalRequire => {
				if ("b" in internalRequire) {
					hookedRequire = internalRequire;
				}
			}]);
		}
		
		return this._require = hookedRequire;
	}
	
	static getAllModules() {
		return this.require.c;
	}
	
	static shouldSkipModule(exports) {
		if (!(typeof exports === "object" || typeof exports === "function")) {
			return true;
		}
		if (!exports) {
			return true;
		}
		if (exports === window) {
			return true;
		}
		if (exports === document.documentElement) {
			return true;
		}
		if (exports[Symbol.toStringTag] === "DOMTokenList") {
			return true;
		}
		if (exports === Symbol) {
			return true;
		}
		if (exports instanceof Window) {
			return true;
		}
		return false;
	}
	
	static filterByProps(...props) {
		return module => props.every(prop => prop in module);
	}
	
	static filterByPropsWithPredicate(predicate, ...props) {
		return module => props.every(prop => prop in module && predicate(module[prop]));
	}
	
	static findModules(filter) {
		const moduleFilter = module => (typeof module === "object" || typeof module === "function") && filter(module);
		
		const results = [];
		
		for (const module of Object.values(this.getAllModules())) {
			/**
			 * @type {Object} Exports
			 * @property [A]
			 * @property [Ay]
			 * @property [default]
			 */
			const exports = module.exports;
			if (this.shouldSkipModule(exports)) {
				continue;
			}
			
			let foundModule;
			if (exports.A && moduleFilter(exports.A)) {
				foundModule = exports.A;
			}
			else if (exports.Ay && moduleFilter(exports.Ay)) {
				foundModule = exports.Ay;
			}
			else if (exports.default && moduleFilter(exports.default)) {
				foundModule = exports.default;
			}
			else if (moduleFilter(exports)) {
				foundModule = exports;
			}
			else {
				continue;
			}
			
			results.push(foundModule);
		}
		
		return results;
	}
	
	static findModule(name, filter) {
		const modules = this.findModules(filter);
		if (modules.length === 1) {
			return modules[0];
		}
		
		console.error("[DHT] Cannot find module " + name + ", results found:", modules.length, modules);
		return null;
	}
	
	static findFunction(name, additionalRequiredProps) {
		const searchedProps = additionalRequiredProps ? [ name, ...additionalRequiredProps ] : [ name ];
		const matchingModule = this.findModule("containing function " + name, this.filterByPropsWithPredicate(prop => typeof (prop) === "function", ...searchedProps));
		return matchingModule == null ? null : matchingModule[name].bind(matchingModule);
	}
}
// noinspection JSUnresolvedVariable
// noinspection LocalVariableNamingConventionJS
class DISCORD {
	
	// https://discord.com/developers/docs/resources/channel#channel-object-channel-types
	static CHANNEL_TYPE = {
		GUILD_TEXT: 0,
		DM: 1,
		GROUP_DM: 3,
		GUILD_ANNOUNCEMENT: 5,
		ANNOUNCEMENT_THREAD: 10,
		PUBLIC_THREAD: 11,
		PRIVATE_THREAD: 12,
		
		isPrivate(type) {
			return type === this.DM
				|| type === this.GROUP_DM;
		},
		
		isNavigableGuildChannel(type) {
			return type === this.GUILD_TEXT
				|| type === this.GUILD_ANNOUNCEMENT
				|| type === this.ANNOUNCEMENT_THREAD
				|| type === this.PUBLIC_THREAD
				|| type === this.PRIVATE_THREAD;
		}
	};
	
	// https://discord.com/developers/docs/resources/channel#message-object-message-types
	static MESSAGE_TYPE = {
		DEFAULT: 0,
		REPLY: 19,
		THREAD_STARTER: 21
	};
	
	// https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
	static PERMISSION = {
		VIEW_CHANNEL: 1n << 10n
	};
	
	/**
	 * @type {Object}
	 * @property {function(String): ?DiscordGuild} getGuild
	 */
	static #guildStore = WEBPACK.findModule("guildStore", WEBPACK.filterByProps("getGuild", "getGuilds", "getGuildIds"));
	
	/**
	 * @type {Object}
	 * @property {function(String): Boolean} isOptInEnabled
	 * @property {function(String): Set<String>} getOptedInChannels
	 */
	static #guildSettings = WEBPACK.findModule("guildSettings", WEBPACK.filterByProps("isOptInEnabled", "getOptedInChannels"));
	
	/**
	 * @type {Object}
	 * @property {function(String): ?DiscordChannel} getChannel
	 * @property {function(String): Array<DiscordChannel>} getMutableGuildChannelsForGuild
	 * @property {function(): Array<DiscordChannel>} getSortedPrivateChannels
	 */
	static #channelStore = WEBPACK.findModule("channelStore", WEBPACK.filterByProps("getChannel", "getMutableGuildChannelsForGuild", "getSortedPrivateChannels"));
	
	/**
	 * @type {function(BigInt, Object): Boolean}
	 */
	static #hasPermission = WEBPACK.findFunction("can", [ "getGuildPermissions", "getChannelPermissions" ]);
	
	/**
	 * @type {function(String): MessageData}
	 */
	static #getMessages = WEBPACK.findFunction("getMessages", [ "isLoadingMessages" ]);
	
	/**
	 * @type {function(String): void}
	 */
	static #jumpToMessage = WEBPACK.findFunction("jumpToMessage");
	
	/**
	 * @type {function(): String}
	 */
	static #getCurrentlySelectedChannelId = WEBPACK.findFunction("getCurrentlySelectedChannelId");
	
	/**
	 * @type {function(String): void}
	 */
	static #selectPrivateChannel = WEBPACK.findFunction("selectPrivateChannel", [ "selectChannel" ]);
	
	/**
	 * @type {function(String, Object, String=null): void}
	 */
	static #transitionToGuildSync = WEBPACK.findFunction("transitionToGuildSync");
	
	static isCompatible() {
		return !!this.#guildStore
			&& !!this.#guildSettings
			&& !!this.#channelStore
			&& !!this.#hasPermission
			&& !!this.#getMessages
			&& !!this.#jumpToMessage
			&& !!this.#getCurrentlySelectedChannelId
			&& !!this.#selectPrivateChannel
			&& !!this.#transitionToGuildSync;
	}
	
	static getMessageOuterElement() {
		return DOM.queryReactClass("messagesWrapper");
	}
	
	static getMessageScrollerElement() {
		return DOM.queryReactClass("scroller", this.getMessageOuterElement());
	}
	
	static loadOlderMessages() {
		const view = this.getMessageScrollerElement();
		
		if (view.scrollTop > 0) {
			view.scrollTop = 0;
		}
	}
	
	static getMessagesFromSelectedChannel() {
		const channelId = this.#getCurrentlySelectedChannelId();
		return channelId ? this.#getMessages(channelId) : null;
	}
	
	/**
	 * Calls the provided function with a list of messages whenever the currently loaded messages change.
	 * @param callback {function(server: ?DiscordGuild, channel: DiscordChannel, messages: Array<DiscordMessage>, hasMoreBefore: boolean)}
	 */
	static setupMessageCallback(callback) {
		const previousMessages = new Set();
		
		const onMessageElementsChanged = force => {
			const messages = this.getMessagesFromSelectedChannel();
			if (!messages || !messages.ready || messages.loadingMore) {
				return false;
			}
			
			const channel = this.#channelStore.getChannel(messages.channelId);
			if (!channel) {
				return false;
			}
			
			const hasChanged = force || !messages.hasMoreBefore || messages.some(message => !previousMessages.has(message.id));
			if (!hasChanged) {
				return false;
			}
			
			previousMessages.clear();
			for (const message of messages._array) {
				previousMessages.add(message.id);
			}
			
			const server = this.#guildStore.getGuild(channel.guild_id);
			
			callback(server, channel, messages._array, messages.hasMoreBefore);
			return true;
		};
		
		let debounceTimer;
		
		/**
		 * Do not trigger the callback too often due to autoscrolling.
		 */
		const onMessageElementsChangedLater = function() {
			window.clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(onMessageElementsChanged, 100);
		};
		
		const observer = new MutationObserver(function() {
			onMessageElementsChangedLater();
		});
		
		let skipsLeft = 0;
		let observedElement = null;
		
		const observerTimer = window.setInterval(() => {
			if (skipsLeft > 0) {
				--skipsLeft;
				return;
			}
			
			const view = this.getMessageOuterElement();
			
			if (!view) {
				skipsLeft = 1;
				return;
			}
			
			if (observedElement !== null && observedElement.isConnected) {
				return;
			}
			
			observedElement = view.querySelector("[data-list-id='chat-messages']");
			
			if (observedElement) {
				console.debug("[DHT] Observed message container.");
				observer.observe(observedElement, { childList: true });
				onMessageElementsChangedLater();
			}
		}, 400);
		
		window.DHT_ON_UNLOAD.push(() => {
			observer.disconnect();
			observedElement = null;
			window.clearInterval(observerTimer);
		});
		
		return () => onMessageElementsChanged(true);
	}
	
	/**
	 * Selects the next text channel and returns true, otherwise returns false if there are no more channels.
	 */
	static selectNextTextChannel() {
		const currentChannel = this.#channelStore.getChannel(this.#getCurrentlySelectedChannelId());
		if (!currentChannel) {
			return false;
		}
		
		if (this.CHANNEL_TYPE.isPrivate(currentChannel.type)) {
			const privateChannel = this.#channelStore.getSortedPrivateChannels();
			const currentIndex = privateChannel.findIndex(channel => channel.id === currentChannel.id);
			
			if (currentIndex === -1 || currentIndex === privateChannel.length - 1) {
				return false;
			}
			
			this.#selectPrivateChannel(privateChannel[currentIndex + 1].id);
			return true;
		}
		else {
			const guildId = currentChannel.guild_id;
			
			let isChannelOptedIn;
			if (this.#guildSettings.isOptInEnabled(guildId)) {
				const optedInChannels = this.#guildSettings.getOptedInChannels(guildId);
				isChannelOptedIn = channel => optedInChannels.has(channel.id);
			}
			else {
				isChannelOptedIn = _ => true;
			}
			
			const guildChannelMap = this.#channelStore.getMutableGuildChannelsForGuild(guildId);
			const guildChannels = Object.values(guildChannelMap)
				.filter(channel => this.CHANNEL_TYPE.isNavigableGuildChannel(channel.type) && isChannelOptedIn(channel) && this.#hasPermission(this.PERMISSION.VIEW_CHANNEL, channel))
				.sort((a, b) => a.position - b.position);
			
			const currentIndex = guildChannels.findIndex(channel => channel.id === currentChannel.id);
			
			if (currentIndex === -1 || currentIndex === guildChannels.length - 1) {
				return false;
			}
			
			this.#transitionToGuildSync(guildId, {}, guildChannels[currentIndex + 1].id);
			return true;
		}
	}
}
class DOM {
	/**
	 * Returns a child element by its ID. Parent defaults to the entire document.
	 * @param {string} id
	 * @param {HTMLElement?} [parent]
	 * @returns {HTMLElement}
	 */
	static id(id, parent) {
		return (parent || document).getElementById(id);
	}
	
	/**
	 * Returns the first child element containing the specified obfuscated class. Parent defaults to the entire document.
	 * @param {string} cls
	 * @param {HTMLElement?} [parent]
	 * @returns {HTMLElement}
	 */
	static queryReactClass(cls, parent) {
		parent = parent || document;
		return parent.querySelector(`[class*="-${cls}"]`) || parent.querySelector(`[class*="${cls}_"]`);
	}
	
	/**
	 * Creates an element, adds it to the DOM, and returns it.
	 */
	static createElement(tag, parent, id, html) {
		/** @type HTMLElement */
		const ele = document.createElement(tag);
		ele.id = id || "";
		ele.innerHTML = html || "";
		parent.appendChild(ele);
		return ele;
	}
	
	/**
	 * Removes an element from the DOM.
	 */
	static removeElement(ele) {
		return ele.parentNode.removeChild(ele);
	}
	
	/**
	 * Creates a new style element with the specified CSS and returns it.
	 */
	static createStyle(styles) {
		return this.createElement("style", document.head, "", styles);
	}
	
	/**
	 * Utility function to save an object into a cookie.
	 */
	static saveToCookie(name, obj, expiresInSeconds) {
		const expires = new Date(Date.now() + 1000 * expiresInSeconds).toUTCString();
		document.cookie = name + "=" + encodeURIComponent(JSON.stringify(obj)) + ";path=/;expires=" + expires;
	}
	
	/**
	 * Utility function to load an object from a cookie.
	 */
	static loadFromCookie(name) {
		const value = document.cookie.replace(new RegExp("(?:(?:^|.*;\\s*)" + name + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1");
		return value.length ? JSON.parse(decodeURIComponent(value)) : null;
	}
}
/*
 * Based on the desktop app's gui.js, with the Upload & Combine / Download / Reset buttons from the browser-only version.
 */
// noinspection FunctionWithInconsistentReturnsJS
const GUI = (function() {
	let controller = null;
	let settings = null;
	let trackingStyles = null;

	const plural = (count, word) => count + " " + word + (count === 1 ? "" : "s");

	const updateControllerButtons = () => {
		if (!controller) {
			return;
		}

		const isTracking = STATE.isTracking();
		const hasData = STATE.hasSavedData();

		controller.ui.btnTrack.innerText = isTracking ? "Pause Tracking" : "Start Tracking";
		controller.ui.btnUpload.disabled = isTracking;
		controller.ui.btnSettings.disabled = isTracking;
		controller.ui.btnDownload.disabled = !hasData;
		controller.ui.btnReset.disabled = isTracking || !hasData;
	};

	const updateControllerCounts = () => {
		if (!controller) {
			return;
		}

		let messageCount = 0;
		let channelCount = 0;

		if (STATE.hasSavedData()) {
			messageCount = STATE.getSavefile().countMessages();
			channelCount = STATE.getSavefile().countChannels();
		}

		controller.ui.textCount.innerText = plural(messageCount, "message") + " from " + plural(channelCount, "channel") + (STATE.hasUnsavedChanges() ? " (not downloaded)" : "");
	};

	const settingsChangedEvent = () => {
		if (settings) {
			settings.ui.cbAutoscroll.checked = SETTINGS.autoscroll;
			settings.ui.cbHidePreviewsWhileAutoscrolling.checked = SETTINGS.hidePreviewsWhileAutoscrolling;
			settings.ui.optsAfterFirstMsg[SETTINGS.afterFirstMsg].checked = true;
			settings.ui.optsAfterSavedMsg[SETTINGS.afterSavedMsg].checked = true;

			const autoscrollDisabled = !SETTINGS.autoscroll;
			settings.ui.cbHidePreviewsWhileAutoscrolling.disabled = autoscrollDisabled;
			Object.values(settings.ui.optsAfterFirstMsg).forEach(ele => ele.disabled = autoscrollDisabled);
			Object.values(settings.ui.optsAfterSavedMsg).forEach(ele => ele.disabled = autoscrollDisabled);
		}
	};

	const readUploadedFile = file => {
		const reader = new FileReader();

		reader.onload = function() {
			let obj;

			try {
				obj = JSON.parse(reader.result);
			} catch (e) {
				alert("Could not parse '" + file.name + "', see console for details.");
				console.error(e);
				return;
			}

			if (SAVEFILE.isValid(obj)) {
				STATE.uploadSavefile(file.name, new SAVEFILE(obj));
			}
			else {
				alert("File '" + file.name + "' has an invalid format.");
			}
		};

		reader.readAsText(file, "UTF-8");
	};

	return {
		showController() {
			if (controller) {
				return;
			}

			const html = `
<button id='dht-ctrl-upload' title='Load a previously downloaded archive and continue adding to it'>Upload &amp; Combine</button>
<button id='dht-ctrl-settings'>Settings</button>
<button id='dht-ctrl-track'></button>
<button id='dht-ctrl-download'>Download</button>
<button id='dht-ctrl-reset'>Reset</button>
<p id='dht-ctrl-status'>Waiting</p>
<p id='dht-ctrl-count'></p>
<input id='dht-ctrl-upload-input' type='file' accept='.txt,.json,application/json,text/plain' multiple style='display: none'>
<button id='dht-ctrl-close'>X</button>`;

			controller = {
				styles: DOM.createStyle(`#app-mount {
  height: calc(100% - 48px) !important;
}

#dht-ctrl {
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 48px;
  overflow: hidden;
  white-space: nowrap;
  background-color: #fff;
  color: #000;
  font-size: 14px;
  z-index: 1000000;
}

#dht-ctrl button {
  height: 32px;
  margin: 8px 0 8px 8px;
  font-size: 16px;
  padding: 0 12px;
  background-color: #7289da;
  color: #fff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.75);
}

#dht-ctrl button:disabled {
  background-color: #7a7a7a;
  cursor: default;
}

#dht-ctrl p {
  display: inline-block;
  margin: 14px 0 14px 12px;
}

#dht-ctrl-status {
  font-weight: bold;
}

#dht-ctrl-close {
  margin: 8px 8px 8px 0 !important;
  float: right;
}`),
				ele: DOM.createElement("div", document.body, "dht-ctrl", html)
			};

			controller.ui = {
				btnUpload: DOM.id("dht-ctrl-upload"),
				btnSettings: DOM.id("dht-ctrl-settings"),
				btnTrack: DOM.id("dht-ctrl-track"),
				btnDownload: DOM.id("dht-ctrl-download"),
				btnReset: DOM.id("dht-ctrl-reset"),
				btnClose: DOM.id("dht-ctrl-close"),
				textStatus: DOM.id("dht-ctrl-status"),
				textCount: DOM.id("dht-ctrl-count"),
				/** @type {HTMLInputElement} */ inputUpload: DOM.id("dht-ctrl-upload-input")
			};

			controller.ui.btnUpload.addEventListener("click", () => {
				controller.ui.inputUpload.click();
			});

			controller.ui.inputUpload.addEventListener("change", () => {
				Array.prototype.forEach.call(controller.ui.inputUpload.files, readUploadedFile);
				controller.ui.inputUpload.value = null;
			});

			controller.ui.btnSettings.addEventListener("click", () => {
				this.showSettings();
			});

			controller.ui.btnTrack.addEventListener("click", () => {
				const isTracking = !STATE.isTracking();
				STATE.setIsTracking(isTracking);

				if (!isTracking) {
					controller.ui.textStatus.innerText = "Stopped";
				}
			});

			controller.ui.btnDownload.addEventListener("click", () => {
				STATE.downloadSavefile();
			});

			controller.ui.btnReset.addEventListener("click", () => {
				if (!STATE.hasUnsavedChanges() || confirm("Discard all tracked messages that have not been downloaded?")) {
					STATE.resetState();
				}
			});

			controller.ui.btnClose.addEventListener("click", () => {
				if (STATE.hasUnsavedChanges() && !confirm("Some tracked messages have not been downloaded yet, and will be lost if you close Discord History Tracker. Close anyway?")) {
					return;
				}

				STATE.setIsTracking(false);
				this.hideController();
				this.hideSettings();
				this.deleteTrackingStyles();
				window.DHT_ON_UNLOAD.forEach(f => f());
				delete window.DHT_ON_UNLOAD;
				delete window.DHT_LOADED;
			});

			STATE.onTrackingStateChanged(updateControllerButtons);

			STATE.onStateChanged(() => {
				updateControllerButtons();
				updateControllerCounts();
			});

			SETTINGS.onSettingsChanged(settingsChangedEvent);
			updateControllerCounts();
		},

		hideController() {
			if (controller) {
				DOM.removeElement(controller.ele);
				DOM.removeElement(controller.styles);
				controller = null;
			}
		},

		showSettings() {
			if (settings) {
				return;
			}

			const radio = (type, id, label) => "<label><input id='dht-cfg-" + type + "-" + id + "' name='dht-" + type + "' type='radio'> " + label + "</label><br>";
			const html = `
<label><input id='dht-cfg-autoscroll' type='checkbox'> Autoscroll</label><br>
<label><input id='dht-cfg-hide-previews-while-autoscrolling' type='checkbox'> Hide previews to improve browser performance</label><br>
<br>
<label>After reaching the first message in channel...</label><br>
${radio("afm", "nothing", "Continue Tracking")}
${radio("afm", "pause", "Pause Tracking")}
${radio("afm", "switch", "Switch to Next Channel")}
<br>
<label>After reaching a previously saved message...</label><br>
${radio("asm", "nothing", "Continue Tracking")}
${radio("asm", "pause", "Pause Tracking")}
${radio("asm", "switch", "Switch to Next Channel")}
<p id='dht-cfg-note'>Tracked messages are only kept in this tab. Use <b>Download</b> to save them, and <b>Upload &amp; Combine</b> to continue an existing archive.</p>`;

			settings = {
				styles: DOM.createStyle(`#dht-cfg-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: #000;
  opacity: 0.5;
  display: block;
  z-index: 1000001;
}

#dht-cfg {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 800px;
  max-width: calc(100% - 32px);
  box-sizing: border-box;
  transform: translate(-50%, -50%);
  line-height: 120%;
  padding: 8px;
  background-color: #fff;
  color: #000;
  font-size: 14px;
  z-index: 1000002;
}

#dht-cfg label {
  display: inline-block;
  margin: 1px 0;
}

#dht-cfg-note {
  margin: 12px 0 0;
  color: #555;
}`),
				overlay: DOM.createElement("div", document.body, "dht-cfg-overlay"),
				ele: DOM.createElement("div", document.body, "dht-cfg", html)
			};

			settings.overlay.addEventListener("click", () => {
				this.hideSettings();
			});

			settings.ui = {
				/** @type {HTMLInputElement} */ cbAutoscroll: DOM.id("dht-cfg-autoscroll"),
				/** @type {HTMLInputElement} */ cbHidePreviewsWhileAutoscrolling: DOM.id("dht-cfg-hide-previews-while-autoscrolling"),
				/** @type {Object.<number, HTMLInputElement>} */ optsAfterFirstMsg: {},
				/** @type {Object.<number, HTMLInputElement>} */ optsAfterSavedMsg: {}
			};

			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_NOTHING] = DOM.id("dht-cfg-afm-nothing");
			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_PAUSE] = DOM.id("dht-cfg-afm-pause");
			settings.ui.optsAfterFirstMsg[CONSTANTS.AUTOSCROLL_ACTION_SWITCH] = DOM.id("dht-cfg-afm-switch");

			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_NOTHING] = DOM.id("dht-cfg-asm-nothing");
			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_PAUSE] = DOM.id("dht-cfg-asm-pause");
			settings.ui.optsAfterSavedMsg[CONSTANTS.AUTOSCROLL_ACTION_SWITCH] = DOM.id("dht-cfg-asm-switch");

			settings.ui.cbAutoscroll.addEventListener("change", () => {
				SETTINGS.autoscroll = settings.ui.cbAutoscroll.checked;
			});

			settings.ui.cbHidePreviewsWhileAutoscrolling.addEventListener("change", () => {
				SETTINGS.hidePreviewsWhileAutoscrolling = settings.ui.cbHidePreviewsWhileAutoscrolling.checked;
			});

			Object.keys(settings.ui.optsAfterFirstMsg).forEach(key => {
				settings.ui.optsAfterFirstMsg[key].addEventListener("click", () => {
					SETTINGS.afterFirstMsg = key;
				});
			});

			Object.keys(settings.ui.optsAfterSavedMsg).forEach(key => {
				settings.ui.optsAfterSavedMsg[key].addEventListener("click", () => {
					SETTINGS.afterSavedMsg = key;
				});
			});

			settingsChangedEvent();
		},

		hideSettings() {
			if (settings) {
				DOM.removeElement(settings.overlay);
				DOM.removeElement(settings.ele);
				DOM.removeElement(settings.styles);
				settings = null;
			}
		},

		setStatus(state) {
			if (controller) {
				controller.ui.textStatus.innerText = state;
			}
		},

		createTrackingStyles() {
			if (trackingStyles) {
				return;
			}

			let style = "";

			if (SETTINGS.autoscroll && SETTINGS.hidePreviewsWhileAutoscrolling) {
				style += `div[id^="message-accessories-"] { display: none; }`;
			}

			if (style.length > 0) {
				trackingStyles = DOM.createStyle(style);
			}
		},

		deleteTrackingStyles() {
			if (trackingStyles) {
				DOM.removeElement(trackingStyles);
				trackingStyles = null;
			}
		}
	};
})();
/*
 * Adapted from the browser-only version of Discord History Tracker (branch master-browser-only, v.31h).
 * Produces the legacy archive format, which can be opened in viewer.html or imported into the desktop app
 * (Database > Import Legacy Archive).
 *
 * SAVEFILE STRUCTURE
 * ==================
 *
 * {
 *   meta: {
 *     users: {
 *       <discord user id>: {
 *         name: <user name>,
 *         avatar: <user icon>,
 *         tag: <user discriminator> // only present if not a bot
 *       }, ...
 *     },
 *
 *     // the user index is an array of discord user ids,
 *     // these indexes are used in the message objects to save space
 *     userindex: [
 *       <discord user id>, ...
 *     ],
 *
 *     servers: [
 *       {
 *         name: <server name>,
 *         type: <"SERVER"|"GROUP"|DM">
 *       }, ...
 *     ],
 *
 *     channels: {
 *       <discord channel id>: {
 *         server: <server index in the meta.servers array>,
 *         name: <channel name>,
 *         position: <order in channel list>, // only present if server type == SERVER
 *         topic: <channel topic>,            // only present if server type == SERVER
 *         nsfw: <channel NSFW status>        // only present if server type == SERVER
 *       }, ...
 *     }
 *   },
 *
 *   data: {
 *     <discord channel id>: {
 *       <discord message id>: {
 *         u: <user index of the sender>,
 *         t: <message timestamp>,
 *         m: <message content>, // only present if not empty
 *         te: <edit timestamp>, // only present if edited
 *         e: [ // omit for no embeds
 *           {
 *             url: <embed url>,
 *             type: <embed type>,
 *             t: <rich embed title>,      // only present if type == rich, and if not empty
 *             d: <rich embed description> // only present if type == rich, and if not empty
 *           }, ...
 *         ],
 *         a: [ // omit for no attachments
 *           {
 *             url: <attachment url>
 *           }, ...
 *         ],
 *         r: <reply message id>, // only present if referencing another message (reply)
 *         re: [ // omit for no reactions
 *           {
 *             c: <react count>
 *             n: <emoji name>,         // only present if the emoji has a name
 *             id: <emoji id>,          // only present for custom emoji
 *             an: <emoji is animated>, // only present for custom animated emoji
 *           }, ...
 *         ]
 *       }, ...
 *     }, ...
 *   }
 * }
 *
 *
 * TEMPORARY OBJECT STRUCTURE
 * ==========================
 *
 * {
 *   userlookup: {
 *     <discord user id>: <user index in the meta.userindex array>
 *   },
 *   channelkeys: Set<channel id>,
 *   messagekeys: Set<message id>,
 * }
 */

class SAVEFILE {
	constructor(parsedObj) {
		if (!SAVEFILE.isValid(parsedObj)) {
			parsedObj = {
				meta: {},
				data: {}
			};
		}

		this.meta = parsedObj.meta;
		this.data = parsedObj.data;

		this.meta.users = this.meta.users || {};
		this.meta.userindex = this.meta.userindex || [];
		this.meta.servers = this.meta.servers || [];
		this.meta.channels = this.meta.channels || {};

		this.tmp = {
			userlookup: {},
			channelkeys: new Set(),
			messagekeys: new Set()
		};
	}

	static isValid(parsedObj) {
		return !!parsedObj && typeof parsedObj.meta === "object" && typeof parsedObj.data === "object";
	}

	static getDate(date) {
		if (date instanceof Date) {
			return date;
		}
		else {
			// noinspection JSUnresolvedReference
			return date.toDate();
		}
	}

	findOrRegisterUser(userId, userName, userDiscriminator, userAvatar) {
		const wasPresent = userId in this.meta.users;
		const userObj = wasPresent ? this.meta.users[userId] : {};

		userObj.name = userName;

		if (userDiscriminator) {
			userObj.tag = userDiscriminator;
		}

		if (userAvatar) {
			userObj.avatar = userAvatar;
		}

		if (!wasPresent) {
			this.meta.users[userId] = userObj;
			this.meta.userindex.push(userId);
			return this.tmp.userlookup[userId] = this.meta.userindex.length - 1;
		}
		else if (!(userId in this.tmp.userlookup)) {
			return this.tmp.userlookup[userId] = this.meta.userindex.findIndex(id => id === userId);
		}
		else {
			return this.tmp.userlookup[userId];
		}
	}

	findOrRegisterServer(serverName, serverType) {
		const index = this.meta.servers.findIndex(server => server.name === serverName && server.type === serverType);

		if (index === -1) {
			this.meta.servers.push({
				"name": serverName,
				"type": serverType
			});

			return this.meta.servers.length - 1;
		}
		else {
			return index;
		}
	}

	tryRegisterChannel(serverIndex, channelId, channelName, extraInfo) {
		if (!this.meta.servers[serverIndex]) {
			return undefined;
		}

		const wasPresent = channelId in this.meta.channels;
		const channelObj = wasPresent ? this.meta.channels[channelId] : { "server": serverIndex };

		channelObj.name = channelName;

		if (typeof extraInfo.position === "number" && extraInfo.position >= 0) {
			channelObj.position = extraInfo.position;
		}

		if (typeof extraInfo.topic === "string" && extraInfo.topic.length > 0) {
			channelObj.topic = extraInfo.topic;
		}

		if (typeof extraInfo.nsfw === "boolean") {
			channelObj.nsfw = extraInfo.nsfw;
		}

		this.tmp.channelkeys.add(channelId);

		if (wasPresent) {
			return false;
		}
		else {
			this.meta.channels[channelId] = channelObj;
			return true;
		}
	}

	addMessage(channelId, messageId, messageObject) {
		const container = this.data[channelId] || (this.data[channelId] = {});
		const wasPresent = messageId in container;

		container[messageId] = messageObject;
		this.tmp.messagekeys.add(messageId);
		return !wasPresent;
	}

	/**
	 * @param {DiscordMessage} discordMessage
	 */
	convertToMessageObject(discordMessage) {
		const author = discordMessage.author;

		const obj = {
			u: this.findOrRegisterUser(author.id, author.username, author.bot ? null : author.discriminator, author.avatar),
			t: SAVEFILE.getDate(discordMessage.timestamp).getTime()
		};

		if (discordMessage.content.length > 0) {
			obj.m = discordMessage.content;
		}

		if (discordMessage.editedTimestamp !== null) {
			obj.te = SAVEFILE.getDate(discordMessage.editedTimestamp).getTime();
		}

		if (discordMessage.embeds.length > 0) {
			obj.e = discordMessage.embeds.map(embed => {
				const conv = {
					url: embed.url,
					type: embed.type
				};

				if (embed.type === "rich") {
					const title = SAVEFILE.getEmbedText(embed.rawTitle, embed.title);
					const description = SAVEFILE.getEmbedText(embed.rawDescription, embed.description);

					if (title) {
						conv.t = title;

						if (description) {
							conv.d = description;
						}
					}
				}

				return conv;
			});
		}

		if (discordMessage.attachments.length > 0) {
			obj.a = discordMessage.attachments.map(attachment => ({
				url: attachment.url
			}));
		}

		if (discordMessage.messageReference && discordMessage.messageReference.message_id) {
			obj.r = discordMessage.messageReference.message_id;
		}

		const reactions = (discordMessage.reactions || []).filter(reaction => reaction.count > 0 && (reaction.emoji.id || reaction.emoji.name));

		if (reactions.length > 0) {
			obj.re = reactions.map(reaction => {
				const emoji = reaction.emoji;
				const conv = {
					c: reaction.count
				};

				if (emoji.name) {
					conv.n = emoji.name;
				}

				if (emoji.id) {
					conv.id = emoji.id;
				}

				if (emoji.animated) {
					conv.an = true;
				}

				return conv;
			});
		}

		return obj;
	}

	/**
	 * Current Discord stores plain embed text in rawTitle / rawDescription, older versions used single-element arrays.
	 */
	static getEmbedText(rawText, legacyText) {
		if (typeof rawText === "string") {
			return rawText;
		}

		if (Array.isArray(legacyText) && legacyText.length === 1 && typeof legacyText[0] === "string") {
			return legacyText[0];
		}

		return null;
	}

	addMessagesFromDiscord(discordMessageArray) {
		let hasNewMessages = false;

		for (const discordMessage of discordMessageArray) {
			if (this.addMessage(discordMessage.channel_id, discordMessage.id, this.convertToMessageObject(discordMessage))) {
				hasNewMessages = true;
			}
		}

		return hasNewMessages;
	}

	countChannels() {
		return this.tmp.channelkeys.size;
	}

	countMessages() {
		return this.tmp.messagekeys.size;
	}

	combineWith(obj) {
		const userMap = {};
		let shownError = false;

		for (const userId in obj.meta.users) {
			const oldUser = obj.meta.users[userId];
			userMap[obj.meta.userindex.findIndex(id => id === userId)] = this.findOrRegisterUser(userId, oldUser.name, oldUser.tag, oldUser.avatar);
		}

		for (const channelId in obj.meta.channels) {
			const oldChannel = obj.meta.channels[channelId];
			const oldServer = obj.meta.servers[oldChannel.server];

			if (oldServer) {
				this.tryRegisterChannel(this.findOrRegisterServer(oldServer.name, oldServer.type), channelId, oldChannel.name, oldChannel /* filtered later */);
			}
		}

		for (const channelId in obj.data) {
			const oldMessages = obj.data[channelId];

			for (const messageId in oldMessages) {
				const oldMessage = oldMessages[messageId];
				const oldUser = oldMessage.u;

				if (oldUser in userMap) {
					oldMessage.u = userMap[oldUser];
					this.addMessage(channelId, messageId, oldMessage);
				}
				else {
					if (!shownError) {
						shownError = true;
						alert("The uploaded archive appears to be corrupted, some messages will be skipped. See console for details.");

						console.error("[DHT] User list:", obj.meta.users);
						console.error("[DHT] User index:", obj.meta.userindex);
						console.error("[DHT] Generated mapping:", userMap);
						console.error("[DHT] Missing user for the following messages:");
					}

					console.error(oldMessage);
				}
			}
		}
	}

	toJson() {
		return JSON.stringify({
			"meta": this.meta,
			"data": this.data
		});
	}
}
const CONSTANTS = {
	AUTOSCROLL_ACTION_NOTHING: "optNothing",
	AUTOSCROLL_ACTION_PAUSE: "optPause",
	AUTOSCROLL_ACTION_SWITCH: "optSwitch"
};

let IS_FIRST_RUN = false;

const SETTINGS = (function() {
	const settingsChangedEvents = [];
	
	const saveSettings = function() {
		DOM.saveToCookie("DHT_SETTINGS", root, 60 * 60 * 24 * 365 * 5);
	};
	
	const triggerSettingsChanged = function(property) {
		for (const callback of settingsChangedEvents) {
			callback(property);
		}
		
		saveSettings();
	};
	
	const defineTriggeringProperty = function(obj, property, value) {
		const name = "_" + property;
		
		Object.defineProperty(obj, property, {
			get: (() => obj[name]),
			set: (value => {
				obj[name] = value;
				triggerSettingsChanged(property);
			})
		});
		
		obj[name] = value;
	};
	
	const defaults = {
		"_autoscroll": true,
		"_hidePreviewsWhileAutoscrolling": true,
		"_afterFirstMsg": CONSTANTS.AUTOSCROLL_ACTION_PAUSE,
		"_afterSavedMsg": CONSTANTS.AUTOSCROLL_ACTION_PAUSE,
	};
	
	let loaded = DOM.loadFromCookie("DHT_SETTINGS");
	let hasChanged = false;
	
	if (!loaded) {
		loaded = defaults;
		IS_FIRST_RUN = true;
	}
	else {
		for (const property in defaults) {
			if (!(property in loaded)) {
				loaded[property] = defaults[property];
				hasChanged = true;
			}
		}
	}
	
	const root = {
		onSettingsChanged(callback) {
			settingsChangedEvents.push(callback);
		}
	};
	
	defineTriggeringProperty(root, "autoscroll", loaded._autoscroll);
	defineTriggeringProperty(root, "hidePreviewsWhileAutoscrolling", loaded._hidePreviewsWhileAutoscrolling);
	defineTriggeringProperty(root, "afterFirstMsg", loaded._afterFirstMsg);
	defineTriggeringProperty(root, "afterSavedMsg", loaded._afterSavedMsg);
	
	if (IS_FIRST_RUN || hasChanged) {
		saveSettings();
	}
	
	return root;
})();
/*
 * Replaces the desktop app's state.js, which sends everything to the app's local server.
 * This version keeps the archive in memory (see savefile.js) and lets the user download it as a file.
 */
const STATE = (function() {
	/**
	 * @param {DiscordChannel} channel
	 */
	const getPrivateChannelName = function(channel) {
		if (channel.name) {
			return channel.name;
		}
		else {
			return (channel.rawRecipients || []).map(user => user.username).join(", ") || channel.id;
		}
	};

	/**
	 * @param {Number} type
	 */
	const getChannelTypeName = function(type) {
		if (type === DISCORD.CHANNEL_TYPE.DM) {
			return "DM";
		}
		else if (type === DISCORD.CHANNEL_TYPE.GROUP_DM) {
			return "GROUP";
		}
		else {
			return "SERVER";
		}
	};

	const getDefaultFileName = function() {
		const now = new Date();
		const pad = num => String(num).padStart(2, "0");
		return "dht-" + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + ".txt";
	};

	const stateChangedListeners = [];
	const trackingStateChangedListeners = [];

	let savefile = null;
	let isTracking = false;
	let hasUnsavedChanges = false;
	let lastFileName = null;

	const triggerStateChanged = function(changeType, changeDetail) {
		for (const callback of stateChangedListeners) {
			callback(changeType, changeDetail);
		}
	};

	const markChanged = function(changeDetail) {
		hasUnsavedChanges = true;
		triggerStateChanged("data", changeDetail);
	};

	return {
		/**
		 * Adds a listener that is called whenever the saved data changes. The callback receives a type and a detail string.
		 */
		onStateChanged(callback) {
			stateChangedListeners.push(callback);
		},

		onTrackingStateChanged(callback) {
			trackingStateChangedListeners.push(callback);
			callback(isTracking);
		},

		isTracking() {
			return isTracking;
		},

		setIsTracking(state) {
			if (isTracking !== state) {
				isTracking = state;

				for (const callback of trackingStateChangedListeners) {
					callback(isTracking);
				}
			}
		},

		/**
		 * Returns the savefile object, creates a new one if needed.
		 * @returns {SAVEFILE}
		 */
		getSavefile() {
			if (!savefile) {
				savefile = new SAVEFILE();
			}

			return savefile;
		},

		hasSavedData() {
			return savefile !== null;
		},

		hasUnsavedChanges() {
			return hasUnsavedChanges;
		},

		/**
		 * Discards all tracked data.
		 */
		resetState() {
			savefile = null;
			hasUnsavedChanges = false;
			lastFileName = null;
			triggerStateChanged("data", "reset");
		},

		/**
		 * Combines current savefile with a previously downloaded one.
		 * @param {String} fileName
		 * @param {SAVEFILE} uploadedSavefile
		 */
		uploadSavefile(fileName, uploadedSavefile) {
			const hadUnsavedChanges = hasUnsavedChanges;

			lastFileName = fileName;
			this.getSavefile().combineWith(uploadedSavefile);

			// Uploading the first archive into an empty session does not create anything new that needs saving.
			hasUnsavedChanges = hadUnsavedChanges;
			triggerStateChanged("data", "upload");
		},

		/**
		 * Triggers a download of the savefile, if there is any data.
		 */
		downloadSavefile() {
			if (!savefile) {
				return;
			}

			const blob = new Blob([ savefile.toJson() ], { type: "application/octet-stream" });
			const url = window.URL.createObjectURL(blob);

			const link = DOM.createElement("a", document.body);
			link.href = url;
			link.download = lastFileName || getDefaultFileName();
			link.style.display = "none";
			link.click();

			DOM.removeElement(link);
			window.setTimeout(() => window.URL.revokeObjectURL(url), 60 * 1000);

			hasUnsavedChanges = false;
			triggerStateChanged("data", "download");
		},

		/**
		 * @param {?DiscordGuild} serverInfo
		 * @param {DiscordChannel} channelInfo
		 */
		addDiscordChannel(serverInfo, channelInfo) {
			const serverType = getChannelTypeName(channelInfo.type);
			let serverName;
			let channelName;

			if (DISCORD.CHANNEL_TYPE.isPrivate(channelInfo.type)) {
				serverName = channelName = getPrivateChannelName(channelInfo);
			}
			else if (serverInfo) {
				serverName = serverInfo.name;
				channelName = channelInfo.name;
			}
			else {
				return;
			}

			const extra = {};

			if ("nsfw" in channelInfo) {
				extra.nsfw = channelInfo.nsfw;
			}

			if ("topic" in channelInfo) {
				extra.topic = channelInfo.topic;
			}

			if ("position" in channelInfo) {
				extra.position = channelInfo.position;
			}

			const sf = this.getSavefile();

			if (sf.tryRegisterChannel(sf.findOrRegisterServer(serverName, serverType), channelInfo.id, channelName, extra) === true) {
				markChanged("channel");
			}
		},

		/**
		 * Adds all messages from the array, and returns true if any of them were not saved before.
		 * @param {DiscordMessage[]} discordMessageArray
		 */
		addDiscordMessages(discordMessageArray) {
			discordMessageArray = discordMessageArray.filter(msg => (msg.type === DISCORD.MESSAGE_TYPE.DEFAULT || msg.type === DISCORD.MESSAGE_TYPE.REPLY || msg.type === DISCORD.MESSAGE_TYPE.THREAD_STARTER) && msg.state === "SENT");

			if (discordMessageArray.length === 0) {
				return false;
			}

			const anyNewMessages = this.getSavefile().addMessagesFromDiscord(discordMessageArray);
			markChanged("messages");
			return anyNewMessages;
		}
	};
})();
/**
 * @name DiscordGuild
 * @property {String} id
 * @property {String} name
 * @property {String|null|undefined} [icon]
 */

/**
 * @name DiscordChannel
 * @property {String} id
 * @property {String} name
 * @property {Number} type
 * @property {String} [guild_id]
 * @property {String} [parent_id]
 * @property {Number} [position]
 * @property {String} [topic]
 * @property {Boolean} [nsfw]
 * @property {String|null|undefined} [icon]
 * @property {DiscordUser[]} [rawRecipients]
 */

/**
 * @name DiscordUser
 * @property {String} id
 * @property {String} username
 * @property {String} discriminator
 * @property {String} [globalName]
 * @property {String} [avatar]
 * @property {Boolean} [bot]
 */

/**
 * @name DiscordMessage
 * @property {String} id
 * @property {String} channel_id
 * @property {DiscordUser} author
 * @property {String} content
 * @property {Date} timestamp
 * @property {Date|null} editedTimestamp
 * @property {DiscordAttachment[]} attachments
 * @property {Object[]} embeds
 * @property {DiscordMessageReaction[]} [reactions]
 * @property {DiscordMessageReference} [messageReference]
 * @property {Number} type
 * @property {String} state
 */

/**
 * @name DiscordAttachment
 * @property {String} id
 * @property {String} filename
 * @property {String} [content_type]
 * @property {String} size
 * @property {String} url
 */

/**
 * @name DiscordMessageReaction
 * @property {DiscordEmoji} emoji
 * @property {Number} count
 */

/**
 * @name DiscordMessageReference
 * @property {String} [message_id]
 */

/**
 * @name DiscordEmoji
 * @property {String|null} id
 * @property {String|null} name
 * @property {Boolean} animated
 */

/**
 * @name MessageData
 * @type {Object}
 * @property {String} channelId
 * @property {Boolean} ready
 * @property {Boolean} loadingMore
 * @property {Boolean} hasMoreAfter
 * @property {Boolean} hasMoreBefore
 * @property {Array<DiscordMessage>} _array
 */

	if (!DISCORD.isCompatible()) {
		alert("Discord History Tracker is not compatible with this version of Discord. See the browser console for details.");
		return;
	}

	window.DHT_LOADED = true;
	window.DHT_ON_UNLOAD = [];

	const onBeforeUnload = function(e) {
		if (STATE.hasUnsavedChanges()) {
			e.preventDefault();
			e.returnValue = "";
		}
	};

	window.addEventListener("beforeunload", onBeforeUnload);
	window.DHT_ON_UNLOAD.push(() => window.removeEventListener("beforeunload", onBeforeUnload));

	let delayedStopRequests = 0;
	const stopTrackingDelayed = function(callback) {
		delayedStopRequests++;

		window.setTimeout(() => {
			STATE.setIsTracking(false);
			delayedStopRequests--;

			if (callback) {
				callback();
			}
		}, 200); // give the user visual feedback after clicking the button before switching off
	};

	let hasJustStarted = false;
	let isSending = false;

	const onError = function(e) {
		console.error("[DHT]", e);
		GUI.setStatus("Error");
		stopTrackingDelayed(() => isSending = false);
	};

	const isNoAction = function(action) {
		return action === null || action === CONSTANTS.AUTOSCROLL_ACTION_NOTHING;
	};

	const onTrackingContinued = function(anyNewMessages, hasMoreBefore) {
		if (!STATE.isTracking()) {
			return;
		}

		GUI.setStatus("Tracking");

		if (hasJustStarted) {
			anyNewMessages = true;
			hasJustStarted = false;
		}

		isSending = false;

		if (SETTINGS.autoscroll) {
			let action = null;

			if (!hasMoreBefore) {
				console.debug("[DHT] Reached first message.");
				action = SETTINGS.afterFirstMsg;
			}
			if (isNoAction(action) && !anyNewMessages) {
				console.debug("[DHT] No new messages.");
				action = SETTINGS.afterSavedMsg;
			}

			if (isNoAction(action)) {
				DISCORD.loadOlderMessages();
			}
			else if (action === CONSTANTS.AUTOSCROLL_ACTION_PAUSE || (action === CONSTANTS.AUTOSCROLL_ACTION_SWITCH && !DISCORD.selectNextTextChannel())) {
				GUI.setStatus("Reached End");
				STATE.setIsTracking(false);
			}
		}
	};

	let waitUntilSendingFinishedTimer = null;

	const onMessagesUpdated = async (server, channel, messages, hasMoreBefore) => {
		if (!STATE.isTracking() || delayedStopRequests > 0) {
			return;
		}

		if (isSending) {
			window.clearTimeout(waitUntilSendingFinishedTimer);

			waitUntilSendingFinishedTimer = window.setTimeout(() => {
				waitUntilSendingFinishedTimer = null;
				onMessagesUpdated(server, channel, messages, hasMoreBefore);
			}, 100);

			return;
		}

		isSending = true;

		try {
			STATE.addDiscordChannel(server, channel);
		} catch (e) {
			onError(e);
			return;
		}

		try {
			if (!messages.length) {
				isSending = false;
				onTrackingContinued(false, hasMoreBefore);
			}
			else {
				const anyNewMessages = STATE.addDiscordMessages(messages);
				onTrackingContinued(anyNewMessages, hasMoreBefore);
			}
		} catch (e) {
			onError(e);
		}
	};

	const starter = DISCORD.setupMessageCallback(onMessagesUpdated);

	STATE.onTrackingStateChanged(enabled => {
		if (enabled) {
			GUI.setStatus("Starting");
			GUI.createTrackingStyles();
			hasJustStarted = true;

			if (!starter()) {
				stopTrackingDelayed(() => alert("Cannot see any messages."));
				hasJustStarted = false;
			}
		}
		else {
			isSending = false;
			GUI.deleteTrackingStyles();
		}
	});

	GUI.showController();

	if (IS_FIRST_RUN) {
		GUI.showSettings();
	}
})();
	}

	function onTriggerClicked() {
		try {
			startTracker();
		} catch (e) {
			console.error("[DHT] Could not start Discord History Tracker.", e);
			alert("Could not start Discord History Tracker, see the browser console for details.");
		}
	}

	function getHelpIcon() {
		return document.querySelector("div[class*='bar'] a[href$='://support.discord.com'] > div[class*='clickable'] > svg");
	}

	function installInlineTrigger() {
		const existing = document.getElementById(INLINE_TRIGGER_ID);
		if (existing && existing.isConnected) {
			return true;
		}

		const helpIcon = getHelpIcon();
		if (!helpIcon) {
			return false;
		}

		const helpIconWrapper = helpIcon.parentElement;
		const helpIconLink = helpIconWrapper.parentElement;

		const button = document.createElement("div");
		button.id = INLINE_TRIGGER_ID;
		button.setAttribute("role", "button");
		button.setAttribute("title", "Discord History Tracker");
		button.setAttribute("class", helpIconWrapper.getAttribute("class") || "");
		button.innerHTML = `<svg viewBox="0 0 24 20" fill="currentColor" class="${helpIcon.getAttribute("class") || ""}" style="width: auto;">${ICON_PATHS}</svg>`;
		button.addEventListener("click", onTriggerClicked);

		helpIconLink.insertAdjacentElement("afterend", button);
		return true;
	}

	function setFloatingTriggerVisible(visible) {
		const existing = document.getElementById(FLOATING_TRIGGER_ID);

		if (!visible) {
			existing?.remove();
			return;
		}

		if (existing) {
			return;
		}

		const button = document.createElement("div");
		button.id = FLOATING_TRIGGER_ID;
		button.setAttribute("role", "button");
		button.setAttribute("title", "Discord History Tracker");
		button.innerHTML = `<svg viewBox="0 0 24 20" fill="currentColor" style="width: 30px; height: 25px; display: block;">${ICON_PATHS}</svg>`;
		button.style.cssText = "position: fixed; right: 16px; bottom: 96px; z-index: 999999; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: #fff; background-color: #5865f2; opacity: 0.6;";
		button.addEventListener("mouseenter", () => button.style.opacity = "1");
		button.addEventListener("mouseleave", () => button.style.opacity = "0.6");
		button.addEventListener("click", onTriggerClicked);

		document.body.appendChild(button);
	}

	let hasInstalledInlineTrigger = false;
	let canShowFloatingTrigger = false;

	function updateTriggers() {
		if (installInlineTrigger()) {
			hasInstalledInlineTrigger = true;
			setFloatingTriggerVisible(false);
		}
		else if (canShowFloatingTrigger && !hasInstalledInlineTrigger) {
			setFloatingTriggerVisible(true);
		}
	}

	let isUpdateScheduled = false;

	new MutationObserver(() => {
		if (!isUpdateScheduled) {
			isUpdateScheduled = true;

			window.setTimeout(() => {
				isUpdateScheduled = false;
				updateTriggers();
			}, 100);
		}
	}).observe(document.body, { childList: true, subtree: true });

	window.setTimeout(() => {
		canShowFloatingTrigger = true;
		updateTriggers();
	}, FLOATING_TRIGGER_DELAY_MS);

	updateTriggers();
})();
