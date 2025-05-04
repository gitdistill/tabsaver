// Helper function to create a DOM element with optional classes and text content
const createElement = (tag, classes = [], textContent = '') => {
    const element = document.createElement(tag);
    element.classList.add(...classes);
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
};

// Helper function to render a single tab item (ungrouped or in a group)
const renderTabListItem = (tab, windowId, savedItemsByWindow, displaySavedItems, isGrouped = false, group = null) => {
    const listItem = createElement('li', isGrouped ? ['group-tab-item'] : ['tab-item']);
    listItem.dataset.windowId = windowId;
    const favicon = createElement('img');
    favicon.src = tab.favIconUrl || 'link.svg';
    favicon.classList.add('favicon-icon'); // Add the CSS class

    const titleSpan = createElement('span', [], tab.title);

    listItem.append(favicon, titleSpan);
    listItem.addEventListener('click', (event) => {
        const handler = isGrouped ? handleGroupTabClick : handleTabClick;
        handler(event, tab, group, windowId, savedItemsByWindow, displaySavedItems);
    });
    return listItem;
};

// Function to render the ungrouped tabs section
const renderUngroupedTabs = (ungroupedTabs, windowId, savedItemsByWindow, displaySavedItems) => {
    if (!ungroupedTabs || ungroupedTabs.length === 0) {
        return null;
    }
    const ungroupedSection = createElement('div', ['ungrouped-tabs-section']);
    const ungroupedList = createElement('ul');
    ungroupedTabs.forEach(tab => {
        ungroupedList.appendChild(renderTabListItem(tab, windowId, savedItemsByWindow, displaySavedItems));
    });
    ungroupedSection.appendChild(ungroupedList);
    return ungroupedSection;
};

// Function to render a single tab group
const renderTabGroup = (group, windowId, savedItemsByWindow, displaySavedItems) => {
    const groupSection = createElement('div', ['tab-group-section']);
    const groupTitle = createElement('h3', ['group-title'], group.title);
    groupTitle.style.backgroundColor = group.color;
    groupSection.style.borderColor = group.color;
    groupTitle.addEventListener('click', () => group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url })));
    groupSection.appendChild(groupTitle);

    if (group.tabs && group.tabs.length > 0) {
        const groupTabsList = createElement('ul');
        group.tabs.forEach(tab => {
            groupTabsList.appendChild(renderTabListItem(tab, windowId, savedItemsByWindow, displaySavedItems, true, group));
        });
        groupSection.appendChild(groupTabsList);
    }
    return groupSection;
};

// Function to render the tab groups section TODO: add ability to restore and delete individual tab groups, as well as ability to rename tab group
const renderTabGroups = (tabGroups, windowId, savedItemsByWindow, displaySavedItems) => {
    if (!tabGroups || tabGroups.length === 0) {
        return null;
    }
    const groupsContainer = document.createElement('div'); // Optional container for all groups
    tabGroups.forEach(group => {
        groupsContainer.appendChild(renderTabGroup(group, windowId, savedItemsByWindow, displaySavedItems));
    });
    return groupsContainer;
};

// Event handler for clicking an ungrouped tab
function handleTabClick(event, tab, group, windowId, savedItemsByWindow, displaySavedItems) {
    const actualWindowId = event.target.closest('li').dataset.windowId;
    // chrome.runtime.sendMessage({ action: 'log', message: `handleTabClick - Window ID: ${actualWindowId}` });
    // chrome.runtime.sendMessage({ action: 'log', message: `handleTabClick - savedItemsByWindow Keys: ${JSON.stringify(Object.keys(savedItemsByWindow))}` });

    chrome.tabs.create({ url: tab.url, active: false }); // Open in new tab, active based on meta key

    if (!event.metaKey) {
        const updatedSavedItemsByWindow = { ...savedItemsByWindow };
        if (updatedSavedItemsByWindow[actualWindowId]) {
            updatedSavedItemsByWindow[actualWindowId].ungroupedTabs = (updatedSavedItemsByWindow[actualWindowId].ungroupedTabs || []).filter(t => t.url !== tab.url);

            // Check if the window is now empty (no tab groups and no ungrouped tabs)
            if (!(updatedSavedItemsByWindow[actualWindowId].tabGroups && updatedSavedItemsByWindow[actualWindowId].tabGroups.length > 0) &&
                !(updatedSavedItemsByWindow[actualWindowId].ungroupedTabs && updatedSavedItemsByWindow[actualWindowId].ungroupedTabs.length > 0)) {
                delete updatedSavedItemsByWindow[actualWindowId]; // Remove the entire window entry
                // chrome.runtime.sendMessage({ action: 'log', message: `handleTabClick - Removed empty window: ${actualWindowId}` });
            }

            chrome.storage.local.set({ savedItemsByWindow: updatedSavedItemsByWindow }, () => displaySavedItems(updatedSavedItemsByWindow));
        }
    }
}

// Event handler for clicking a tab within a group
function handleGroupTabClick(event, tab, group, windowId, savedItemsByWindow, displaySavedItems) {
    chrome.tabs.create({ url: tab.url });
    if (!event.metaKey) {
        const windowGroups = savedItemsByWindow[windowId].tabGroups || [];
        const groupIndex = windowGroups.findIndex(g => g.id === group.id);
        if (groupIndex !== -1) {
            windowGroups[groupIndex].tabs = windowGroups[groupIndex].tabs.filter(t => t.url !== tab.url);
            if (windowGroups[groupIndex].tabs.length === 0) {
                windowGroups.splice(groupIndex, 1);
            }
            chrome.storage.local.set({ savedItemsByWindow }, () => displaySavedItems(savedItemsByWindow));
        }
    }
}

// Event handler for clicking the delete button
function handleDeleteWindowClick(windowId, savedItemsByWindow, displaySavedItems) {
    if (confirm(`Are you sure you want to delete all saved items for Window ID: ${windowId}?`)) {
        delete savedItemsByWindow[windowId];
        chrome.storage.local.set({ savedItemsByWindow }, () => displaySavedItems(savedItemsByWindow));
    }
}

// Event handler for clicking the restore button
function handleRestoreWindowClick(windowData, windowId, savedItemsByWindow, displaySavedItems) {
    const tabsToCreate = [
        ...(windowData.ungroupedTabs || []).map(tab => ({ url: tab.url })),
        ...(windowData.tabGroups || []).flatMap(group => group.tabs.map(tab => ({ url: tab.url }))),
    ];
    chrome.windows.create({ url: tabsToCreate.map(t => t.url) }, () => {
        delete savedItemsByWindow[windowId];
        chrome.storage.local.set({ savedItemsByWindow }, () => displaySavedItems(savedItemsByWindow));
    });
}

// Main function to display saved items
function displaySavedItems(savedItemsByWindow) {
    // chrome.runtime.sendMessage({ action: 'log', message: 'displaySavedItems - Initial savedItemsByWindow:' });
    // chrome.runtime.sendMessage({ action: 'log', message: JSON.stringify(savedItemsByWindow) });
    const container = document.getElementById('savedItemsContainer');
    container.innerHTML = '';

    if (Object.keys(savedItemsByWindow).length === 0) {
        container.textContent = 'No items saved yet.';
        return;
    }

    const windowIds = Object.keys(savedItemsByWindow).reverse();

    windowIds.forEach(windowId => {
        const windowData = savedItemsByWindow[windowId];
        const windowSection = createElement('div', ['window-section']);
        const windowTitleBar = createElement('div', ['window-title-bar']);
        const windowTitle = createElement('h2', ['window-title']);
        windowTitle.textContent = '';

        // get all tab tags from either grouped or ungrouped tabs
        const allWindowTags = new Set();
        (windowData.ungroupedTabs || []).forEach(tab => {
            if (Array.isArray(tab.tags)) {
                tab.tags.forEach(allWindowTags.add, allWindowTags);
            }
        });
        (windowData.tabGroups || []).forEach(group => {
            if (Array.isArray(group.tags)) {
                group.tags.forEach(allWindowTags.add, allWindowTags);
            }
            (group.tabs || []).forEach(tab => {
                if (Array.isArray(tab.tags)) {
                    tab.tags.forEach(allWindowTags.add, allWindowTags);
                }
            });
        });

        // build tag array and create dom elements
        const tagsArray = Array.from(allWindowTags).filter(Boolean);
        if (tagsArray.length > 0) {
            tagsArray.forEach(tag => {
                const tagSpan = createElement('span', ['window-tag'], `#${tag}`);
                windowTitle.appendChild(tagSpan);
            });
        } else {
            windowTitle.textContent += `Window ID: ${windowId} (untagged)`;
        }

        windowTitleBar.appendChild(windowTitle);

        // build window actions, delete and restore buttons and assign handlers
        const windowActions = createElement('div', ['window-actions']);
        const createButton = (textContent, onClick) => {
            const button = createElement('button', [], textContent);
            button.addEventListener('click', onClick);
            return button;
        };

        const deleteButton = createButton('Delete', () => handleDeleteWindowClick(windowId, savedItemsByWindow, displaySavedItems));
        const restoreButton = createButton('Restore', () => handleRestoreWindowClick(windowData, windowId, savedItemsByWindow, displaySavedItems));

        windowActions.append(deleteButton, restoreButton);
        windowTitleBar.appendChild(windowActions);
        windowSection.appendChild(windowTitleBar);

        const ungroupedTabsSection = renderUngroupedTabs(windowData.ungroupedTabs, windowId, savedItemsByWindow, displaySavedItems);
        if (ungroupedTabsSection) {
            windowSection.appendChild(ungroupedTabsSection);
        }

        const tabGroupsSection = renderTabGroups(windowData.tabGroups, windowId, savedItemsByWindow, displaySavedItems);
        if (tabGroupsSection) {
            windowSection.appendChild(tabGroupsSection);
        }

        container.appendChild(windowSection);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.action === 'userMessage' && request.message) {
        const displayElement = document.getElementById('message-display');
        if (displayElement) {
          const messageElement = document.createElement('p');
          messageElement.textContent = request.message;
          displayElement.appendChild(messageElement);

          // Optional: Automatically clear messages after a few seconds
          setTimeout(() => {
            if (displayElement.contains(messageElement)) {
              displayElement.removeChild(messageElement);
            }
          }, 6000);
        }
      }
    }
  );
});

// Event listener to load and display saved items
chrome.storage.local.get({ savedItemsByWindow: {} }, function(data) {
    // chrome.runtime.sendMessage({ action: 'log', message: 'Storage Get Callback - savedItemsByWindow:' });
    // chrome.runtime.sendMessage({ action: 'log', message: JSON.stringify(data.savedItemsByWindow) });
    displaySavedItems(data.savedItemsByWindow);
});