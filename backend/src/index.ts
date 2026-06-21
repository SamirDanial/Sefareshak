import AppSingleton from "./app";

// Initialize and start the application
const app = AppSingleton.getInstance();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  app.gracefulShutdown();
});

process.on("SIGINT", () => {
  app.gracefulShutdown();
});

// Start the server
app.start().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
