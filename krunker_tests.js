// Tests for the verified-team safety gate in v2.3; run with Node.js. exemple: node krunker_tests.js
'use strict';

const assert = require('node:assert/strict');

const MAX_AGE = 1500;

function verifiedTeamOf(o, t = 10000) {
  const ud = o?.userData;
  const v = ud?.team;
  const updatedAt = ud?.teamUpdatedAt;

  if (
    ud?.teamVerified !== true ||
    !(typeof v === 'string' || typeof v === 'number') ||
    !Number.isFinite(updatedAt) ||
    updatedAt > t ||
    t - updatedAt > MAX_AGE
  ) {
    return null;
  }

  return {
    id: String(v),
    updatedAt
  };
}

function isConfirmedEnemy(
  local,
  localTeam,
  actor,
  actorTeam,
  t = 10000
) {
  if (
    !actor ||
    actor === local ||
    !local ||
    !localTeam ||
    !actorTeam
  ) {
    return false;
  }

  const lt = verifiedTeamOf(local, t);
  const at = verifiedTeamOf(actor, t);

  if (
    !lt ||
    !at ||
    lt.id !== localTeam.id ||
    at.id !== actorTeam.id
  ) {
    return false;
  }

  return at.id !== lt.id;
}

const player = (
  team,
  verified = true,
  updatedAt = 9900
) => ({
  userData: {
    team,
    teamVerified: verified,
    teamUpdatedAt: updatedAt
  }
});

const local = player('blue');
const localTeam = verifiedTeamOf(local);

assert.equal(
  isConfirmedEnemy(local, localTeam, local, localTeam),
  false,
  'local excluded'
);

const ally = player('blue');

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    ally,
    verifiedTeamOf(ally)
  ),
  false,
  'ally excluded'
);

const enemy = player('red');

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    enemy,
    verifiedTeamOf(enemy)
  ),
  true,
  'fresh confirmed enemy accepted'
);

const unknown = player('red', false);

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    unknown,
    verifiedTeamOf(unknown)
  ),
  false,
  'unverified team rejected'
);

const stale = player('red', true, 7000);

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    stale,
    verifiedTeamOf(stale)
  ),
  false,
  'stale team rejected'
);

const future = player('red', true, 10001);

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    future,
    verifiedTeamOf(future)
  ),
  false,
  'future timestamp rejected'
);

const changed = player('green');

assert.equal(
  isConfirmedEnemy(
    local,
    localTeam,
    changed,
    verifiedTeamOf(changed)
  ),
  true,
  'fresh different team accepted'
);

console.log('7/7 verified-team safety tests passed.');
