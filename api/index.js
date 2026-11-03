// Vercel function: every /api/* request is rewritten here (see vercel.json) with ?route=<path>.
const { handle } = require("../server/router");

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const route = url.searchParams.get("route") || url.pathname.replace(/^\/api\/?/, "");
  url.searchParams.delete("route");
  req.url = url.pathname + url.search;
  return handle(req, res, route);
};
