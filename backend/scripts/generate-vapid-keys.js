const webpush = require("web-push");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("\n=== VAPID Keys Generated ===\n");
console.log("Public Key:", vapidKeys.publicKey);
console.log("\nPrivate Key:", vapidKeys.privateKey);
console.log("\n=== Add these to your .env file ===\n");
console.log("VAPID_PUBLIC_KEY=" + vapidKeys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + vapidKeys.privateKey);
console.log("VAPID_SUBJECT=mailto:info@nextfoody.com");
console.log("\n");

