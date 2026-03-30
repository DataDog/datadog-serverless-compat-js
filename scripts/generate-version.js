// Unless explicitly stated otherwise all files in this repository are licensed
// under the Apache License Version 2.0.
// This product includes software developed at Datadog (https://www.datadoghq.com/).
// Copyright 2016-Present Datadog, Inc.

'use strict';

const { writeFileSync } = require('fs');
const { join } = require('path');

const version = require('../package.json').version;
const content = `export const LIB_VERSION = ${JSON.stringify(version)};\n`;
writeFileSync(join(__dirname, '..', 'src', 'version.ts'), content);
