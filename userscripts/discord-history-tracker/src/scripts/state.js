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
