"use strict";

var notification;

notification = document.createElement("div");
notification.textContent = "Firefox Extension says: 'Allo 'Allo!";
notification.classList.add("hello-world");

console.log("Injecting extension...");
document.body.insertBefore(notification, document.body.firstChild);

// connect to the webpack dev server
browser.runtime.connect();
