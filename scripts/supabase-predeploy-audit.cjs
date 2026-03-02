#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const argSet = new Set(argv);

if (argSet.has('--help') || argSet.has('-h')) {
  console.log([
    'Supabase Pre-Deployment Audit',
    '',
    'Usage:',
    '  node scripts/supabase-predeploy-audit.cjs [options]',
    '',
    'Options:',
    '  --target=supabase      Audit target (default: supabase)',
    '  --skip-typecheck       Skip server/client TypeScript checks',
    '  --skip-build           Skip server/client production builds',
    '  --strict               Treat warnings as failures',
  ].join('\n'));
  process.exit(0);
}

const argMap = Object.fromEntries(
  argv
    .filter(token => token.startsWith('--') && token.includes('='))
    .map(token => {
      const index = token.indexOf('=');
      return [token.slice(2, index), token.slice(index + 1)];
    }),
);

const target = String(argMap.target || 'supabase').trim().toLowerCase();
const strict = argSet.has('--strict');
const skipTypecheck = argSet.has('--skip-typecheck');
const skipBuild = argSet.has('--skip-build');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const tally = {
  pass: 0,
  fail: 0,
  warn: 0,
  skip: 0,
};
const failures = [];
const warnings = [];

const statusMap = {
  PASS: 'pass',
  FAIL: 'fail',
  WARN: 'warn',
  SKIP: 'skip',
};

function printResult(status, id, message, detail = '') {
  const key = statusMap[status];
  if (key) tally[key] += 1;
  if (status === 'FAIL') failures.push(`${id}: ${message}`);
  if (status === 'WARN') warnings.push(`${id}: ${message}`);

  console.log(`[${status}] ${id} ${message}`);
  if (detail) console.log(`       ${detail}`);
}

function trimOutput(raw, maxLines = 20) {
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);
  if (lines.length <= maxLines) return lines.join(' | ');
  return `... ${lines.slice(-maxLines).join(' | ')}`;
}

function runCommand(id, cmd, args, cwd = ROOT) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    printResult('PASS', id, `${cmd} ${args.join(' ')} completed`);
    return true;
  }

  const detail = trimOutput(`${result.stdout || ''}\n${result.stderr || ''}`);
  printResult('FAIL', id, `${cmd} ${args.join(' ')} failed`, detail || `Exit code ${String(result.status)}`);
  return false;
}

function readFileSafe(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function readJsonSafe(relativePath) {
  const content = readFileSafe(relativePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function parseDotEnv(content) {
  const parsed = {};
  if (!content) return parsed;

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadMergedEnv() {
  const envExample = parseDotEnv(readFileSafe(path.join('server', '.env.example')));
  const envLocal = parseDotEnv(readFileSafe(path.join('server', '.env')));
  return { ...envExample, ...envLocal, ...process.env };
}

function hasDependency(packageJson, dependencyName) {
  if (!packageJson) return false;
  return Boolean(
    (packageJson.dependencies && packageJson.dependencies[dependencyName]) ||
    (packageJson.devDependencies && packageJson.devDependencies[dependencyName]),
  );
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function listSqlFiles(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const results = [];
  const stack = [absoluteDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function isLikelyJwt(value) {
  const token = String(value || '').trim();
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}

function maskUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch (_error) {
    return '(invalid URL)';
  }
}

async function runApiChecks(env) {
  const baseUrlRaw = String(env.AUDIT_API_URL || '').trim();
  if (!baseUrlRaw) {
    printResult('SKIP', 'API.BASE_URL', 'AUDIT_API_URL not set, skipping live API checks');
    return;
  }

  if (typeof fetch !== 'function') {
    printResult('WARN', 'API.FETCH', 'Global fetch is unavailable in this Node runtime');
    return;
  }

  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  const tutorToken = String(env.AUDIT_TUTOR_TOKEN || '').trim();
  const learnerToken = String(env.AUDIT_LEARNER_TOKEN || '').trim();
  const learnerStudentId = String(env.AUDIT_LEARNER_STUDENT_ID || '').trim();
  const crossStudentId = String(env.AUDIT_CROSS_STUDENT_ID || '').trim();

  const callApi = async (pathSuffix, token) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${baseUrl}${pathSuffix}`, { method: 'GET', headers });
    const bodyText = await response.text();

    let body = null;
    try {
      body = JSON.parse(bodyText);
    } catch (_error) {
      body = bodyText;
    }

    return { response, body };
  };

  try {
    const health = await callApi('/health');
    const ok = health.response.status === 200 && health.body && health.body.status === 'ok';
    if (ok) {
      printResult('PASS', 'API.HEALTH', `Health endpoint reachable at ${maskUrl(baseUrl)}`);
    } else {
      printResult('FAIL', 'API.HEALTH', 'Health endpoint did not return expected payload', `HTTP ${health.response.status}`);
    }
  } catch (error) {
    printResult('FAIL', 'API.HEALTH', 'Failed to call health endpoint', String(error.message || error));
    return;
  }

  try {
    const protectedCall = await callApi('/students');
    if (protectedCall.response.status === 401 || protectedCall.response.status === 403) {
      printResult('PASS', 'API.AUTH_GUARD', 'Unauthenticated call to /students is blocked');
    } else {
      printResult('FAIL', 'API.AUTH_GUARD', 'Unauthenticated call to /students is unexpectedly allowed', `HTTP ${protectedCall.response.status}`);
    }
  } catch (error) {
    printResult('FAIL', 'API.AUTH_GUARD', 'Failed to validate unauthenticated access guard', String(error.message || error));
  }

  if (!tutorToken) {
    printResult('SKIP', 'API.TUTOR_TOKEN', 'AUDIT_TUTOR_TOKEN not set, skipping tutor role checks');
  } else {
    try {
      const me = await callApi('/auth/me', tutorToken);
      if (me.response.status === 200) {
        printResult('PASS', 'API.TUTOR_TOKEN', 'Tutor/staff token accepted by /auth/me');
      } else {
        printResult('FAIL', 'API.TUTOR_TOKEN', 'Tutor/staff token rejected by /auth/me', `HTTP ${me.response.status}`);
      }
    } catch (error) {
      printResult('FAIL', 'API.TUTOR_TOKEN', 'Failed while validating tutor token', String(error.message || error));
    }
  }

  if (!learnerToken) {
    printResult('SKIP', 'API.LEARNER_TOKEN', 'AUDIT_LEARNER_TOKEN not set, skipping learner role checks');
    return;
  }

  try {
    const learnerForbidden = await callApi('/users', learnerToken);
    if (learnerForbidden.response.status === 401 || learnerForbidden.response.status === 403) {
      printResult('PASS', 'API.LEARNER_RESTRICTION', 'Learner token cannot access tutor-only /users endpoint');
    } else {
      printResult('FAIL', 'API.LEARNER_RESTRICTION', 'Learner token has unexpected access to /users', `HTTP ${learnerForbidden.response.status}`);
    }
  } catch (error) {
    printResult('FAIL', 'API.LEARNER_RESTRICTION', 'Failed while validating learner restrictions', String(error.message || error));
  }

  if (learnerStudentId) {
    try {
      const ownProgress = await callApi(`/progress/student/${encodeURIComponent(learnerStudentId)}`, learnerToken);
      if (ownProgress.response.status === 200) {
        printResult('PASS', 'API.LEARNER_OWN_DATA', 'Learner token can access own progress');
      } else {
        printResult('FAIL', 'API.LEARNER_OWN_DATA', 'Learner token could not access own progress', `HTTP ${ownProgress.response.status}`);
      }
    } catch (error) {
      printResult('FAIL', 'API.LEARNER_OWN_DATA', 'Failed while checking learner own-data access', String(error.message || error));
    }
  } else {
    printResult('SKIP', 'API.LEARNER_OWN_DATA', 'AUDIT_LEARNER_STUDENT_ID not set, skipping learner own-data check');
  }

  if (crossStudentId) {
    try {
      const crossProgress = await callApi(`/progress/student/${encodeURIComponent(crossStudentId)}`, learnerToken);
      if (crossProgress.response.status === 401 || crossProgress.response.status === 403) {
        printResult('PASS', 'API.LEARNER_CROSS_DATA', 'Learner token is blocked from cross-student progress');
      } else {
        printResult('FAIL', 'API.LEARNER_CROSS_DATA', 'Learner token can access cross-student progress', `HTTP ${crossProgress.response.status}`);
      }
    } catch (error) {
      printResult('FAIL', 'API.LEARNER_CROSS_DATA', 'Failed while checking cross-student restriction', String(error.message || error));
    }
  } else {
    printResult('SKIP', 'API.LEARNER_CROSS_DATA', 'AUDIT_CROSS_STUDENT_ID not set, skipping cross-student restriction check');
  }
}

function runStaticAudit(env) {
  const requiredFiles = [
    'README.md',
    'QUICK_CHECK.md',
    'server/.env.example',
    'server/src/index.ts',
    'server/src/config.ts',
    'server/src/routes/auth.ts',
  ];

  for (const relativePath of requiredFiles) {
    if (exists(relativePath)) {
      printResult('PASS', 'FILES.REQUIRED', `${relativePath} exists`);
    } else {
      printResult('FAIL', 'FILES.REQUIRED', `${relativePath} is missing`);
    }
  }

  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    printResult('FAIL', 'ENV.JWT_SECRET', 'JWT_SECRET is missing');
  } else if (jwtSecret.length < 32 || /replace|changeme|example|default/i.test(jwtSecret)) {
    printResult('FAIL', 'ENV.JWT_SECRET', 'JWT_SECRET appears weak or placeholder-like');
  } else {
    printResult('PASS', 'ENV.JWT_SECRET', 'JWT secret is populated and non-trivial');
  }

  const corsOrigins = parseOrigins(env.CORS_ORIGIN);
  if (corsOrigins.length === 0) {
    printResult('FAIL', 'ENV.CORS_ORIGIN', 'CORS_ORIGIN is missing or empty');
  } else if (corsOrigins.some(origin => origin === '*')) {
    printResult('FAIL', 'ENV.CORS_ORIGIN', 'CORS_ORIGIN contains wildcard (*)');
  } else {
    const invalidOrigins = [];
    for (const origin of corsOrigins) {
      if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) continue;
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) continue;
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:') invalidOrigins.push(origin);
      } catch (_error) {
        invalidOrigins.push(origin);
      }
    }

    if (invalidOrigins.length > 0) {
      printResult('FAIL', 'ENV.CORS_ORIGIN', 'One or more CORS origins are invalid or non-HTTPS', invalidOrigins.join(', '));
    } else {
      printResult('PASS', 'ENV.CORS_ORIGIN', 'CORS origin allowlist is explicit and valid');
    }
  }

  const frontendUrl = String(env.FRONTEND_URL || '').trim();
  if (!frontendUrl) {
    printResult('FAIL', 'ENV.FRONTEND_URL', 'FRONTEND_URL is missing');
  } else {
    try {
      new URL(frontendUrl);
      printResult('PASS', 'ENV.FRONTEND_URL', 'Frontend URL is configured');
    } catch (_error) {
      printResult('FAIL', 'ENV.FRONTEND_URL', 'FRONTEND_URL is not a valid URL');
    }
  }

  const allowSignup = String(env.ALLOW_INITIAL_TUTOR_SIGNUP || '').trim().toLowerCase();
  if (allowSignup === 'true') {
    printResult('FAIL', 'ENV.ALLOW_INITIAL_TUTOR_SIGNUP', 'ALLOW_INITIAL_TUTOR_SIGNUP must be false before user testing');
  } else {
    printResult('PASS', 'ENV.ALLOW_INITIAL_TUTOR_SIGNUP', 'Initial tutor signup gate is disabled');
  }

  const demoAdmin = String(env.BOOTSTRAP_DEMO_ADMIN || '').trim().toLowerCase();
  if (demoAdmin === 'true') {
    printResult('FAIL', 'ENV.BOOTSTRAP_DEMO_ADMIN', 'BOOTSTRAP_DEMO_ADMIN must be false before user testing');
  } else {
    printResult('PASS', 'ENV.BOOTSTRAP_DEMO_ADMIN', 'Demo admin bootstrap is disabled');
  }

  const serverPackage = readJsonSafe(path.join('server', 'package.json'));
  if (!serverPackage) {
    printResult('FAIL', 'PKG.SERVER', 'Cannot parse server/package.json');
    return;
  }

  if (target === 'supabase') {
    if (hasDependency(serverPackage, 'sqlite3')) {
      printResult('FAIL', 'SUPABASE.SQLITE_DEP', 'sqlite3 dependency is still present (Supabase target should use Postgres/Supabase client)');
    } else {
      printResult('PASS', 'SUPABASE.SQLITE_DEP', 'sqlite3 dependency removed from server package');
    }

    const hasSupabaseClient = hasDependency(serverPackage, '@supabase/supabase-js');
    const hasPgClient = hasDependency(serverPackage, 'pg');
    if (!hasSupabaseClient && !hasPgClient) {
      printResult('FAIL', 'SUPABASE.DB_CLIENT', 'No Supabase/Postgres client dependency found in server package');
    } else {
      printResult('PASS', 'SUPABASE.DB_CLIENT', 'Server package includes a Supabase/Postgres client dependency');
    }

    if (exists(path.join('supabase', 'config.toml'))) {
      printResult('PASS', 'SUPABASE.CONFIG', 'supabase/config.toml exists');
    } else {
      printResult('FAIL', 'SUPABASE.CONFIG', 'supabase/config.toml is missing');
    }

    const migrationFiles = listSqlFiles(path.join('supabase', 'migrations'));
    if (migrationFiles.length === 0) {
      printResult('FAIL', 'SUPABASE.MIGRATIONS', 'No SQL migrations found under supabase/migrations');
    } else {
      printResult('PASS', 'SUPABASE.MIGRATIONS', `${migrationFiles.length} migration file(s) found`);
    }

    if (exists(path.join('supabase', 'audit', 'predeploy_audit.sql'))) {
      printResult('PASS', 'SUPABASE.AUDIT_SQL', 'Supabase SQL audit pack is present');
    } else {
      printResult('FAIL', 'SUPABASE.AUDIT_SQL', 'supabase/audit/predeploy_audit.sql is missing');
    }

    const supabaseUrl = String(env.SUPABASE_URL || '').trim();
    if (!supabaseUrl) {
      printResult('FAIL', 'SUPABASE.ENV_URL', 'SUPABASE_URL is missing');
    } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
      printResult('FAIL', 'SUPABASE.ENV_URL', 'SUPABASE_URL format is invalid', maskUrl(supabaseUrl));
    } else {
      printResult('PASS', 'SUPABASE.ENV_URL', 'SUPABASE_URL format looks valid');
    }

    const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
    if (!anonKey) {
      printResult('FAIL', 'SUPABASE.ENV_ANON_KEY', 'SUPABASE_ANON_KEY is missing');
    } else if (!isLikelyJwt(anonKey)) {
      printResult('WARN', 'SUPABASE.ENV_ANON_KEY', 'SUPABASE_ANON_KEY does not look like a JWT token');
    } else {
      printResult('PASS', 'SUPABASE.ENV_ANON_KEY', 'SUPABASE_ANON_KEY is populated');
    }

    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!serviceRoleKey) {
      printResult('FAIL', 'SUPABASE.ENV_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY is missing');
    } else if (!isLikelyJwt(serviceRoleKey)) {
      printResult('WARN', 'SUPABASE.ENV_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY does not look like a JWT token');
    } else if (anonKey && anonKey === serviceRoleKey) {
      printResult('FAIL', 'SUPABASE.ENV_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY must not equal SUPABASE_ANON_KEY');
    } else {
      printResult('PASS', 'SUPABASE.ENV_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY is populated');
    }

    const dbUrl = String(env.SUPABASE_DB_URL || '').trim();
    if (!dbUrl) {
      printResult('WARN', 'SUPABASE.ENV_DB_URL', 'SUPABASE_DB_URL not set; migration tooling checks will be limited');
    } else if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
      printResult('FAIL', 'SUPABASE.ENV_DB_URL', 'SUPABASE_DB_URL is not a valid Postgres connection string');
    } else {
      printResult('PASS', 'SUPABASE.ENV_DB_URL', 'SUPABASE_DB_URL is configured');
    }
  } else {
    printResult('SKIP', 'SUPABASE.TARGET', `Target is "${target}", skipping Supabase-specific checks`);
  }
}

async function main() {
  console.log(`Supabase deployment audit started (target=${target}, strict=${strict})`);
  console.log('');

  const env = loadMergedEnv();
  runStaticAudit(env);

  if (!skipTypecheck) {
    runCommand('TS.SERVER', npxCmd, ['tsc', '-p', path.join('server', 'tsconfig.json'), '--noEmit']);
    runCommand('TS.CLIENT', npxCmd, ['tsc', '-p', path.join('client', 'tsconfig.json'), '--noEmit']);
  } else {
    printResult('SKIP', 'TS.SERVER', 'Typecheck skipped via --skip-typecheck');
    printResult('SKIP', 'TS.CLIENT', 'Typecheck skipped via --skip-typecheck');
  }

  if (!skipBuild) {
    runCommand('BUILD.SERVER', npmCmd, ['--prefix', 'server', 'run', 'build']);
    runCommand('BUILD.CLIENT', npmCmd, ['--prefix', 'client', 'run', 'build']);
  } else {
    printResult('SKIP', 'BUILD.SERVER', 'Build skipped via --skip-build');
    printResult('SKIP', 'BUILD.CLIENT', 'Build skipped via --skip-build');
  }

  await runApiChecks(env);

  console.log('');
  console.log('Audit Summary');
  console.log(`  PASS: ${tally.pass}`);
  console.log(`  FAIL: ${tally.fail}`);
  console.log(`  WARN: ${tally.warn}`);
  console.log(`  SKIP: ${tally.skip}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Blocking Findings');
    for (const finding of failures) {
      console.log(`  - ${finding}`);
    }
  }

  if (warnings.length > 0) {
    console.log('');
    console.log('Warnings');
    for (const finding of warnings) {
      console.log(`  - ${finding}`);
    }
  }

  if (tally.fail > 0) {
    process.exit(1);
  }

  if (strict && tally.warn > 0) {
    console.log('');
    console.log('Strict mode enabled: warnings are treated as failures.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Audit execution failed:', error);
  process.exit(1);
});
