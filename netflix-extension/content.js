// content.js - Netflix watch observer for The Show Verse

let lastSyncedVideoId = null;
let checkInterval = null;

console.log("[The Show Verse] Netflix Observer loaded and monitoring.");

function getTitleFromTabTitle() {
  const title = document.title;
  if (!title || title === "Netflix" || title === "Netflix - Watch" || title.includes("loading")) {
    return null;
  }

  // Example: "Wednesday | Netflix"
  const parts = title.split(" | ");
  if (parts.length > 1 && parts[parts.length - 1].trim() === "Netflix") {
    return { mainTitle: parts[0].trim(), subTitle: "" };
  }

  // Example: "Wednesday - Netflix"
  const parts2 = title.split(" - ");
  if (parts2.length > 1 && parts2[parts2.length - 1].trim() === "Netflix") {
    if (parts2.length > 2) {
      const main = parts2[0].trim();
      const sub = parts2.slice(1, parts2.length - 1).join(" - ").trim();
      return { mainTitle: main, subTitle: sub };
    }
    return { mainTitle: parts2[0].trim(), subTitle: "" };
  }

  // Example: "Stranger Things: Season 4: Episode 1" (no | Netflix)
  if (title.toLowerCase().includes("netflix")) {
    const cleanTitle = title.replace(/\s*[-|]\s*netflix/i, "").trim();
    return { mainTitle: cleanTitle, subTitle: "" };
  }

  return { mainTitle: title.trim(), subTitle: "" };
}

function scrapeNetflixPlayer() {
  // 1. Try standard selectors for Netflix watch controls overlay (mounted when active)
  const selectors = [
    '[data-uia="video-title"]',
    '.video-title',
    '.player-status-metadata',
    '.ellipsize-text',
    '.playable-title',
    '.hls-player-title'
  ];

  let container = null;
  for (const selector of selectors) {
    container = document.querySelector(selector);
    if (container) break;
  }

  if (container) {
    const h4 = container.querySelector('h4') || 
               container.querySelector('.player-status-main-title') || 
               container.children[0];
    const span = container.querySelector('span') || 
                 container.querySelector('.player-status-sub-title') || 
                 container.children[1];

    const mainTitle = h4 ? h4.textContent.trim() : container.textContent.trim();
    const subTitle = span ? span.textContent.trim() : '';

    if (mainTitle && mainTitle !== "Netflix") {
      return { mainTitle, subTitle };
    }
  }

  // 2. Fallback: Parse from Document/Tab Title if elements are not mounted (controls faded out)
  const tabMetadata = getTitleFromTabTitle();
  if (tabMetadata && tabMetadata.mainTitle && tabMetadata.mainTitle !== "Netflix") {
    return tabMetadata;
  }

  return null;
}

function runObserver() {
  const watchUrlMatch = window.location.href.match(/netflix\.com\/watch\/(\d+)/);
  if (!watchUrlMatch) {
    // Not watching anything
    lastSyncedVideoId = null;
    return;
  }

  const videoId = watchUrlMatch[1];
  if (videoId === lastSyncedVideoId) return;

  const metadata = scrapeNetflixPlayer();
  if (!metadata || !metadata.mainTitle || metadata.mainTitle.toLowerCase() === "netflix") {
    // Retry in next tick (overlay hidden or title not loaded yet)
    return;
  }

  console.log(`[The Show Verse] Playback detected: "${metadata.mainTitle}" - "${metadata.subTitle}" (Video ID: ${videoId})`);

  // Send message to background script to sync watch event
  chrome.runtime.sendMessage({
    action: "syncNetflix",
    videoId,
    mainTitle: metadata.mainTitle,
    subTitle: metadata.subTitle
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[The Show Verse] Communication error with background script:", chrome.runtime.lastError);
      return;
    }
    if (response && response.success) {
      console.log(`[The Show Verse] Successfully synced: "${metadata.mainTitle}"`);
      // Update local state to avoid duplicate syncs for this video ID
      lastSyncedVideoId = videoId;
    } else {
      console.warn("[The Show Verse] Sync deferred or failed:", response?.error || "Unknown error");
    }
  });
}

// Check every 1000ms to guarantee responsive capture before player overlay fades
if (checkInterval) clearInterval(checkInterval);
checkInterval = setInterval(runObserver, 1000);
