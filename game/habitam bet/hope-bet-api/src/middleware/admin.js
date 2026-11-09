const { adminOrSuperRequired } = require("./auth");

function adminRequired(req, res, next) {
  return adminOrSuperRequired(req, res, next);
}

module.exports = { adminRequired };
