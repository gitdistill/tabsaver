// DOM Element Retrieval
const areaSelect = document.getElementsByName('areatag')[0];
const subjectSelect = document.getElementsByName('subjecttags')[0];
const saveCurrentWindowTabsButton = document.getElementById('saveCurrentWindowTabs');
const viewSavedItemsButton = document.getElementById('viewSavedItems');

// Global Constants
const displayPageUrl = chrome.runtime.getURL('display.html');

// Initial state of subject select
const initialSubjectOptions = subjectSelect.innerHTML;

// Data for populating select options
const optionMap = {
    home: [
        'furniture',
        'homeware',
        'clothing',
        'workshop',
        'inspiration'
    ],
    library: [
        'music',
        'film',
        'television',
        'animation',
        'comics',
        'manga',
        'books',
        'adult'
    ],
    visual: [
        'painting',
        'illustration',
        'graphicdesign',
        'typography',
        'photography',
        'filmmaking',
        '3d&vfx',
        'sculpture',
        'fashion',
        'inspiration'
    ],
    physical: [
        'woodworking',
        'electronics',
        '3dprinting&laser',
        'metalwork',
        '3d&cad',
        'inspiration'
    ],
    audio: [
        'gear',
        'studio',
        'production',
        'songwriting',
        'sounddesign',
        'sampling',
        'arrangement',
        'recording&mixing',
        'musictheory',
        'musicology',
        'practice',
        'inspiration'
    ],
    textual: [
        'copywriting',
        'technical',
        'creativewriting',
        'screenwriting',
        'worldbuilding',
        'storytelling',
        'inspiration'
    ],
    health: [
        'mental',
        'physcial',
        'fitness'
    ],
    wealth: [
        'career',
        'freelancing',
        'resume',
        'investment',
        'entrepreneurship'
    ]
};

// Helper function to create and append an option to a select element
const addOption = (selectElement, text) => {
    const option = document.createElement('option');
    option.value = text;
    option.textContent = text;
    selectElement.append(option);
};

// Function to populate the subject select based on the selected area
const populateSubjectOptions = (selectedArea) => {
    subjectSelect.innerHTML = '';
    subjectSelect.disabled = !optionMap[selectedArea];
    if (optionMap[selectedArea]) {
        optionMap[selectedArea].forEach(text => addOption(subjectSelect, text));
    }
};

// Function to handle saving the current window's tabs and groups
const handleSaveCurrentWindowTabs = async () => {
    try {
        const currentWindow = await chrome.windows.getCurrent({ populate: true });
        
        if (!currentWindow || !currentWindow.tabs || currentWindow.tabs.length === 0) {
            return;
        }

        const { savedItemsByWindow = {} } = await chrome.storage.local.get({ savedItemsByWindow: {} });
        const { id: windowId, tabs } = currentWindow;

        const savedTabUrls = Object.values(savedItemsByWindow)
            .flatMap(windowData => [...(windowData.ungroupedTabs || []), ...(windowData.tabGroups || []).flatMap(group => group.tabs.map(tab => ({ url: tab.url })))]);
        const processedGroupIds = new Set();
        const ungroupedTabsToSave = [];
        const tabGroupsToSave = [];

        const areaSelectElement = document.getElementById('area');
        const subjectSelectElement = document.getElementById('subject');
        const areaTag = areaSelectElement.value;
        const selectedSubjectTags = Array.from(subjectSelectElement.selectedOptions)
            .map(option => option.value)
            .filter(value => value !== 'untagged' && value !== 'Subjects');

        const tagsArray = [
            areaTag && areaTag !== 'area' ? areaTag.trim() : null,
            ...selectedSubjectTags.map(tag => tag.trim()),
        ].filter(Boolean);

        const displayPageUrl = chrome.runtime.getURL('display.html');

        for (const currentTab of tabs) {
            if (currentTab.url === displayPageUrl) continue;
            const isDuplicate = savedTabUrls.some(savedTab => savedTab.url === currentTab.url);
            if (!isDuplicate) {
                if (currentTab.groupId === -1) {
                    ungroupedTabsToSave.push({ id: crypto.randomUUID(), type: 'tab', url: currentTab.url, title: currentTab.title, savedAt: new Date().toISOString(), tags: tagsArray, groupId: -1, favIconUrl: currentTab.favIconUrl });
                } else if (!processedGroupIds.has(currentTab.groupId)) {
                    processedGroupIds.add(currentTab.groupId);
                    const group = await chrome.tabGroups.get(currentTab.groupId);
                    const groupTabs = tabs.filter(tab => tab.groupId === currentTab.groupId).map(tab => ({ url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl }));
                    tabGroupsToSave.push({ id: crypto.randomUUID(), type: 'group', title: group.title, color: group.color, savedAt: new Date().toISOString(), tags: tagsArray, tabs: groupTabs });
                }
            } else {
                chrome.runtime.sendMessage({ action: 'userMessage', message: `Skipping duplicate tab: ${currentTab.url}` });
            }
        }

        const updatedWindowData = {
            ungroupedTabs: [...(savedItemsByWindow[windowId]?.ungroupedTabs || []), ...ungroupedTabsToSave],
            tabGroups: [...(savedItemsByWindow[windowId]?.tabGroups || []), ...tabGroupsToSave],
        };

        if (updatedWindowData.ungroupedTabs.length > 0 || updatedWindowData.tabGroups.length > 0) {
            const updatedSavedItemsByWindow = {
                ...savedItemsByWindow,
                [windowId]: updatedWindowData,
            };
            await chrome.storage.local.set({ savedItemsByWindow: updatedSavedItemsByWindow });
            chrome.runtime.sendMessage({ action: 'userMessage', message: 'Tabs saved successfully!' });

            // Close the current window and then ask the service worker to handle display.html
            chrome.windows.remove(currentWindow.id, () => {
                chrome.runtime.sendMessage({ action: 'openDisplayPage' });
            });

        } else {
            chrome.runtime.sendMessage({ action: 'userMessage', message: 'No new tabs or groups to save' });
            window.close(); // Still close the popup even if nothing was saved
        }

    } catch (error) {
        const errorMessage = `Error saving: ${error}`;
        chrome.runtime.sendMessage({ action: 'logMessage', message: errorMessage });
        chrome.runtime.sendMessage({ action: 'userMessage', message: "There was a problem saving!" });
    }
};

// Function to handle opening the display page (now simpler)
const handleViewSavedItems = () => {
    chrome.tabs.create({ url: 'display.html', pinned: true });
};

// Event Listeners Setup
document.addEventListener('DOMContentLoaded', () => {
    // Initialize subject select
    subjectSelect.disabled = true;
    subjectSelect.innerHTML = '';
    Object.keys(optionMap).forEach(text => addOption(areaSelect, text));

    // Populate subject options on area change
    areaSelect.addEventListener('change', (event) => populateSubjectOptions(event.target.value));

    // Attach click listener to save button
    if (saveCurrentWindowTabsButton) {
        saveCurrentWindowTabsButton.addEventListener('click', handleSaveCurrentWindowTabs);
    }

    // Attach click listener to view saved items button
    if (viewSavedItemsButton) {
        viewSavedItemsButton.addEventListener('click', handleViewSavedItems);
    }
});















// {
//   "savedItemsByWindow": {
//     "windowId_123": {
//       "ungroupedTabs": [
//         {
//           "id": "uuid1",
//           "type": "tab",
//           "url": "...",
//           "title": "...",
//           "savedAt": "...",
//           "tags": [],
//           "groupId": -1 // Indicates not in a group
//         },
//         // ... more ungrouped tabs from this window
//       ],
//       "tabGroups": [
//         {
//           "id": "groupUuid1",
//           "type": "group",
//           "title": "Group Alpha",
//           "color": "blue",
//           "savedAt": "...",
//           "tags": [],
//           "tabs": [
//             { "url": "...", "title": "..." },
//             // ... tabs within the group
//           ]
//         },
//         // ... more tab groups from this window
//       ]
//     },
//     "windowId_456": {
//       "ungroupedTabs": [],
//       "tabGroups": []
//     },
//     // ... more windows
//   }
// }





//   const getTabsData = async () => {
//   const tabs = await chrome.tabs.query({currentWindow: true});

//   const urls = tabs.map(tab => tab.url);

//   const text = urls.join("\n"); // Convert array of URLs to newline-separated text

//   const headOpen = '---' + '\n' + 'tags:' + '\n';
//   const areaTag = '- ' + areaSelect.value + '\n';
//   const subjectTag = '- ' + subjectSelect.value + '\n';
//   const headClose = '---' + '\n';

//   const head = headOpen + areaTag + subjectTag + headClose;

//   const blob = new Blob([head + text], {type: "text/markdown"});
//   const url = URL.createObjectURL(blob);

//   const currentDate = new Date().toISOString().slice(0, 10); // Get current date in YYYY-MM-DD format
//   const filename = areaSelect.value + `-${currentDate}.md`; // Include current date in filename

//   chrome.downloads.download({
//     url: url,
//     filename: filename,
//     saveAs: true
//   });
// };
