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
				styles: DOM.createStyle(`/*[CSS-CONTROLLER]*/`),
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
				styles: DOM.createStyle(`/*[CSS-SETTINGS]*/`),
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
