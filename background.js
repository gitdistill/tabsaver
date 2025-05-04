console.log('Service worker started.');

chrome.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
        console.log("[Background Script] Received message:", request);
        if (request.action === "log") {
            console.log(`[From ${sender.tab ? 'Tab ' + sender.tab.id : 'Extension'}] ${request.message}`);
        } else if (request.action === "logMessage") {
            console.log(`[Message] ${request.message}`);
        } else if (request.action === "openDisplayPage") {
            const displayTabs = await chrome.tabs.query({ url: chrome.runtime.getURL('display.html') });
            if (displayTabs.length > 0) {
                await chrome.tabs.update(displayTabs[0].id, { active: true, highlighted: true });
                console.log("[Background Script] Focused existing display.html tab.");
            } else {
                console.log("[Background Script] No display.html found. Finding another window to open it in (pinned)...");
                const windows = await chrome.windows.getAll();
                let targetWindowId = null;

                // Iterate through all open windows and pick one that is not the current one
                const currentWindow = await chrome.windows.getCurrent();
                for (const window of windows) {
                    if (window.id !== currentWindow.id) {
                        targetWindowId = window.id;
                        break; // Found a different window
                    }
                }

                // If no other window is found, we can create a new one
                if (!targetWindowId && windows.length > 0) {
                    console.log("[Background Script] No other window found, creating a new one.");
                    const newWindow = await chrome.windows.create();
                    targetWindowId = newWindow.id;
                } else if (!targetWindowId && windows.length === 0) {
                    console.log("[Background Script] No windows found, creating a new one.");
                    const newWindow = await chrome.windows.create();
                    targetWindowId = newWindow.id;
                }

                if (targetWindowId) {
                    const newTab = await chrome.tabs.create({ windowId: targetWindowId, url: chrome.runtime.getURL('display.html'), active: true, pinned: true }); // Pinned is now true
                    console.log(`[Background Script] display.html tab created and pinned in window ${targetWindowId}:`, newTab);
                } else {
                    console.error("[Background Script] Could not find or create a window to open display.html.");
                }
            }
        }
    }
);