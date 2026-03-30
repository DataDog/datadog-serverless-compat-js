// Unless explicitly stated otherwise all files in this repository are licensed
// under the Apache License Version 2.0.
// This product includes software developed at Datadog (https://www.datadoghq.com/).
// Copyright 2016-Present Datadog, Inc.

'use strict';

// Usage: node scripts/update-optional-deps.js <version>
// Updates all optionalDependencies in package.json to the given version.

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/update-optional-deps.js <version>');
  process.exit(1);
}

const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

for (const dep of Object.keys(pkg.optionalDependencies)) {
  pkg.optionalDependencies[dep] = version;
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated optionalDependencies to ${version}`);
