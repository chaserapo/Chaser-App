// Custom entry point (replaces "expo-router/entry" as package.json "main").
//
// Sentry must be initialized before expo-router (and therefore every route
// module under app/) is required, otherwise a crash thrown while a route
// module is being evaluated - not just a React render error - would happen
// before Sentry's global error handler is installed and go unreported.
//
// require() (not import) is used here deliberately: import statements are
// hoisted and would still let expo-router's module graph evaluate first.
require("./src/lib/sentry");

require("expo-router/entry");
