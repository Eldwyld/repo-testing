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
