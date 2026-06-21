// content-showverse.js - Host origin registry and event bridge

console.log("[The Show Verse Extension] Web bridge active.");

// 1. Automatically register the origin if it matches The Show Verse branding
const bodyText = document.body ? document.body.innerText : "";
const pageTitle = document.title || "";
const isShowVerse = 
  pageTitle.toLowerCase().includes("show verse") || 
  pageTitle.toLowerCase().includes("showverse") || 
  bodyText.includes("The Show Verse") || 
  bodyText.includes("showverse");

if (isShowVerse) {
  const origin = window.location.origin;
  chrome.runtime.sendMessage({ action: "registerOrigin", origin }, (response) => {
    console.log("[The Show Verse Extension] Registered host origin:", origin);
  });
}

// 2. Listen to details request from the settings page
document.addEventListener("request-netflix-details", () => {
  console.log("[The Show Verse Extension] Web page requested Netflix details.");
  
  chrome.runtime.sendMessage({ action: "getNetflixDetails" }, (response) => {
    console.log("[The Show Verse Extension] Received Netflix details from background service worker:", response);
    
    // Dispatch the response back to the webpage
    document.dispatchEvent(new CustomEvent("response-netflix-details", {
      detail: response
    }));
  });
});
