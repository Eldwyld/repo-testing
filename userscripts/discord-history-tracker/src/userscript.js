// ==UserScript==
// @name         Discord History Tracker (Standalone)
// @namespace    https://github.com/eldwyld/repo-testing
// @version      /*[VERSION]*/
// @description  Browser-only build of Discord History Tracker /*[UPSTREAM]*/. Tracks message history and saves it to a file, without the desktop app.
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
 * This is an unofficial repackaging of its tracking script (/*[UPSTREAM]*/) that keeps tracked messages in the browser
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
		/*[TRACKER]*/
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
