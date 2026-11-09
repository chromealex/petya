// Holding back Petya's own non-urgent system notifications during a focus session now goes through the
// notification policy core (src/features/notification-policy.cjs): the focus app is one of its policies
// (policy.cjs). This module keeps the old names for callers and tests: the same wrapper and urgency rule.
const policy=require('../../features/notification-policy.cjs');
module.exports={install:policy.install,urgent:policy.urgent,URGENT:policy.URGENT};
