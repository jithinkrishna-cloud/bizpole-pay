// Super Admin control centre API (/api/super/*). Every route here must carry { platform: true }:
// router.authorize() then requires User.platformRole = SUPER_ADMIN and skips merchant membership checks.
// test/authorize.test.js fails the build if a route in this module is not platform-gated.
// Read-only, apart from the CSV-export audit row and payment provider settings / organisation provider accounts (./providers.js),
// which are audited and need the operator's password again for Live changes.

module.exports = [
  // The signed-in operator. Used by super.html to confirm platform access before rendering.
  ["GET", "/super/session", async ({ auth }) => ({
    user: { name: auth.user.name, email: auth.user.email },
    platformRole: auth.platformRole,
  }), { platform: true }],
  ...require("./overview"),
  ...require("./orgs"),
  ...require("./users"),
  ...require("./finance"),
  ...require("./integrations"),
  ...require("./providers"),
  ...require("./audit"),
];
